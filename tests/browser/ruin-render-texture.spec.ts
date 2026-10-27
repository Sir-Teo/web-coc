import { expect, test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

for (const stage of [null, 61]) {
  test(`phone ${stage === null ? 'practice' : 'large campaign'} ruin layer owns one cropped texture and restores its pixels`, async ({
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
      await page.evaluate(async (stage) => {
        const { model, scene } = window.__game;
        if (stage === null) model.startBattle(0, true);
        else {
          const { developedSave } = await import('/tests/fixtures/developed-village.ts');
          const { freshNativeCampaign } = await import('/src/game/native-campaign.ts');
          const { settings, tutorial } = model.state;
          model.state = developedSave();
          model.state.settings = settings;
          model.state.tutorial = tutorial;
          model.state.nativeCampaign = freshNativeCampaign();
          model.state.nativeCampaign.stars.fill(1);
          model.changed();
          scene.sync();
          model.startCampaign(stage);
        }
        scene.sync();
      }, stage);
      await page.waitForFunction(
        () => window.__game.scene.artSettled && !window.__game.scene.lateAssetsPending(),
      );
      const result = await page.evaluate(async (stage) => {
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
        const { iso, WORLD } = await import(/* @vite-ignore */ sceneResource);
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
          .renderTexture(
            WORLD.left,
            0,
            Math.ceil(WORLD.width / actual.scaleX),
            Math.ceil(WORLD.height / actual.scaleY),
          )
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
        const maxDifference = (a: Uint8Array, b: Uint8Array) => {
          let maximum = 0;
          for (let i = 0; i < a.length; i++) maximum = Math.max(maximum, Math.abs(a[i] - b[i]));
          return maximum;
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
        for (const zoom of [scene.minZoom * 0.5, 0.45, 0.7, 1]) {
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
            maxDifference: maxDifference(expected, previous),
            visible: difference(empty, previous),
          });
        }
        const readTarget = (target: typeof actual) => {
          const previous = gl.getParameter(gl.FRAMEBUFFER_BINDING);
          gl.bindFramebuffer(
            gl.FRAMEBUFFER,
            target.texture.drawingContext.framebuffer.webGLFramebuffer,
          );
          const pixels = new Uint8Array(target.width * target.height * 4);
          gl.readPixels(0, 0, target.width, target.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
          gl.bindFramebuffer(gl.FRAMEBUFFER, previous);
          return pixels;
        };
        const fullPixels = readTarget(reference),
          croppedPixels = readTarget(actual);
        const offsetX = Math.round((actual.x - WORLD.left) / actual.scaleX),
          offsetY = reference.height - Math.round(actual.y / actual.scaleY) - actual.height;
        let sourceDifference = 0,
          outsideDifference = 0;
        for (let y = 0; y < reference.height; y++)
          for (let x = 0; x < reference.width; x++)
            for (let channel = 0; channel < 4; channel++) {
              const inside =
                x >= offsetX &&
                x < offsetX + actual.width &&
                y >= offsetY &&
                y < offsetY + actual.height;
              const pixel = inside
                ? croppedPixels[((y - offsetY) * actual.width + x - offsetX) * 4 + channel]
                : 0;
              sourceDifference = Math.max(
                sourceDifference,
                Math.abs(fullPixels[(y * reference.width + x) * 4 + channel] - pixel),
              );
              if (!inside)
                outsideDifference = Math.max(
                  outsideDifference,
                  fullPixels[(y * reference.width + x) * 4 + channel],
                );
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
        let transition;
        if (stage === null) {
          const originalBuildings = model.state.buildings;
          const originalSize = [actual.width, actual.height];
          const camp = originalBuildings.find((b) => b.kind === 'camp')!;
          model.state.buildings = [
            ...originalBuildings,
            { ...camp, id: model.state.nextId++, x: 43, y: 43, level: 8 },
          ];
          model.startBattle(0, true);
          scene.sync();
          const grew = actual.width * actual.height > originalSize[0] * originalSize[1];
          model.finishBattle();
          model.returnHome();
          model.state.buildings = originalBuildings;
          model.startBattle(0, true);
          scene.sync();
          transition = {
            grew,
            shrank: actual.width === originalSize[0] && actual.height === originalSize[1],
            reused:
              scene.ruinDecals === actual && actual.texture.source[0].glTexture === allocated[0],
            empty: scene.ruinStamped.size === 0 && !actual.visible,
          };
          model.finishBattle();
          model.returnHome();
          scene.sync();
        }
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
          sourceDifference,
          outsideDifference,
          transition,
          invalidated,
          restoredChanged,
          stamped,
          reused,
          clearedAtHome,
          retained,
          error: gl.getError(),
        };
      }, stage);
      const reportPath = test.info().outputPath('ruin-texture-result.json');
      await writeFile(reportPath, JSON.stringify(result, null, 2));
      await test
        .info()
        .attach('ruin-texture-result', { path: reportPath, contentType: 'application/json' });
      expect(result.allocated).toBe(1);
      expect(result.attachmentCount).toBe(1);
      expect(result.bytes).toBeLessThan(1536 * 918 * 4 * (stage === null ? 1 / 3 : 1));
      expect(result.stencil).toBe(true);
      for (const comparison of result.comparisons) {
        // The lowest supported density/zoom can round the final bilinear sample by two levels.
        expect(comparison.maxDifference).toBeLessThanOrEqual(2);
        expect(comparison.visible).toBeGreaterThan(500);
      }
      expect(result.invalidated).toBe(true);
      expect(result.sourceDifference).toBeLessThanOrEqual(1);
      expect(result.outsideDifference).toBe(0);
      if (stage === null)
        expect(result.transition).toEqual({ grew: true, shrank: true, reused: true, empty: true });
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
}
