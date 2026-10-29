import { expect, test } from '@playwright/test';

test.use({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
});

test('phone rendering stays within its budget through taps, rotation and density resets', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  // Development imports exceed the browser's initial 150-entry resource buffer.
  await page.addInitScript(() => performance.setResourceTimingBufferSize(4000));
  await page.goto('/?lazyart');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  await expect(page.locator('#loading')).toBeHidden();
  const budget = await page.evaluate(async () => {
    const resource = (path: string) =>
      performance.getEntriesByType('resource').find((entry) => entry.name.includes(path))!.name;
    const { RenderQuality } = await import(
      /* @vite-ignore */ resource('/src/game/render-quality.ts')
    );
    RenderQuality.prototype.sample = () => false;
    const { setMaxDensity } = await import(/* @vite-ignore */ resource('/src/game/display.ts'));
    const { runtimeBudget } = await import('/src/game/runtime-budget.ts');
    // A ceiling reset must restore the phone budget, including when battery saver is disabled.
    setMaxDensity(window.__game.game, 0.5);
    setMaxDensity(window.__game.game, Infinity);
    await new Promise<void>((resolve) => window.__game.game.events.once('postrender', resolve));
    return runtimeBudget;
  });
  expect(budget.maxDensity).toBe(2);
  expect(budget.playFps).toBe(60);
  expect(
    budget.decodedImageBytes +
      budget.freeGroupBytes +
      budget.tintedTextureBytes +
      budget.sourcePixelBytes,
  ).toBe(44 << 20);
  const size = () =>
    page.evaluate(() => ({
      canvas: [window.__game.game.canvas.width, window.__game.game.canvas.height],
      css: [window.__game.game.canvas.clientWidth, window.__game.game.canvas.clientHeight],
      density: devicePixelRatio,
    }));
  expect(await size()).toEqual({ canvas: [780, 1688], css: [390, 844], density: 3 });
  const point = await page.evaluate(async () => {
    const { scene } = window.__game;
    scene.setZoom(0.95);
    scene.cameras.main.centerOn(1000, 600);
    scene.clampCamera();
    await new Promise<void>((resolve) => scene.game.events.once('postrender', resolve));
    // The back half of the footprint is clear of the Archer Tower drawn in front.
    return scene.screenFor(12.5, 11.5);
  });
  await page.touchscreen.tap(point.x, point.y);
  await expect(page.locator('.building-context h2')).toHaveText('Town Hall');
  await page.setViewportSize({ width: 844, height: 390 });
  await expect.poll(size).toEqual({ canvas: [1688, 780], css: [844, 390], density: 3 });
  expect(errors).toEqual([]);
});
