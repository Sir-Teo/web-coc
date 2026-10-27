import { expect, test } from '@playwright/test';

for (const source of ['ghost', 'townhall'] as const)
  for (const hero of [false, true])
    for (const width of [1440, 390])
      test(`${source} frost tint follows ${hero ? 'King' : 'Giant'} art handoff and expiry at ${width}px`, async ({
        page,
        browserName,
      }) => {
        test.setTimeout(120000);
        await page.setViewportSize({ width, height: width === 1440 ? 960 : 844 });
        const errors: string[] = [];
        page.on('pageerror', (error) => errors.push(error.message));
        let release!: () => void;
        const held = new Promise<void>((resolve) => (release = resolve));
        await page.route(
          hero
            ? '**/assets/characters/king-v1/atlas.json'
            : '**/assets/troops-native/giant/graph.json',
          async (route) => {
            await held;
            await route.continue();
          },
        );
        const report = () =>
          page.evaluate((hero) => {
            const { model, scene } = window.__game;
            scene.drawOverlay(0);
            const id = window.__frostAttacker.id;
            const fallback = scene.unitSprites.get(id);
            const objects = hero
              ? scene.children.list.filter((o) => o.getData?.('nativeHero') === id)
              : (scene.troopNativePresentation.views.get(id)?.view.objects ?? []);
            const visible = objects.filter((o) => o.visible && o.alpha > 0);
            return {
              fallback: { tint: fallback.tintTopLeft, visible: fallback.visible },
              native: visible.length,
              tints: visible.map((o) =>
                o.vertices !== undefined || o.nativeColored ? o.tint : o.tintTopLeft,
              ),
            };
          }, hero);
        try {
          await page.goto('/?lazyart');
          await page.waitForFunction(() => window.__game?.scene.artSettled);
          await page.locator('[data-action="skip-tutorial"]').click();
          await page.evaluate(
            async ({ source, hero }) => {
              const { attackerFrostArena, applyAttackerFrost } =
                await import('/tests/fixtures/attacker-frost.ts');
              const { model, scene } = window.__game;
              scene.paused = true;
              const { battle, unit } = attackerFrostArena(hero, model);
              window.__frostAttacker = {
                id: unit.id,
                until: applyAttackerFrost(battle, unit, source),
              };
              model.changed();
              scene.sync();
              const { iso } = await import('/src/game/scene.ts');
              const point = iso(unit.x, unit.y);
              scene.cameras.main.setZoom(2).centerOn(point.x, point.y - 40);
              scene.drawOverlay(0);
            },
            { source, hero },
          );
          await page.waitForFunction((hero) => {
            const scene = window.__game.scene;
            scene.drawOverlay(0);
            const sprite = scene.unitSprites.get(window.__frostAttacker.id);
            return (
              sprite?.visible &&
              (hero ? sprite.texture.key !== 'troop-fallback' : sprite.texture.key === 'giant-walk')
            );
          }, hero);
          expect((await report()).fallback.tint).toBe(0xa8e6ff);
          expect((await report()).native).toBe(0);
          release();
          await expect
            .poll(async () => (await report()).native, { timeout: 30000 })
            .toBeGreaterThan(0);
          const native = await report();
          expect(native.tints).toContain(0xa8e6ff);
          expect(native.fallback.visible).toBe(false);
          expect((await report()).tints).toEqual(native.tints);
          await page.evaluate(() => {
            window.__game.model.state.settings.reducedMotion = true;
          });
          expect((await report()).tints).toContain(0xa8e6ff);
          await page.screenshot({
            path: `output/playtest/attacker-frost-${source}-${hero ? 'king' : 'giant'}-${width}-${browserName}.png`,
          });
          await page.evaluate(() => {
            window.__game.model.battle.elapsed = window.__frostAttacker.until;
          });
          const expired = await report();
          expect(expired.fallback.tint).toBe(0xffffff);
          expect(expired.tints).not.toContain(0xa8e6ff);
          await page.evaluate(async (source) => {
            const { applyAttackerFrost } = await import('/tests/fixtures/attacker-frost.ts');
            const { model } = window.__game;
            const unit = model.battle.units.find((u) => u.id === window.__frostAttacker.id);
            applyAttackerFrost(model.battle, unit, source);
          }, source);
          expect((await report()).tints).toContain(0xa8e6ff);
          await page.evaluate(() => {
            const { model } = window.__game;
            const unit = model.battle.units.find((u) => u.id === window.__frostAttacker.id);
            unit.hp = 0;
            unit.defeatedAt = model.battle.elapsed;
          });
          const defeated = await report();
          expect(defeated.fallback.tint).not.toBe(0xa8e6ff);
          expect(defeated.tints).not.toContain(0xa8e6ff);
          await page.evaluate(() => {
            const { model, scene } = window.__game;
            model.returnHome();
            model.changed();
            scene.sync();
            scene.drawOverlay(0);
          });
          expect(await page.evaluate(() => window.__game.scene.unitSprites.size)).toBe(0);
          expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
          expect(errors).toEqual([]);
        } finally {
          release();
        }
      });
