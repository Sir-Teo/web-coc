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
