import { test, expect } from '@playwright/test';

test('renders original Dragon fire in all six body orientations and clears it on death', async ({
  page,
  browserName,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.ready);
  await page.locator('#loading').waitFor({ state: 'detached' });
  await page.evaluate(async () => {
    const { scene } = window.__game;
    const { spawnGarrisonDefender } = await import('/src/game/garrison-combat.ts');
    const { iso } = await import('/src/game/scene.ts');
    scene.model.startBattle(0, true);
    scene.paused = true;
    const battle = scene.model.battle;
    spawnGarrisonDefender(battle, 'dragon', 7, 1, 28, 28, 0);
    scene.sync();
    const point = iso(28, 28);
    scene.cameras.main.setZoom(2.5).centerOn(point.x, point.y - 80);
  });
  for (const [index, [dx, dy]] of [
    [0, -1],
    [1, -1],
    [1, 0],
    [-1, 0],
    [-1, 1],
    [0, 1],
  ].entries()) {
    const report = await page.evaluate(
      ({ dx, dy }) => {
        const { scene, game } = window.__game;
        const battle = scene.model.battle;
        const dragon = battle.defenders[0];
        dragon.attacks = [{ at: 1, x: 28, y: 28, targetId: 1, targetX: 28 + dx, targetY: 28 + dy }];
        battle.elapsed = 1.3;
        const start = performance.now();
        scene.drawOverlay(1300);
        const elapsed = performance.now() - start;
        return {
          elapsed,
          effects: scene.garrisonPresentation.effects.size,
          objects: [...scene.garrisonPresentation.effects.values()].reduce(
            (n, v) => n + v.objects.length,
            0,
          ),
          gl: game.renderer.gl.getError(),
        };
      },
      { dx, dy },
    );
    expect(report.effects).toBeGreaterThan(40);
    expect(report.objects).toBeGreaterThan(40);
    expect(report.gl).toBe(0);
    await page.screenshot({ path: `output/playtest/dragon-fire-${browserName}-${index}.png` });
  }
  const report = await page.evaluate(async () => {
    const { scene } = window.__game;
    const { hurtDefender } = await import('/src/game/defenders.ts');
    const battle = scene.model.battle;
    hurtDefender(battle, battle.defenders[0], 4000);
    battle.elapsed = 1.4;
    scene.drawOverlay(1400);
    const keys = [...scene.garrisonPresentation.effects.keys()];
    battle.elapsed = 5;
    scene.drawOverlay(5000);
    return { keys, expired: scene.garrisonPresentation.effects.size };
  });
  expect(report.keys.length).toBeGreaterThan(0);
  expect(report.keys.every((key) => key.includes(':die:'))).toBe(true);
  expect(report.expired).toBe(0);
  expect(errors).toEqual([]);
});
