import { test, expect, type Page } from '@playwright/test';

async function boot(page: Page) {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.ready);
  await page.locator('[data-action="skip-tutorial"]').click();
  await expect(page.locator('#loading')).toBeHidden();
}
const view = (page: Page) =>
  page.evaluate(() => {
    const { scene, game } = window.__game;
    const c = scene.cameras.main;
    return {
      width: game.canvas.width,
      height: game.canvas.height,
      cssWidth: game.canvas.clientWidth,
      cssHeight: game.canvas.clientHeight,
      x: c.scrollX + c.width / 2,
      y: c.scrollY + c.height / 2,
      zoom: scene.viewZoom,
    };
  });

for (const profile of [
  { name: 'Retina desktop', width: 1440, height: 960, density: 2 },
  { name: '3x phone', width: 390, height: 844, density: 3 },
  { name: 'fractional display', width: 801, height: 601, density: 1.25 },
]) {
  test.describe(profile.name, () => {
    test.use({
      viewport: { width: profile.width, height: profile.height },
      deviceScaleFactor: profile.density,
    });

    test('native buffer, taps, drag thresholds, placement and rotation share CSS coordinates', async ({
      page,
    }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await boot(page);
      const initial = await view(page);
      expect(initial.width).toBe(Math.floor(profile.width * profile.density));
      expect(initial.height).toBe(Math.floor(profile.height * profile.density));
      expect(initial.cssWidth).toBe(profile.width);
      expect(initial.cssHeight).toBe(profile.height);
      const point = await page.evaluate(async () => {
        const s = window.__game.scene;
        s.setZoom(0.95);
        s.cameras.main.centerOn(1000, 600);
        s.clampCamera();
        await new Promise((resolve) => s.game.events.once('postrender', resolve));
        return s.screenFor(12.5, 11.5);
      });
      await page.mouse.click(point.x, point.y);
      await expect(page.locator('.building-context h2')).toHaveText('Town Hall');
      await page.keyboard.press('Escape');
      // A four-CSS-pixel wobble must still be a tap even on a 3× display.
      await page.mouse.move(point.x, point.y);
      await page.mouse.down();
      await page.mouse.move(point.x + 4, point.y);
      expect(await page.evaluate(() => window.__game.scene.gesture)).toBe('none');
      await page.mouse.up();
      await page.keyboard.press('Escape');
      const beforePan = await view(page);
      await page.mouse.move(point.x, point.y);
      await page.mouse.down();
      await page.mouse.move(point.x + 40, point.y + 20, { steps: 5 });
      await page.mouse.up();
      const afterPan = await view(page);
      expect(afterPan.x).toBeCloseTo(beforePan.x - 40 / beforePan.zoom, 3);
      expect(afterPan.y).toBeCloseTo(beforePan.y - 20 / beforePan.zoom, 3);
      // Put a valid destination at the center of the unobstructed map, then
      // commit via a real pointer release; a model-only call cannot prove input.
      const placement = await page.evaluate(async () => {
        const { model: m, scene: s } = window.__game;
        const mine = m.state.buildings.find((b) => b.kind === 'goldmine');
        for (let y = 3; y < 30; y++)
          for (let x = 3; x < 30; x++) {
            if (!m.canPlace(mine.kind, x, y, mine.id) || (x === mine.x && y === mine.y)) continue;
            m.move(mine.id);
            s.cameras.main.centerOn(896 + (x - y) * 32, 112 + (x + y) * 16);
            s.clampCamera();
            await new Promise((resolve) => s.game.events.once('postrender', resolve));
            const p = s.screenFor(x + 0.2, y + 0.2);
            s.trackGhost(p.x, p.y);
            const grid = s.gridAtScreen(p.x, p.y);
            return { id: mine.id, x, y, p, grid, ghost: [s.ghost.x, s.ghost.y] };
          }
        throw Error('No valid destination');
      });
      expect(placement.grid.x).toBeCloseTo(placement.x + 0.2, 4);
      expect(placement.grid.y).toBeCloseTo(placement.y + 0.2, 4);
      expect(placement.ghost).toEqual([
        896 + (placement.x - placement.y) * 32,
        112 + (placement.x + placement.y + 3) * 16,
      ]);
      await page.mouse.click(placement.p.x, placement.p.y);
      await expect
        .poll(() =>
          page.evaluate((id) => {
            const b = window.__game.model.state.buildings.find((b) => b.id === id);
            return [b.x, b.y];
          }, placement.id),
        )
        .toEqual([placement.x, placement.y]);
      await page.keyboard.press('Escape');
      await page.evaluate(() => {
        const s = window.__game.scene;
        s.setZoom(0.95);
        s.cameras.main.centerOn(1000, 600);
        s.clampCamera();
      });
      const beforeRotation = await view(page);
      await page.setViewportSize({ width: profile.height, height: profile.width });
      await expect
        .poll(async () => (await view(page)).width)
        .toBe(Math.floor(profile.height * profile.density));
      const rotated = await view(page);
      expect(rotated.height).toBe(Math.floor(profile.width * profile.density));
      expect(rotated.x).toBeCloseTo(beforeRotation.x, 6);
      expect(rotated.y).toBeCloseTo(beforeRotation.y, 6);
      expect(rotated.zoom).toBeCloseTo(beforeRotation.zoom, 6);
      await page.screenshot({
        path: `output/playtest/display-${profile.name.replaceAll(' ', '-')}-${test.info().project.use.browserName ?? 'chromium'}.png`,
      });
      expect(errors).toEqual([]);
    });

    test('resolves individual native pixels and restores the high-density framebuffer', async ({
      page,
    }) => {
      await boot(page);
      const result = await page.evaluate(async () => {
        const { scene: s, game } = window.__game;
        s.paused = true;
        s.tweens.pauseAll();
        // Keep buildings, troop sprites, text and terrain in the restoration reference.
        const c = s.cameras.main;
        const gl = game.renderer.gl;
        const x = Math.floor(100 * s.scale.displayScale.x),
          y = Math.floor(200 * s.scale.displayScale.y);
        const origin = c.getWorldPoint(x, y);
        const g = s.add.graphics().setDepth(9000);
        for (let i = 0; i < 52; i++)
          g.fillStyle(i % 2 ? 0xffffff : 0).fillRect(
            origin.x + i / c.zoomX,
            origin.y,
            1 / c.zoomX,
            24 / c.zoomY,
          );
        const capture = () =>
          new Promise<Uint8Array>((resolve) =>
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
        const first = await capture();
        const columns = Array.from(
          { length: 52 },
          (_, i) => first[((gl.drawingBufferHeight - y - 12) * gl.drawingBufferWidth + x + i) * 4],
        );
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
              s.paused = true;
              resolve();
            },
            { once: true },
          );
          extension.loseContext();
        });
        const restored = await capture();
        let changed = 0;
        for (let i = 0; i < first.length; i += 4)
          if (
            first[i] !== restored[i] ||
            first[i + 1] !== restored[i + 1] ||
            first[i + 2] !== restored[i + 2] ||
            first[i + 3] !== restored[i + 3]
          )
            changed++;
        return {
          columns,
          changed,
          error: gl.getError(),
          dimensions: [gl.drawingBufferWidth, gl.drawingBufferHeight],
        };
      });
      expect(result.dimensions).toEqual([
        Math.floor(profile.width * profile.density),
        Math.floor(profile.height * profile.density),
      ]);
      result.columns.forEach((value, i) =>
        i % 2 ? expect(value).toBeGreaterThan(240) : expect(value).toBeLessThan(15),
      );
      expect(result.changed).toBe(0);
      expect(result.error).toBe(0);
    });
  });
}

