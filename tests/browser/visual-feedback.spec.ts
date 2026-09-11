import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.ready);
  await page.locator('[data-action="skip-tutorial"]').click();
});

test('collections fly from the producer to its counter across camera zoom and pan', async ({
  page,
}) => {
  for (const factor of [0.8, 1.8]) {
    const result = await page.evaluate((factor) => {
      const { model, scene } = window.__game;
      const mine = model.state.buildings.find((b) => b.kind === 'goldmine');
      mine.stored = 300;
      model.state.gold = 10000;
      scene.setZoom(scene.baseZoom * factor);
      scene.cameras.main.centerOn(840, 430);
      const origin = scene.screenFor(mine.x + 1.5, mine.y + 1.5);
      const canvas = scene.game.canvas.getBoundingClientRect();
      origin.x += canvas.left;
      origin.y += canvas.top - 40 * scene.cameras.main.zoom;
      model.collect(mine.id);
      const particles = Array.from(document.querySelectorAll<HTMLElement>('.resource-flight'));
      const centers = (nodes: HTMLElement[]) =>
        nodes.map((node) => {
          const box = node.getBoundingClientRect();
          return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
        });
      for (const p of particles)
        for (const animation of p.getAnimations()) {
          animation.pause();
          animation.currentTime = 0;
        }
      const starts = centers(particles);
      // A camera change during collection must not move particles off their HUD destination.
      scene.cameras.main.centerOn(1020, 630);
      scene.setZoom(scene.baseZoom);
      for (const p of particles)
        for (const animation of p.getAnimations())
          animation.currentTime =
            Number(animation.effect.getTiming().duration) +
            Number(animation.effect.getTiming().delay);
      const ends = centers(particles);
      const target = document.querySelector('[data-resource="gold"]').getBoundingClientRect();
      for (const p of particles) for (const animation of p.getAnimations()) animation.cancel();
      return {
        starts,
        ends,
        origin,
        target: { x: target.x + target.width / 2, y: target.y + target.height / 2 },
      };
    }, factor);
    expect(result.starts).toHaveLength(7);
    for (const p of result.starts) {
      expect(Math.abs(p.x - result.origin.x)).toBeLessThanOrEqual(16);
      expect(Math.abs(p.y - result.origin.y)).toBeLessThanOrEqual(10);
    }
    for (const p of result.ends) {
      expect(p.x).toBeCloseTo(result.target.x, 0);
      expect(p.y).toBeCloseTo(result.target.y, 0);
    }
  }
});

test('resource bubbles follow moved producers and stop bobbing with reduced motion', async ({
  page,
}) => {
  const id = await page.evaluate(() => {
    const { model, scene } = window.__game;
    const mine = model.state.buildings.find((b) => b.kind === 'goldmine');
    model.state.settings.reducedMotion = true;
    model.beginEdit();
    model.beginDrag();
    for (let x = 3; x < 22; x++)
      for (let y = 3; y < 22; y++) {
        if (Math.abs(mine.x - x) + Math.abs(mine.y - y) < 5) continue;
        if (!model.canPlace(mine.kind, x, y, mine.id)) continue;
        model.dragTo(mine.id, x, y);
        model.changed();
        scene.sync();
        return mine.id;
      }
    throw new Error('No free producer location');
  });
  const read = () =>
    page.evaluate((id) => {
      const scene = window.__game.scene;
      const bubble = scene.bubbles.get(id);
      const sprite = scene.sprites.get(id);
      return {
        x: bubble.x,
        y: bubble.y,
        expectedX: sprite.x,
        expectedY: sprite.y - sprite.displayHeight * 0.86 - 13,
      };
    }, id);
  const moved = await read();
  expect(moved.x).toBeCloseTo(moved.expectedX, 1);
  expect(moved.y).toBeCloseTo(moved.expectedY, 1);
  await page.waitForTimeout(250);
  expect((await read()).y).toBeCloseTo(moved.y, 1);
});

test('reduced motion suppresses collection flights and removed producers leave no bubbles', async ({
  page,
}) => {
  const state = await page.evaluate(() => {
    const { model, scene } = window.__game;
    const mine = model.state.buildings.find((b) => b.kind === 'goldmine');
    model.state.settings.reducedMotion = true;
    model.collect(mine.id);
    model.state.buildings = model.state.buildings.filter((b) => b.id !== mine.id);
    model.changed();
    scene.sync();
    return {
      flights: document.querySelectorAll('.resource-flight').length,
      bubble: scene.bubbles.has(mine.id),
    };
  });
  expect(state).toEqual({ flights: 0, bubble: false });
});

test('real collection flights clean up after finishing and when the viewport changes', async ({ page }) => {
  await page.locator('[data-action="collect"]').last().click();
  await expect(page.locator('.resource-flight').first()).toBeAttached();
  await expect(page.locator('.resource-flight')).toHaveCount(0);
  await page.evaluate(() => {
    const { model } = window.__game;
    const mine = model.state.buildings.find((b) => b.kind === 'goldmine');
    mine.stored = 500;
    model.collect(mine.id);
  });
  await expect(page.locator('.resource-flight').first()).toBeAttached();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.resource-flight')).toHaveCount(0);
});
