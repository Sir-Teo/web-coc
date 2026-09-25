import { test, expect } from '@playwright/test';
test('live Inferno beams follow six targets and clear on freeze', async ({ page, browserName }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('#loading').waitFor({ state: 'detached' });
  const report = await page.evaluate(async () => {
    const { model, scene, game } = window.__game;
    const { makeBuilding } = await import('/src/game/model.ts');
    const { stepInfernos } = await import('/src/game/inferno-battle.ts');
    const { iso } = await import('/src/game/scene.ts');
    model.startBattle(0, true);
    scene.paused = true;
    const battle = model.battle;
    battle.started = true;
    battle.buildings = [{ ...makeBuilding(1, 'inferno', 18, 18, 8), infernoMode: 'multi' }];
    battle.units = Array.from({ length: 6 }, (_, i) => ({
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
    const sampleAlpha = () => {
      scene.infernoPresentation.render(battle.buildings, 0.2, battle, false, iso);
      return [...scene.infernoPresentation.beams.values()].flatMap((view) =>
        view.objects.map((object) => object.alpha),
      );
    };
    battle.elapsed = 0.064;
    stepInfernos(battle, 0.064);
    const half = sampleAlpha();
    battle.elapsed = 0.096;
    const threeQuarters = sampleAlpha();
    scene.infernoPresentation.clear();
    const restored = sampleAlpha();
    battle.elapsed = 0.128;
    stepInfernos(battle, 0.064);
    const full = sampleAlpha();
    battle.elapsed = 0.328;
    scene.sync();
    scene.drawOverlay(128);
    const count = scene.infernoPresentation.beams.size;
    return {
      half,
      threeQuarters,
      restored,
      full,
      count,
      impacts: scene.infernoPresentation.impacts.size,
      gl: game.renderer.gl.getError(),
    };
  });
  expect(report).toMatchObject({ count: 6, impacts: 84, gl: 0 });
  expect(report.full.length).toBeGreaterThan(0);
  expect(report.full.some((alpha) => alpha > 0)).toBe(true);
  expect(report.half).toHaveLength(report.full.length);
  expect(report.threeQuarters).toHaveLength(report.full.length);
  report.full.forEach((alpha, index) => {
    expect(report.half[index]).toBeCloseTo(alpha * 0.5, 6);
    expect(report.threeQuarters[index]).toBeCloseTo(alpha * 0.75, 6);
  });
  expect(report.restored).toEqual(report.threeQuarters);
  await page.screenshot({ path: `output/playtest/inferno-beams-${browserName}.png` });
  expect(
    await page.evaluate(() => {
      const { model, scene } = window.__game;
      model.battle.defenseStuns[1] = 1;
      scene.drawOverlay(128);
      return scene.infernoPresentation.beams.size;
    }),
  ).toBe(0);
});