test('changing display density preserves framing and cancels the old gesture', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'CDP can change density on a live document in Chromium.');
  await boot(page);
  const session = await page.context().newCDPSession(page);
  await page.evaluate(() => {
    const s = window.__game.scene;
    s.setZoom(1.1);
    s.cameras.main.centerOn(1000, 620);
  });
  const original = await view(page);
  for (const density of [2, 1.25, 1]) {
    await page.mouse.move(700, 500);
    await page.mouse.down();
    await page.mouse.move(730, 510, { steps: 3 });
    const before = await view(page);
    await session.send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 960,
      deviceScaleFactor: density,
      mobile: false,
    });
    await expect.poll(async () => (await view(page)).width).toBe(1440 * density);
    expect(await page.evaluate(() => window.__game.scene.down === undefined)).toBe(true);
    const after = await view(page);
    await page.mouse.move(770, 540);
    await page.mouse.up();
    const released = await view(page);
    expect(released.x).toBe(after.x);
    expect(released.y).toBe(after.y);
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
    expect(after.zoom).toBeCloseTo(original.zoom, 6);
  }
});

test.describe('3x touch gestures', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    hasTouch: true,
    isMobile: true,
  });
  test('a native two-finger pinch zooms in CSS space without selecting a building', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'Native multi-touch injection requires CDP.');
    await boot(page);
    const session = await page.context().newCDPSession(page);
    const before = await view(page);
    const touch = (type: string, left: number, right: number) =>
      session.send('Input.dispatchTouchEvent', {
        type,
        touchPoints:
          type === 'touchEnd'
            ? []
            : [
                { x: left, y: 430, id: 1, radiusX: 5, radiusY: 5 },
                { x: right, y: 430, id: 2, radiusX: 5, radiusY: 5 },
              ],
      });
    await touch('touchStart', 145, 245);
    // The first movement establishes the pinch's starting distance.
    await touch('touchMove', 140, 250);
    await touch('touchMove', 110, 280);
    await touch('touchEnd', 0, 0);
    const after = await view(page);
    expect(after.zoom).toBeCloseTo((before.zoom * 170) / 110, 5);
    expect(after.x).toBeCloseTo(before.x, 5);
    expect(after.y).toBeCloseTo(before.y, 5);
    expect(await page.evaluate(() => window.__game.model.selected)).toBeNull();
  });
});
