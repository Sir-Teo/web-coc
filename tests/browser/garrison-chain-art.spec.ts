import { test, expect } from '@playwright/test';

for (const viewport of [
  { width: 1440, height: 960 },
  { width: 390, height: 844 },
]) {
  test(`original Electro Dragon chains load lazily and survive pause/seek at ${viewport.width}px`, async ({
    page,
    browserName,
  }) => {
    await page.setViewportSize(viewport);
    const errors: string[] = [];
    const requests: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('request', (r) => {
      if (r.url().includes('/electro-dragon-attack-chain/')) requests.push(r.url());
    });
    await page.goto('/');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('#loading').waitFor({ state: 'detached' });
    expect(requests).toEqual([]);
    await page.evaluate(async () => {
      const { scene } = window.__game;
      const { spawnGarrisonDefender } = await import('/src/game/garrison-combat.ts');
      const { iso } = await import('/src/game/scene.ts');
      scene.model.startBattle(0, true);
      scene.paused = true;
      const battle = scene.model.battle;
      const dragon = spawnGarrisonDefender(battle, 'electrodragon', 3, 1, 26, 28, 0);
      dragon.attacks = [
        {
          at: 3,
          n: 0,
          x: 26,
          y: 28,
          targetId: 1,
          targetX: 28,
          targetY: 28,
          air: false,
          chain: [
            { targetId: 2, at: 3.128, fromX: 28, fromY: 28, x: 30, y: 28, air: true, damage: 896 },
          ],
        },
      ];
      battle.elapsed = 3.2;
      scene.sync();
      const point = iso(28, 28);
      scene.cameras.main.setZoom(2).centerOn(point.x, point.y - 35);
      scene.drawOverlay(0);
    });
    await page.waitForFunction(() => {
      const scene = window.__game.scene;
      scene.drawOverlay(0);
      return scene.garrisonPresentation.late.native.views.size === 2;
    });
    const report = await page.evaluate(async () => {
      const { iso } = await import('/src/game/scene.ts');
      const { scene, game } = window.__game;
      const battle = scene.model.battle;
      const late = scene.garrisonPresentation.late;
      const sample = (time: number, reduced = false) => {
        battle.elapsed = time;
        // Exercise the real presentation with its reduced-detail argument.
        scene.garrisonPresentation.render(battle, reduced, iso, 46);
        return [...late.native.views].map(([key, view]) => ({ key, objects: view.objects.length }));
      };
      const first = [...late.native.views].map(([key, view]) => ({
        key,
        objects: view.objects.length,
      }));
      const fallback = [...late.graphics.keys()].filter((k) => k.startsWith('late-chain:'));
      const expired = sample(5);
      const restored = sample(3.2);
      const paused = sample(3.2);
      const reduced = sample(3.2, true);
      const sourceTail = sample(3.3);
      return {
        first,
        fallback,
        expired,
        restored,
        paused,
        reduced,
        sourceTail,
        glError: game.renderer.gl.getError(),
      };
    });
    expect(report.first).toHaveLength(2);
    expect(report.first.every((v) => v.objects > 0)).toBe(true);
    expect(report.fallback).toEqual([]);
    expect(report.expired).toEqual([]);
    expect(report.restored).toEqual(report.first);
    expect(report.paused).toEqual(report.first);
    expect(report.reduced.every((v) => v.objects > 0)).toBe(true);
    expect(report.sourceTail).toHaveLength(2);
    expect(report.glError).toBe(0);
    expect(requests.filter((r) => r.endsWith('graph.json'))).toHaveLength(1);
    await page.screenshot({
      path: `output/playtest/garrison-chain-${viewport.width}-${browserName}.png`,
    });
    expect(
      await page.evaluate(() => {
        const late = window.__game.scene.garrisonPresentation.late;
        window.__game.scene.garrisonPresentation.clear();
        return [late.native.views.size, late.graphics.size];
      }),
    ).toEqual([0, 0]);
    expect(errors).toEqual([]);
  });
}

test('keeps chain fallbacks after an art failure and recovers when back online', async ({
  page,
}) => {
  const pack = '**/effects-native/electro-dragon-attack-chain/graph.json';
  await page.route(pack, (route) => route.fulfill({ status: 503, body: 'retry' }));
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('#loading').waitFor({ state: 'detached' });
  await page.evaluate(async () => {
    const { scene } = window.__game;
    const { spawnGarrisonDefender } = await import('/src/game/garrison-combat.ts');
    const { iso } = await import('/src/game/scene.ts');
    scene.model.startBattle(0, true);
    scene.paused = true;
    const battle = scene.model.battle;
    const dragon = spawnGarrisonDefender(battle, 'electrodragon', 3, 1, 28, 28, 0);
    dragon.attacks = [
      { at: 3, n: 0, x: 28, y: 28, targetId: 1, targetX: 30, targetY: 28, chain: [] },
    ];
    battle.elapsed = 3.1;
    scene.sync();
    const point = iso(28, 28);
    scene.cameras.main.centerOn(point.x, point.y);
    scene.drawOverlay(0);
  });
  await page.waitForFunction(() =>
    window.__game.scene.nativeEffectPacks.failed.has(
      'assets/effects-native/electro-dragon-attack-chain/graph.json',
    ),
  );
  expect(
    await page.evaluate(() => {
      const late = window.__game.scene.garrisonPresentation.late;
      return [late.graphics.size, late.native.views.size];
    }),
  ).toEqual([1, 0]);
  await page.unroute(pack);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await page.waitForFunction(() => {
    const scene = window.__game.scene;
    scene.drawOverlay(0);
    return scene.garrisonPresentation.late.native.views.size === 1;
  });
  expect(
    await page.evaluate(() => {
      const { scene, game } = window.__game;
      return [scene.garrisonPresentation.late.graphics.size, game.renderer.gl.getError()];
    }),
  ).toEqual([0, 0]);
});
