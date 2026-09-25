import { test, expect, type Page } from '@playwright/test';

async function boot(page: Page) {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  await expect(page.locator('#loading')).toBeHidden();
}
async function camera(page: Page) {
  return page.evaluate(() => {
    const c = window.__game.scene.cameras.main;
    return { x: c.scrollX + c.width / 2, y: c.scrollY + c.height / 2, zoom: window.__game.scene.viewZoom };
  });
}

test('terrain covers every canvas edge through zoom, pan, aspect changes and battles', async ({
  page,
}) => {
  await boot(page);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const gaps: unknown[] = [];
  for (const [width, height] of [
    [320, 740],
    [390, 844],
    [844, 390],
    [1440, 960],
    [2560, 1080],
    [320, 1200],
  ]) {
    await page.setViewportSize({ width, height });
    await page.waitForFunction((width) => window.__game.scene.cameras.main.width === Math.floor(width * devicePixelRatio), width);
    for (const battle of [false, true]) {
      gaps.push(
        ...(await page.evaluate(
          async ({ width, height, battle }) => {
            const { model, scene, game } = window.__game;
            if (battle) model.startBattle(0);
            else model.returnHome();
            scene.paused = true;
            // Inspect the actual terrain framebuffer without sprites masking missing scenery.
            for (const child of scene.children.list)
              child.setVisible(child.texture?.key === 'terrain');
            const c = scene.cameras.main;
            c.setBackgroundColor('#ff00ff');
            const gl = game.renderer.gl;
            const capture = () =>
              new Promise<number>((resolve) => {
                game.events.once('postrender', () => {
                  const w = gl.drawingBufferWidth,
                    h = gl.drawingBufferHeight;
                  let count = 0;
                  for (const [x, y, width, height] of [
                    [0, 0, w, 1],
                    [0, h - 1, w, 1],
                    [0, 0, 1, h],
                    [w - 1, 0, 1, h],
                  ]) {
                    const pixels = new Uint8Array(width * height * 4);
                    gl.readPixels(x, y, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
                    for (let i = 0; i < pixels.length; i += 4)
                      if (pixels[i] === 255 && pixels[i + 1] === 0 && pixels[i + 2] === 255)
                        count++;
                  }
                  resolve(count);
                });
              });
            const terrain = scene.children.list.find((child) => child.texture?.key === 'terrain');
            terrain.setVisible(false);
            const uncovered = await capture();
            if (uncovered !== 2 * (gl.drawingBufferWidth + gl.drawingBufferHeight))
              throw Error(`Framebuffer sentinel check failed: ${uncovered}`);
            terrain.setVisible(true);
            const failures: unknown[] = [];
            for (const zoom of [0, scene.baseZoom, 100]) {
              scene.setZoom(zoom);
              for (const [x, y] of [
                [896, 597.5],
                [-10000, -10000],
                [10000, -10000],
                [-10000, 10000],
                [10000, 10000],
              ]) {
                c.centerOn(x, y);
                scene.clampCamera();
                const exposed = await capture();
                if (exposed) failures.push({ width, height, battle, zoom: window.__game.scene.viewZoom, x, y, exposed });
              }
            }
            return failures;
          },
          { width, height, battle },
        )),
      );
    }
  }
  expect(gaps).toEqual([]);
  expect(errors).toEqual([]);
});

test('rotation preserves world focus and zoom, and recenter remains explicit', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await boot(page);
  await page.evaluate(() => {
    const s = window.__game.scene;
    s.setZoom(0.95);
    s.cameras.main.centerOn(1000, 600);
    s.clampCamera();
  });
  const before = await camera(page);
  for (const [width, height] of [
    [844, 390],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await page.waitForFunction((width) => window.__game.scene.cameras.main.width === Math.floor(width * devicePixelRatio), width);
    expect(await camera(page)).toEqual(before);
  }
  await page.locator('[data-action="recenter"]').click();
  expect((await camera(page)).zoom).toBe(await page.evaluate(() => window.__game.scene.baseZoom));
  expect((await camera(page)).x).toBe(896);
  await page.locator('[data-action="zoom-out"]').click();
  await page.screenshot({
    path: `output/playtest/village-camera-phone-${test.info().project.name}.png`,
  });
  await page.setViewportSize({ width: 844, height: 390 });
  await page.locator('[data-action="recenter"]').click();
  const p = await page.evaluate(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return window.__game.scene.screenFor(12.5, 11.5);
  });
  await page.mouse.click(p.x, p.y);
  await expect(page.locator('.building-context h2')).toHaveText('Town Hall');
  await page.screenshot({
    path: `output/playtest/village-camera-landscape-${test.info().project.name}.png`,
  });
});

test('resizing cancels an in-progress pan and clamps zoom to the new viewport limits', async ({
  page,
}) => {
  await boot(page);
  await page.evaluate(() => window.__game.scene.setZoom(100));
  await page.mouse.move(700, 500);
  await page.mouse.down();
  await page.mouse.move(770, 550, { steps: 5 });
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.waitForFunction(() => window.__game.scene.cameras.main.width === Math.floor(1200 * devicePixelRatio));
  const afterResize = await camera(page);
  expect(afterResize.zoom).toBeCloseTo(await page.evaluate(() => window.__game.scene.baseZoom * 2));
  await page.mouse.move(970, 690, { steps: 5 });
  await page.mouse.up();
  expect(await camera(page)).toEqual(afterResize);
  expect(await page.evaluate(() => window.__game.model.selected)).toBeNull();
});
