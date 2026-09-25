import { test, expect, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  await expect(page.locator('#loading')).toBeHidden();
  await page.evaluate(() => {
    const { model: m, scene } = window.__game;
    m.state.settings.reducedMotion = true;
    // Economy refreshes must not be needed to bring a stationary preview up to date.
    m.tick = () => {};
    scene.zoomBy(1.4);
    m.move(m.state.buildings.find((b) => b.kind === 'goldmine').id);
  });
});

const alignment = (page: Page) =>
  page.evaluate(() => {
    const { scene } = window.__game;
    const pointer = scene.ghostPoint ?? scene.input.activePointer;
    const grid = scene.gridAtPointer(pointer);
    // The picked-up Gold Mine occupies 3×3 tiles. Its feet belong at the center
    // of the same snapped tile footprint that will receive the next click/drop.
    const x = Math.floor(grid.x) + 1.5,
      y = Math.floor(grid.y) + 1.5;
    return Math.hypot(scene.ghost.x - (896 + (x - y) * 32), scene.ghost.y - (112 + (x + y) * 16));
  });

test('a stationary placement cursor stays aligned while keyboard panning, zooming and resizing', async ({
  page,
}) => {
  await page.mouse.move(650, 430);
  await expect.poll(() => alignment(page)).toBeLessThan(0.001);
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(250);
  await page.keyboard.up('ArrowRight');
  await expect.poll(() => alignment(page)).toBeLessThan(0.001);
  await page.evaluate(() => window.__game.scene.zoomBy(1.3));
  await expect.poll(() => alignment(page)).toBeLessThan(0.001);
  await page.setViewportSize({ width: 1024, height: 768 });
  await expect.poll(() => alignment(page)).toBeLessThan(0.001);
});

test('a shop drag keeps its DOM pointer through scene refreshes and returns to canvas input on release', async ({
  page,
}) => {
  await page.mouse.move(1050, 650);
  await page.evaluate(() => {
    const scene = window.__game.scene;
    const point = scene.screenFor(12.2, 16.2);
    scene.trackGhost(point.x, point.y);
  });
  await expect.poll(() => alignment(page)).toBeLessThan(0.001);
  await page.evaluate(() => {
    const { model, scene } = window.__game;
    model.changed();
    scene.sync();
  });
  await expect.poll(() => alignment(page)).toBeLessThan(0.001);
  await page.evaluate(() => window.__game.scene.releaseGhost());
  await expect.poll(() => alignment(page)).toBeLessThan(0.001);
});
