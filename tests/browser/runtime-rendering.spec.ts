import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/?lazyart');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
});

test('the canvas avoids multisampling while artwork keeps linear filtering', async ({ page }) => {
  const rendering = await page.evaluate(() => {
    const { game, scene } = window.__game;
    const gl = game.renderer.gl;
    const terrain = scene.textures.get('terrain').source[0].glTexture;
    return {
      antialias: gl.getContextAttributes().antialias,
      samples: gl.getParameter(gl.SAMPLES),
      linear: terrain.magFilter === gl.LINEAR,
    };
  });
  expect(rendering).toEqual({ antialias: false, samples: 0, linear: true });
});

test('dialog interaction keeps the village capped and closing restores play immediately', async ({
  page,
}) => {
  await page.locator('[data-action="settings"]').first().click();
  await expect.poll(() => page.evaluate(() => window.__game.game.loop.fpsLimit)).toBe(15);
  await page.mouse.move(600, 400);
  const volume = page.getByRole('slider', { name: 'Sound effects volume' });
  // DOM controls and keyboard events must not lift the background's render cap.
  await volume.focus();
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => page.evaluate(() => window.__game.game.loop.fpsLimit)).toBe(15);
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => window.__game.game.loop.fpsLimit)).toBe(0);
});

test('a live battle retains its normal pace behind a dialog', async ({ page }) => {
  await page.evaluate(() => {
    const { model, hud } = window.__game;
    model.startBattle(0, true);
    hud.show('settings');
  });
  await expect.poll(() => page.evaluate(() => window.__game.game.loop.fpsLimit)).toBe(0);
  const before = await page.evaluate(() => window.__game.model.battle!.prep);
  await expect
    .poll(() => page.evaluate(() => window.__game.model.battle!.prep))
    .toBeLessThan(before);
});

test('sustained pressure resizes a 1× canvas while preserving DOM text and world picking', async ({
  page,
}) => {
  const before = await page.evaluate(async () => {
    const { RenderQuality } = await import('/src/game/render-quality.ts');
    const sample = RenderQuality.prototype.sample;
    let clock = performance.now();
    // Advance only the governor's measurement clock, keeping the real resize, pointer guards,
    // camera and input path. This avoids depending on the test runner's GPU speed.
    RenderQuality.prototype.sample = function (_now, enabled, density, interval) {
      return sample.call(this, (clock += 400), enabled, density, interval);
    };
    const { scene, game } = window.__game;
    const { setMaxDensity } = await import('/src/game/display.ts');
    setMaxDensity(game, 0.5);
    setMaxDensity(game, 1);
    const awake = setInterval(() => (scene as any).wake(), 100);
    (window as any).__pressureWake = awake;
    const camera = scene.cameras.main;
    return {
      center: [camera.scrollX + camera.width / 2, camera.scrollY + camera.height / 2],
      zoom: scene.viewZoom,
      font: getComputedStyle(document.querySelector('.player-name')!).fontSize,
      width: game.canvas.clientWidth,
      canvas: game.canvas.width,
    };
  });
  expect(before.canvas).toBe(1440);
  await expect
    .poll(() => page.evaluate(() => window.__game.game.canvas.width), { timeout: 20000 })
    .toBe(720);
  const after = await page.evaluate(() => {
    const { scene, game } = window.__game;
    const camera = scene.cameras.main;
    return {
      center: [camera.scrollX + camera.width / 2, camera.scrollY + camera.height / 2],
      zoom: scene.viewZoom,
      font: getComputedStyle(document.querySelector('.player-name')!).fontSize,
      width: game.canvas.clientWidth,
      canvas: game.canvas.width,
    };
  });
  expect(after.center[0]).toBeCloseTo(before.center[0], 7);
  expect(after.center[1]).toBeCloseTo(before.center[1], 7);
  expect(after.zoom).toBe(before.zoom);
  expect(after.font).toBe(before.font);
  expect(after.width).toBe(before.width);
  const point = await page.evaluate(() => window.__game.scene.screenFor(12.5, 11.5));
  await page.mouse.click(point.x, point.y);
  await expect(page.locator('.building-context h2')).toHaveText('Town Hall');
});
