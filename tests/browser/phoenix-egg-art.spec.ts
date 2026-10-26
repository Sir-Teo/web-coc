import { expect, test } from '@playwright/test';

for (const width of [390, 1440]) {
  test(`Phoenix Egg uses its original ground animation at ${width}px`, async ({ page }) => {
    test.setTimeout(120000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewportSize({ width, height: width === 390 ? 844 : 960 });
    await page.goto('/?lazyart');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').click();
    await page.evaluate(async () => {
      const { model, scene } = window.__game;
      const { makeBuilding } = await import('/src/game/model.ts');
      const { emptyArmy, emptySpells } = await import('/src/game/army.ts');
      const { nativeUnitStats } = await import('/src/game/native-units.ts');
      const { iso } = await import('/src/game/scene.ts');
      scene.paused = true;
      model.state.obstacles = [];
      model.state.buildings = [makeBuilding(1, 'townhall', 36, 36, 18)];
      model.state.army = { ...emptyArmy(), swordsman: 1 };
      model.state.spells = emptySpells();
      model.state.king = undefined;
      model.startBattle(0, true);
      const stats = nativeUnitStats('phoenixegg', 1);
      model.battle.units = [
        {
          id: 1000,
          kind: 'phoenixegg',
          level: 1,
          x: 10,
          y: 10,
          hp: stats.hp,
          maxHp: stats.hp,
          cooldown: 0,
          target: null,
          path: [],
          pathAt: 0,
          attacking: false,
          spawnedAt: 0,
          native: {},
        },
      ];
      model.battle.elapsed = 1;
      model.changed();
      scene.sync();
      const p = iso(10, 10);
      scene.cameras.main.setZoom(innerWidth === 390 ? 2 : 3).centerOn(p.x, p.y - 35);
      scene.drawOverlay(0);
    });
    await expect
      .poll(() =>
        page.evaluate(() => {
          const { scene } = window.__game;
          scene.drawOverlay(0);
          const sprite = scene.heroNativePresentation.sprites.get(1000);
          return sprite?.visible ? sprite.texture.key : '';
        }),
      )
      .toBe('baked:heroes-native/phoenixegg/walk.png');
    const before = await page.evaluate(() => JSON.stringify(window.__game.model.battle));
    await page.screenshot({ path: `output/playtest/phoenix-egg-native-${width}.png` });
    const result = await page.evaluate(async () => {
      const { model, scene } = window.__game;
      const { iso } = await import('/src/game/scene.ts');
      const egg = model.battle.units[0];
      scene.drawOverlay(0);
      const sprite = scene.heroNativePresentation.sprites.get(1000);
      const ground = sprite.y === iso(egg.x, egg.y).y;
      model.toggleReducedMotion();
      scene.drawOverlay(0);
      const reduced =
        sprite.visible && sprite.texture.key === 'baked:heroes-native/phoenixegg/walk.png';
      return {
        ground,
        reduced,
        battle: JSON.stringify(model.battle),
        gl: window.__game.game.renderer.gl.getError(),
      };
    });
    expect(result.ground && result.reduced).toBe(true);
    expect(result.battle).toBe(before);
    expect(result.gl).toBe(0);
    expect(errors).toEqual([]);
  });
}
