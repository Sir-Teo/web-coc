import { test, expect } from '@playwright/test';
test('single Inferno heat transition renders its original burst', async ({ page, browserName }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.ready);
  await page.locator('#loading').waitFor({ state: 'detached' });
  const report = await page.evaluate(async () => {
    const { model, scene, game } = window.__game;
    const { makeBuilding } = await import('/src/game/model.ts');
    const { stepInfernos } = await import('/src/game/inferno-battle.ts');
    model.startBattle(0, true);
    scene.paused = true;
    const battle = model.battle;
    battle.started = true;
    battle.buildings = [{ ...makeBuilding(1, 'inferno', 18, 18, 1), infernoMode: 'single' }];
    battle.units = Array.from({ length: 1 }, (_, i) => ({
      id: i + 1,
      kind: 'giant',
      x: 15 + i * 1.4,
      y: 23,
      hp: 1000,
      maxHp: 1000,
      cooldown: 0,
      target: null,
      path: [],
      pathAt: 0,
      attacking: false,
    }));
    battle.elapsed = 0.128;
    stepInfernos(battle, 0.128);
    for (let tick = 3; tick <= 27; tick++) {
      battle.elapsed = tick * 0.064;
      stepInfernos(battle, 0.064);
    }
    scene.sync();
    scene.drawOverlay(128);
    const count = scene.infernoPresentation.beams.size;
    return {
      count,
      impacts: [...scene.infernoPresentation.impacts.keys()].filter((key) =>
        key.includes(':transition:'),
      ).length,
      gl: game.renderer.gl.getError(),
    };
  });
  expect(report).toEqual({ count: 1, impacts: 1, gl: 0 });
  const sample = () =>
    page.evaluate(async () => {
      const { model, scene } = window.__game;
      const { iso } = await import('/src/game/scene.ts');
      const camera = scene.cameras.main;
      const point = scene.screenFor(19, 19);
      const rect = scene.scale.canvasBounds;
      const world = camera.getWorldPoint(
        (point.x - rect.left) * scene.scale.displayScale.x,
        (point.y - rect.top) * scene.scale.displayScale.y,
      );
      const matrix = [...camera.matrixCombined.matrix];
      model.state.settings.reducedMotion = true;
      const still = scene.screenFor(19, 19);
      model.state.settings.reducedMotion = false;
      camera.preRender();
      return {
        matrix,
        delta: [point.x - still.x, point.y - still.y],
        world: [world.x, world.y],
        expected: [iso(19, 19).x, iso(19, 19).y],
      };
    });
  const first = await sample();
  expect(Math.hypot(...first.delta)).toBeGreaterThan(0.01);
  expect(first.world[0]).toBeCloseTo(first.expected[0], 4);
  expect(first.world[1]).toBeCloseTo(first.expected[1], 4);
  await page.waitForTimeout(100);
  expect(await sample()).toEqual(first);
  await page.screenshot({ path: `output/playtest/inferno-transition-${browserName}.png` });
  expect(
    await page.evaluate(() => {
      const { model, scene } = window.__game;
      model.battle.defenseStuns[1] = 10;
      scene.drawOverlay(128);
      return scene.infernoPresentation.beams.size;
    }),
  ).toBe(0);
});
