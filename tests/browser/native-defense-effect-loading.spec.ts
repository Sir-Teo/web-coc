import { expect, test } from '@playwright/test';

for (const chain of [false, true]) {
  test(`keeps ${chain ? 'chain' : 'primary'} zap visible while native art loads, then uses native art`, async ({
    page,
  }) => {
    if (chain) await page.setViewportSize({ width: 390, height: 844 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    let releaseEffects!: () => void;
    const effects = new Promise<void>((resolve) => (releaseEffects = resolve));
    await page.route('**/assets/effects-native/*/graph.json', async (route) => {
      await effects;
      await route.continue();
    });
    await page.goto('/?lazyart');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').click();
    const id = await page.evaluate(async () => {
      const { makeBuilding } = await import('/src/game/model.ts');
      const { iso } = await import('/src/game/scene.ts');
      const { model, scene } = window.__game;
      model.townhall!.level = 18;
      model.state.settings.reducedMotion = false;
      model.state.obstacles = [];
      const tower = makeBuilding(model.state.nextId++, 'superwizardtower', 24, 14, 1);
      model.state.buildings.push(tower);
      model.startBattle(0, true);
      scene.paused = true;
      scene.sync();
      const point = iso(tower.x + 1.5, tower.y + 1.5);
      scene.cameras.main.centerOn(point.x, point.y);
      return tower.id;
    });
    await page.waitForFunction(() => window.__game.scene.nativeDefenses.covers('superwizardtower'));
    const report = await page.evaluate(
      async ({ id, chain }) => {
        const { iso } = await import('/src/game/scene.ts');
        const { model, scene } = window.__game;
        const tower = model.battle.buildings.find((b) => b.id === id);
        const before = scene.liveSparks.size;
        const point = iso(tower.x + 1.5, tower.y + 1.5);
        const view = scene.cameras.main.worldView;
        scene.effect({
          type: 'defense-zap',
          sourceId: id,
          x: tower.x + 1.5,
          y: tower.y + 1.5,
          toX: tower.x + 5,
          toY: tower.y + 1.5,
          text: chain ? 'chain' : 'superwizardtower',
        });
        scene.drawOverlay(0);
        return {
          fallbackSparks: scene.liveSparks.size - before,
          nativeViews: scene.nativeDefenses.layer.views.size,
          pendingEffects: scene.nativeEffectPacks.pending.size,
          glError: scene.game.renderer.gl.getError(),
          reduced: model.reducedMotion,
          onScreen:
            Math.abs(point.x - view.centerX) <= view.width / 2 &&
            Math.abs(point.y - view.centerY) <= view.height / 2,
        };
      },
      { id, chain },
    );
    releaseEffects();
    expect(report.pendingEffects).toBeGreaterThan(0);
    expect(report.reduced).toBe(false);
    expect(report.onScreen).toBe(true);
    expect(report.fallbackSparks).toBeGreaterThan(0);
    expect(report.nativeViews).toBe(0);
    expect(report.glError).toBe(0);
    await page.screenshot({
      path: `output/playtest/defense-zap-${chain ? 'chain-phone' : 'primary-desktop'}-loading.png`,
    });
    await page.waitForFunction(
      ({ id, chain }) => {
        const { scene, model } = window.__game;
        return scene.nativeDefenses.coversZap(
          model.battle.buildings.find((b) => b.id === id),
          chain,
        );
      },
      { id, chain },
    );
    const warm = await page.evaluate(
      ({ id, chain }) => {
        const { scene, model } = window.__game;
        const tower = model.battle.buildings.find((b) => b.id === id);
        scene.nativeDefenses.clear();
        model.battle.elapsed = 1;
        const sparks = scene.sparks;
        let fallbackCalls = 0;
        scene.sparks = function (...args) {
          fallbackCalls++;
          return sparks.apply(this, args);
        };
        scene.effect({
          type: 'defense-zap',
          sourceId: id,
          x: tower.x + 1.5,
          y: tower.y + 1.5,
          toX: tower.x + 5,
          toY: tower.y + 1.5,
          text: chain ? 'chain' : 'superwizardtower',
        });
        scene.drawOverlay(0);
        scene.sparks = sparks;
        let nativeViews = 0;
        for (let frame = 1; frame <= 12; frame++) {
          model.battle.elapsed = 1 + frame / 60;
          scene.drawOverlay(0);
          nativeViews = Math.max(nativeViews, scene.nativeDefenses.layer.views.size);
        }
        const glError = scene.game.renderer.gl.getError();
        return {
          fallbackCalls,
          nativeViews,
          glError,
        };
      },
      { id, chain },
    );
    expect(warm.fallbackCalls).toBe(0);
    expect(warm.nativeViews).toBeGreaterThan(0);
    expect(warm.glError).toBe(0);
    await page.screenshot({
      path: `output/playtest/defense-zap-${chain ? 'chain-phone' : 'primary-desktop'}-native.png`,
    });
    expect(
      await page.evaluate(() => {
        const p = window.__game.scene.nativeDefenses;
        p.clear();
        return p.layer.views.size;
      }),
    ).toBe(0);
    expect(errors).toEqual([]);
  });
}

test('Giga Bomb reveal draws the pinned appear effect from the recorded trap state', async ({ page }) => {
  await page.setViewportSize({ width: 568, height: 320 });
  await page.goto('/?lazyart');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  const id = await page.evaluate(async () => {
    const { makeBuilding } = await import('/src/game/model.ts');
    const { emptyArmy } = await import('/src/game/army.ts');
    const { iso } = await import('/src/game/scene.ts');
    const { model, scene } = window.__game;
    const trap = makeBuilding(model.state.nextId++, 'gigabomb', 15, 22, 1);
    model.state.buildings = [
      makeBuilding(1, 'townhall', 24, 24, 17),
      makeBuilding(2, 'builder', 21, 33, 1),
      trap,
    ];
    model.state.obstacles = [];
    model.state.army = { ...emptyArmy(), giant: 6 };
    model.startBattle(0, true);
    scene.paused = true;
    scene.sync();
    const p = iso(16, 23);
    scene.cameras.main.centerOn(p.x, p.y);
    return trap.id;
  });
  await page.waitForFunction(() => {
    const { nativeDefenses } = window.__game.scene;
    return nativeDefenses.covers('gigabomb') &&
      nativeDefenses.layer.status('Giga Bomb Appear') === 'ready';
  });
  const observed = await page.evaluate((id) => {
    const { model, scene } = window.__game;
    const drawn = () => [...scene.nativeDefenses.layer.views.entries()].some(
      ([key, view]) => key.includes(`${id}:appear:0:timeline`) &&
        view.objects.some((object) => object.visible),
    );
    scene.drawOverlay(0);
    const before = drawn();
    model.activeTroop = 'giant';
    if (model.deployMany(13.5, 22.5, 4) !== 4) throw Error('Could not deploy Giants');
    for (let i = 0; i < 6; i++) model.step(0.05);
    scene.drawOverlay(0);
    return { before, after: drawn(), resolved: model.battle.traps[id]?.resolved };
  }, id);
  expect(observed).toEqual({ before: false, after: true, resolved: false });
});
