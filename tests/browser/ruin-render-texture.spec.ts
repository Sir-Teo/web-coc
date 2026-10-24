import { expect, test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

test('phone ruin layer owns one unmasked texture and preserves pixels through context restoration', async ({
  browser,
}) => {
  test.setTimeout(180000);
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });
  try {
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => performance.setResourceTimingBufferSize(4000));
    await page.goto('/?lazyart');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').click();
    await page.evaluate(() => {
      window.__game.model.startBattle(0, true);
      window.__game.scene.sync();
    });
    await page.waitForFunction(
      () => window.__game.scene.artSettled && !window.__game.scene.lateAssetsPending(),
    );
    const result = await page.evaluate(async () => {
      const { scene, game, model } = window.__game;
      scene.paused = true;
      scene.tweens.pauseAll();
      game.loop.setFPSLimit(0);
      const resource = performance
        .getEntriesByType('resource')
        .find((entry) => entry.name.includes('/src/game/display.ts'))!.name;
      const { setMaxDensity } = await import(/* @vite-ignore */ resource);
      const sceneResource = performance
        .getEntriesByType('resource')
        .find((entry) => entry.name.includes('/src/game/scene.ts'))!.name;
      const { iso } = await import(/* @vite-ignore */ sceneResource);
      const hall = model.battle.buildings.find((building) => building.kind === 'townhall')!;
      const center = iso(hall.x + 2, hall.y + 2);
      setMaxDensity(game, 0.5);
      setMaxDensity(game, 1);
      const renderer = game.renderer,
        gl = renderer.gl;
      scene.ruinDecals.destroy();
      const before = new Set(renderer.glTextureWrappers);
      const actual = scene.resetRuinDecals();
      const allocated = renderer.glTextureWrappers.filter((texture) => !before.has(texture));
      const attachmentCount = actual.texture.drawingContext.framebuffer.attachments.length;
      const stencil = renderer.config.stencil;
      const referenceBefore = new Set(renderer.glTextureWrappers);
      const reference = scene.add
        .renderTexture(actual.x, actual.y, actual.width, actual.height)
        .setOrigin(0, 0)
        .setScale(actual.scaleX, actual.scaleY)
        .setDepth(actual.depth);
      const referenceTextures = renderer.glTextureWrappers.filter(
        (texture) => !referenceBefore.has(texture),
      );
      for (const building of model.battle.buildings) building.hp = 0;
      for (const child of scene.children.list) child.setVisible(false);
      const frame = () => new Promise<void>((resolve) => game.events.once('postrender', resolve));
      const capture = async () => {
        await frame();
        return new Promise<Uint8Array>((resolve) =>
          game.events.once('postrender', () => {
            const pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
            gl.readPixels(
              0,
              0,
              gl.drawingBufferWidth,
              gl.drawingBufferHeight,
              gl.RGBA,
              gl.UNSIGNED_BYTE,
              pixels,
            );
            resolve(pixels);
          }),
        );
      };
      const difference = (a: Uint8Array, b: Uint8Array) => {
        let changed = 0;
        for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) changed++;
        return changed;
      };
      const stamp = (target: typeof actual) => {
        scene.ruinDecals = target;
        scene.ruinStamped.clear();
        scene.ruinDecalsLost = false;
        target.clear();
        scene.drawRuinGround();
      };
      const comparisons = [];
      let previous!: Uint8Array;
      // New shape pages upload at PRE_RENDER. Flush the shared ellipse before immediate
      // offscreen stamps, keeping both targets unpainted for the first comparison.
      scene.ellipseShape();
      await frame();
      for (const zoom of [0.45, 0.7]) {
        scene.cameras.main.setZoom(zoom).centerOn(center.x, center.y);
        actual.setVisible(false);
        reference.setVisible(false);
        const empty = await capture();
        stamp(reference);
        const expected = await capture();
        reference.setVisible(false);
        stamp(actual);
        previous = await capture();
        comparisons.push({
          zoom,
          changed: difference(expected, previous),
          visible: difference(empty, previous),
        });
      }
      const extension = gl.getExtension('WEBGL_lose_context');
      if (!extension) throw Error('Context-loss extension unavailable');
      await new Promise<void>((resolve) => {
        game.canvas.addEventListener(
          'webglcontextlost',
          () => setTimeout(() => extension.restoreContext(), 50),
          { once: true },
        );
        game.canvas.addEventListener(
          'webglcontextrestored',
          () => {
            scene.paused = true;
            resolve();
          },
          { once: true },
        );
        extension.loseContext();
      });
      const invalidated = scene.ruinDecalsLost;
      scene.drawRuinGround();
      const restoredChanged = difference(previous, await capture());
      const stamped = scene.ruinStamped.size;
      const reused = scene.resetRuinDecals() === actual;
      model.finishBattle();
      model.returnHome();
      scene.sync();
      const clearedAtHome = scene.ruinStamped.size === 0 && !actual.visible;
      actual.destroy();
      const retained = allocated.filter((texture) =>
        renderer.glTextureWrappers.includes(texture),
      ).length;
      reference.destroy();
      // The raw Phaser reference deliberately uses the old constructor; remove its orphan too.
      for (const texture of referenceTextures)
        if (renderer.glTextureWrappers.includes(texture)) renderer.deleteTexture(texture);
      return {
        allocated: allocated.length,
        bytes: allocated.reduce((sum, texture) => sum + texture.width * texture.height * 4, 0),
        attachmentCount,
        stencil,
        comparisons,
        invalidated,
        restoredChanged,
        stamped,
        reused,
        clearedAtHome,
        retained,
        error: gl.getError(),
      };
    });
    const reportPath = test.info().outputPath('ruin-texture-result.json');
    await writeFile(reportPath, JSON.stringify(result, null, 2));
    await test
      .info()
      .attach('ruin-texture-result', { path: reportPath, contentType: 'application/json' });
    expect(result.allocated).toBe(1);
    expect(result.attachmentCount).toBe(1);
    expect(result.stencil).toBe(true);
    for (const comparison of result.comparisons) {
      expect(comparison.changed).toBe(0);
      expect(comparison.visible).toBeGreaterThan(500);
    }
    expect(result.invalidated).toBe(true);
    expect(result.restoredChanged).toBe(0);
    expect(result.stamped).toBeGreaterThan(20);
    expect(result.reused).toBe(true);
    expect(result.clearedAtHome).toBe(true);
    expect(result.retained).toBe(0);
    expect(result.error).toBe(0);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});
