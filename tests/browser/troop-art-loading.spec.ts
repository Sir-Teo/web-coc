import { expect, test } from '@playwright/test';

for (const stage of ['graph', 'textures'] as const) {
  for (const width of [1440, 390]) {
    test(`walk-sheet fallback stays visible with Invisibility until native ${stage} load at ${width}px`, async ({
      page,
      browserName,
    }) => {
      await page.setViewportSize({ width, height: width === 1440 ? 960 : 844 });
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      let releaseArt!: () => void;
      const art = new Promise<void>((resolve) => (releaseArt = resolve));
      await page.route('**/assets/troops-native/archer/graph.json', async (route) => {
        if (stage === 'graph') {
          await art;
          await route.continue();
          return;
        }
        // Development and production page these textures; use the graph's served URLs.
        const response = await route.fetch();
        const pack = (await response.json()) as {
          scenes: Record<string, { textures: Record<string, { path: string }> }>;
        };
        const paths = new Set(
          Object.values(pack.scenes).flatMap((scene) =>
            Object.values(scene.textures).map((texture) => texture.path),
          ),
        );
        for (const path of paths)
          await page.route('**/' + path, async (pageRoute) => {
            await art;
            await pageRoute.continue();
          });
        await route.fulfill({ response });
      });
      await page.goto('/?lazyart');
      await page.waitForFunction(() => window.__game?.scene.artSettled);
      await page.locator('[data-action="skip-tutorial"]').click();
      const id = await page.evaluate(async () => {
        const { makeBuilding } = await import('/src/game/model.ts');
        const { emptyArmy, emptySpells } = await import('/src/game/army.ts');
        const { iso } = await import('/src/game/scene.ts');
        const { model, scene } = window.__game;
        model.state.buildings = [
          makeBuilding(1, 'townhall', 24, 24, 18),
          makeBuilding(2, 'goldmine', 34, 34, 1),
        ];
        model.state.obstacles = [];
        model.state.army = { ...emptyArmy(), archer: 1 };
        model.state.spells = emptySpells();
        model.state.settings.reducedMotion = false;
        model.startBattle(0, true);
        scene.paused = true;
        model.activeTroop = 'archer';
        if (!model.deploy(10, 10)) throw Error('Could not deploy Archer');
        const unit = model.battle.units[0];
        const point = iso(unit.x, unit.y);
        scene.cameras.main.setZoom(2).centerOn(point.x, point.y - 20);
        scene.sync();
        scene.drawOverlay(0);
        return unit.id;
      });
      await page.waitForFunction((id) => {
        const scene = window.__game.scene;
        scene.drawOverlay(0);
        return scene.unitSprites.get(id)?.texture.key === 'archer-walk';
      }, id);
      await page.waitForFunction((stage) => {
        const scene = window.__game.scene;
        scene.drawOverlay(0);
        const p = scene.troopNativePresentation;
        return stage === 'graph' ? p.pending.has('archer') : p.pendingLevels.has('archer#1');
      }, stage);
      const initial = await page.evaluate((id) => {
        const { scene } = window.__game;
        const sprite = scene.unitSprites.get(id);
        return {
          visible: sprite.visible,
          native: scene.troopNativePresentation.drewUnit(id),
          alpha: sprite.alpha,
        };
      }, id);
      expect(initial.native).toBe(false);
      expect(initial.alpha).toBe(1);
      expect(initial.visible).toBe(true);
      await page.screenshot({
        path: `output/playtest/troop-loading-${stage}-${width}-${browserName}-normal.png`,
      });
      const report = await page.evaluate(async (id) => {
        const { castNativeSpell, stepNativeSpells } = await import('/src/game/native-spells.ts');
        const { unitInvisible } = await import('/src/game/native-status.ts');
        const { model, scene } = window.__game;
        const battle = model.battle;
        const unit = battle.units.find((u) => u.id === id);
        const cast = castNativeSpell(battle, 'Invisibility', 1, 'attack', unit.x, unit.y);
        battle.elapsed = cast.firstHit + 0.01;
        stepNativeSpells({ battle, damageBuilding() {}, effect: (fx) => scene.effect(fx) });
        scene.drawOverlay(0);
        const sprite = scene.unitSprites.get(id);
        return {
          invisible: unitInvisible(unit, battle.elapsed),
          native: scene.troopNativePresentation.drewUnit(id),
          texture: sprite.texture.key,
          visible: sprite.visible,
          alpha: sprite.alpha,
          width: sprite.displayWidth,
          glError: scene.game.renderer.gl.getError(),
        };
      }, id);
      expect(report.invisible).toBe(true);
      expect(report.native).toBe(false);
      expect(report.texture).toBe('archer-walk');
      expect(report.visible).toBe(true);
      expect(report.width).toBeGreaterThan(0);
      expect(report.glError).toBe(0);
      expect(report.alpha).toBeCloseTo(0.35);
      await page.screenshot({
        path: `output/playtest/troop-loading-${stage}-${width}-${browserName}-concealed.png`,
      });
      await page.evaluate(() => {
        window.__game.model.state.settings.reducedMotion = true;
        window.__game.scene.drawOverlay(0);
      });
      expect(
        await page.evaluate((id) => window.__game.scene.unitSprites.get(id).alpha, id),
      ).toBeCloseTo(0.35);
      const end = await page.evaluate(async () => {
        const { stepNativeSpells, spellRow } = await import('/src/game/native-spells.ts');
        const { seconds } = await import('/src/game/native-data.ts');
        const { model, scene } = window.__game;
        model.state.settings.reducedMotion = false;
        const battle = model.battle;
        const cast = battle.nativeSpells.find((c) => c.name === 'Invisibility');
        const end =
          cast.firstHit +
          (cast.total - 1) * cast.interval +
          seconds(spellRow(cast.name, cast.level), 'InvisibilityTime');
        battle.elapsed = end + 0.01;
        stepNativeSpells({ battle, damageBuilding() {}, effect: (fx) => scene.effect(fx) });
        scene.drawOverlay(0);
        return end;
      });
      expect(
        await page.evaluate((id) => {
          const sprite = window.__game.scene.unitSprites.get(id);
          return { visible: sprite.visible, alpha: sprite.alpha };
        }, id),
      ).toEqual({ visible: true, alpha: 1 });
      await page.evaluate((end) => {
        const { model, scene } = window.__game;
        model.battle.elapsed = end - 0.01;
        scene.drawOverlay(0);
      }, end);
      expect(
        await page.evaluate((id) => window.__game.scene.unitSprites.get(id).alpha, id),
      ).toBeCloseTo(0.35);
      releaseArt();
      await page.waitForFunction((id) => {
        const scene = window.__game.scene;
        scene.drawOverlay(0);
        return scene.troopNativePresentation.drewUnit(id);
      }, id);
      const native = await page.evaluate((id) => {
        const scene = window.__game.scene;
        const objects = scene.troopNativePresentation.views.get(id).view.objects;
        return {
          fallback: scene.unitSprites.get(id).visible,
          alpha: Math.max(...objects.filter((o) => o.visible).map((o) => o.alpha)),
          glError: scene.game.renderer.gl.getError(),
        };
      }, id);
      expect(native.fallback).toBe(false);
      expect(native.alpha).toBeCloseTo(0.35);
      expect(native.glError).toBe(0);
      await page.screenshot({
        path: `output/playtest/troop-loading-${stage}-${width}-${browserName}-native.png`,
      });
      const restored = await page.evaluate(
        ({ id, end }) => {
          const { model, scene } = window.__game;
          model.battle.elapsed = end + 0.01;
          scene.drawOverlay(0);
          return Math.max(
            ...scene.troopNativePresentation.views
              .get(id)
              .view.objects.filter((o) => o.visible)
              .map((o) => o.alpha),
          );
        },
        { id, end },
      );
      expect(restored).toBeCloseTo(1);
      expect(
        await page.evaluate((id) => {
          const { model, scene } = window.__game;
          model.battle.units = [];
          scene.drawOverlay(0);
          return {
            sprite: scene.unitSprites.has(id),
            native: scene.troopNativePresentation.views.has(id),
          };
        }, id),
      ).toEqual({ sprite: false, native: false });
      expect(errors).toEqual([]);
    });
  }
}
