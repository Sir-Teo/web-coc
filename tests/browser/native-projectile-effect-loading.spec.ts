import { expect, test } from '@playwright/test';

for (const mode of ['desktop', 'phone', 'retry'] as const) {
  const phone = mode !== 'desktop';
  test(`keeps projectile hits visible during loading and uses native art once ready (${mode})`, async ({
    page,
  }) => {
    if (phone) await page.setViewportSize({ width: 390, height: 844 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    let rejectEffects = mode === 'retry';
    let rejected = 0;
    let releaseEffects!: () => void;
    const effects = new Promise<void>((resolve) => (releaseEffects = resolve));
    await page.route('**/assets/effects-native/*/graph.json', async (route) => {
      if (rejectEffects) {
        rejected++;
        await route.fulfill({ status: 503, body: 'Temporarily unavailable' });
        return;
      }
      await effects;
      await route.continue();
    });
    await page.goto('/?lazyart');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').click();
    const sourceId = await page.evaluate(async () => {
      const { makeBuilding } = await import('/src/game/model.ts');
      const { iso } = await import('/src/game/scene.ts');
      const { model, scene } = window.__game;
      model.townhall!.level = 18;
      model.state.settings.reducedMotion = false;
      model.state.obstacles = [];
      const tower = makeBuilding(model.state.nextId++, 'ricochetcannon', 24, 14, 1);
      model.state.buildings.push(tower);
      model.startBattle(0, true);
      scene.paused = true;
      (model.battle.projectiles ??= []).push({
        id: 'loading-impact',
        weapon: 'native',
        sourceId: tower.id,
        targetId: 999,
        targetBuilding: false,
        fromX: 25.5,
        fromY: 15.5,
        x: 29.5,
        y: 15.5,
        launched: 0,
        impact: 1,
        damage: 1,
        native: { name: 'MergedCannonProjectile', kind: 'ricochetcannon', level: 1 },
      });
      scene.sync();
      const point = iso(29.5, 15.5);
      scene.cameras.main.centerOn(point.x, point.y);
      scene.drawOverlay(0);
      return tower.id;
    });
    await page.waitForFunction(() => {
      const scene = window.__game.scene;
      scene.drawOverlay(0);
      return scene.nativeProjectiles.covers('loading-impact');
    });
    expect(
      await page.evaluate(() => window.__game.scene.nativeProjectiles.views.has('loading-impact')),
    ).toBe(true);
    if (mode === 'retry') {
      await page.evaluate(() => {
        const { model, scene } = window.__game;
        model.battle.elapsed = 1.05;
        scene.drawOverlay(0);
      });
      await page.waitForFunction(() =>
        window.__game.scene.nativeEffectPacks.failed.has(
          'assets/effects-native/merged-cannon-projectile-destroyed/graph.json',
        ),
      );
    }
    const report = await page.evaluate(async (sourceId) => {
      const { iso } = await import('/src/game/scene.ts');
      const { model, scene } = window.__game;
      model.battle.elapsed = 1.05;
      const point = iso(29.5, 15.5);
      const view = scene.cameras.main.worldView;
      const before = [...scene.combatEffects.objects].filter(
        (o) => o.getData('impact') === 'native',
      ).length;
      scene.effect({
        type: 'impact',
        weapon: 'native',
        projectileId: 'loading-impact',
        sourceId,
        x: 25.5,
        y: 15.5,
        toX: 29.5,
        toY: 15.5,
      });
      scene.drawOverlay(0);
      return {
        fallback:
          [...scene.combatEffects.objects].filter((o) => o.getData('impact') === 'native').length -
          before,
        nativeViews: scene.nativeProjectiles.layer.views.size,
        pendingEffects: scene.nativeEffectPacks.pending.size,
        reduced: model.reducedMotion,
        onScreen:
          Math.abs(point.x - view.centerX) <= view.width / 2 &&
          Math.abs(point.y - view.centerY) <= view.height / 2,
        glError: scene.game.renderer.gl.getError(),
      };
    }, sourceId);
    if (mode === 'retry') expect(rejected).toBeGreaterThan(0);
    else expect(report.pendingEffects).toBeGreaterThan(0);
    expect(report.reduced).toBe(false);
    expect(report.onScreen).toBe(true);
    expect(report.nativeViews).toBe(0);
    expect(report.glError).toBe(0);
    expect(report.fallback).toBeGreaterThan(0);
    await page.screenshot({
      path: `output/playtest/native-projectile-${mode}-impact-loading.png`,
    });
    rejectEffects = false;
    releaseEffects();
    if (mode === 'retry') await page.evaluate(() => dispatchEvent(new Event('online')));
    await page.waitForFunction(() =>
      window.__game.scene.nativeProjectiles.coversImpact('loading-impact'),
    );
    const warm = await page.evaluate((sourceId) => {
      const { model, scene } = window.__game;
      model.battle.projectiles.push({
        ...model.battle.projectiles[0],
        id: 'warm-impact',
        launched: 2,
        impact: 3,
      });
      model.battle.elapsed = 2.5;
      scene.drawOverlay(0);
      const flight = scene.nativeProjectiles.views.has('warm-impact');
      const impact = scene.combatEffects.impact;
      let fallbackCalls = 0;
      scene.combatEffects.impact = function (...args) {
        fallbackCalls++;
        return impact.apply(this, args);
      };
      model.battle.elapsed = 3.05;
      scene.effect({
        type: 'impact',
        weapon: 'native',
        projectileId: 'warm-impact',
        sourceId,
        x: 25.5,
        y: 15.5,
        toX: 29.5,
        toY: 15.5,
      });
      scene.drawOverlay(0);
      scene.combatEffects.impact = impact;
      return {
        flight,
        fallbackCalls,
        nativeViews: scene.nativeProjectiles.layer.views.size,
        glError: scene.game.renderer.gl.getError(),
      };
    }, sourceId);
    expect(warm.flight).toBe(true);
    expect(warm.fallbackCalls).toBe(0);
    expect(warm.nativeViews).toBeGreaterThan(0);
    expect(warm.glError).toBe(0);
    await page.screenshot({
      path: `output/playtest/native-projectile-${mode}-impact-native.png`,
    });
    expect(
      await page.evaluate(() => {
        const p = window.__game.scene.nativeProjectiles;
        p.clear();
        return p.layer.views.size + p.views.size + p.history.size;
      }),
    ).toBe(0);
    expect(errors).toEqual([]);
  });
}
