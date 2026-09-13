import { expect, test } from '@playwright/test';
test('original Archer Tower placement preview tracks tiers, validity and cancellation', async ({
  page,
  browserName,
}) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.ready);
  await page.locator('#loading').waitFor({ state: 'detached' });
  await page.locator('[data-action="skip-tutorial"]').click();
  const result = await page.evaluate(async () => {
    const { model, scene } = window.__game;
    const { makeBuilding } = await import('/src/game/model.ts');
    const { iso } = await import('/src/game/scene.ts');
    scene.paused = true;
    model.state.obstacles = [];
    model.state.buildings = [makeBuilding(999, 'archertower', 20, 20, 1)];
    model.move(999);
    const point = (x, y) => {
      const world = iso(x + 0.1, y + 0.1),
        c = scene.cameras.main;
      const o = c.getWorldPoint(0, 0),
        a = c.getWorldPoint(1, 0),
        b = c.getWorldPoint(0, 1);
      const ax = a.x - o.x,
        ay = a.y - o.y,
        bx = b.x - o.x,
        by = b.y - o.y;
      const dx = world.x - o.x,
        dy = world.y - o.y,
        det = ax * by - ay * bx;
      return { x: (dx * by - dy * bx) / det, y: (dy * ax - dx * ay) / det };
    };
    const counts = [];
    for (let level = 1; level <= 21; level++) {
      model.state.buildings[0].level = level;
      scene.sync();
      const valid = scene.updateGhost(point(25, 25));
      if (!valid.valid) throw Error('Empty tile rejected');
      if (scene.ghost.alpha !== 0) throw Error('Legacy preview visible');
      const view = scene.villageArcherTowers.ghost;
      if (!view?.body.objects.length || !view.resident.objects.length)
        throw Error('Missing native tower or resident preview');
      counts.push(view.body.objects.length);
      const invalid = scene.updateGhost(point(0, 0));
      if (invalid.valid) throw Error('Boundary accepted');
    }
    model.cancel();
    scene.sync();
    const cancelled = !scene.villageArcherTowers.ghost;
    model.placement = 'archertower';
    model.moving = null;
    scene.sync();
    scene.updateGhost(point(25, 25));
    const fresh = scene.villageArcherTowers.ghost.body.objects.length;
    model.placement = 'goldmine';
    scene.sync();
    const switched = !scene.villageArcherTowers.ghost && scene.ghost.alpha === 0.72;
    model.cancel();
    model.move(999);
    scene.sync();
    scene.updateGhost(point(25, 25));
    return { counts, cancelled, fresh, switched, gl: scene.game.renderer.gl.getError() };
  });
  expect(result.counts).toHaveLength(21);
  expect(result.counts.every((n) => n > 0)).toBe(true);
  expect(result.cancelled).toBe(true);
  expect(result.switched).toBe(true);
  expect(result.fresh).toBeGreaterThan(0);
  expect(result.gl).toBe(0);
  await page.screenshot({ path: `output/playtest/archer-tower-preview-${browserName}.png` });
});
