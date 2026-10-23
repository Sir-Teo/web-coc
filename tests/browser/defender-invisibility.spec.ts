import { expect, test } from '@playwright/test';

for (const width of [1440, 390]) {
  test(`campaign Invisibility shows concealed defenders and restores bodies on expiry at ${width}px`, async ({
    page,
    browserName,
  }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: width === 1440 ? 960 : 844 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').click();
    await page.evaluate(() => window.__game.scene.loadLateAssets());
    const ids = await page.evaluate(async () => {
      const { makeBuilding } = await import('/src/game/model.ts');
      const { spawnGarrisonDefender } = await import('/src/game/garrison-combat.ts');
      const { spawnSkeleton } = await import('/src/game/defenders.ts');
      const { spellTowerState } = await import('/src/game/spell-tower.ts');
      const { iso } = await import('/src/game/scene.ts');
      const { model, scene } = window.__game;
      const { nativeLayout } = await import('/src/game/native-campaign.ts');
      const { replayBattle } = await import('/src/game/replay.ts');
      const { lateSetup } = await import('/tests/fixtures/late-defense-battle.ts');
      model.state.settings.reducedMotion = false;
      const layout = nativeLayout(88);
      const tower = layout.find((b) => b.spellTowerWeapon === 'invisibility');
      if (!tower) throw Error('Campaign has no Invisibility Spell Tower');
      const trap = makeBuilding(99991, 'skeletontrap', tower.x, tower.y + 2, 1);
      model.battle = replayBattle(lateSetup(88, {}, [tower, trap]), 44);
      const battle = model.battle;
      scene.paused = true;
      battle.elapsed = 1;
      battle.units = [];
      battle.defenders = [];
      const dragon = spawnGarrisonDefender(battle, 'dragon', 7, tower.id, tower.x - 1, tower.y, 0);
      const skeleton = spawnSkeleton(battle, trap, 0, 0);
      const ghost = spawnGarrisonDefender(
        battle,
        'royalghost',
        7,
        tower.id,
        tower.x + 3,
        tower.y,
        0,
      );
      spellTowerState(battle, tower);
      const point = iso(tower.x + 1.5, tower.y + 1.5);
      scene.cameras.main.setZoom(1.3).centerOn(point.x, point.y - 35);
      model.changed();
      scene.sync();
      scene.drawOverlay(0);
      return { tower: tower.id, dragon: dragon.id, skeleton: skeleton.id, ghost: ghost.id };
    });
    await page.waitForFunction(({ dragon, skeleton, ghost }) => {
      const scene = window.__game.scene;
      scene.drawOverlay(0);
      return (
        scene.garrisonPresentation.defenders
          .get(dragon)
          ?.objects.some((o) => o.visible && o.alpha > 0) &&
        scene.defenderSprites.get(skeleton)?.visible &&
        scene.garrisonPresentation.defenders
          .get(ghost)
          ?.objects.some((o) => o.visible && o.alpha > 0)
      );
    }, ids);
    const before = await page.evaluate(({ dragon, skeleton, ghost }) => {
      const scene = window.__game.scene;
      return {
        dragon: Math.max(
          ...scene.garrisonPresentation.defenders.get(dragon).objects.map((o) => o.alpha),
        ),
        skeleton: scene.defenderSprites.get(skeleton).alpha,
        ghost: Math.max(
          ...scene.garrisonPresentation.defenders.get(ghost).objects.map((o) => o.alpha),
        ),
      };
    }, ids);
    expect(before.dragon).toBeCloseTo(1);
    expect(before.skeleton).toBe(1);
    expect(before.ghost).toBeCloseTo(0.55);
    await page.screenshot({
      path: `output/playtest/defender-invisibility-normal-${width}-${browserName}.png`,
    });
    const concealed = await page.evaluate(async (ids) => {
      const { spellTowerDestroyed, stepSpellTower, spellTowerDefenderHidden } =
        await import('/src/game/spell-tower.ts');
      const { SPELL_TOWER } = await import('/src/game/spell-tower-stats.ts');
      const { model, scene } = window.__game;
      const battle = model.battle;
      const tower = battle.buildings.find((b) => b.id === ids.tower);
      tower.hp = 0;
      spellTowerDestroyed({ battle, phase: 'defenses', dt: 0.05 }, tower, battle.elapsed);
      const cast = battle.late.spellTower.casts[0];
      battle.elapsed = cast.deployAt + SPELL_TOWER.invisibility.spell.firstHit + 0.01;
      stepSpellTower({ battle, phase: 'auras', dt: 0.05 });
      scene.drawOverlay(0);
      const dragon = battle.defenders.find((d) => d.id === ids.dragon);
      const skeleton = battle.defenders.find((d) => d.id === ids.skeleton);
      return {
        hidden: [dragon, skeleton, battle.defenders.find((d) => d.id === ids.ghost)].map((d) =>
          spellTowerDefenderHidden(battle, d),
        ),
        dragon: Math.max(
          ...scene.garrisonPresentation.defenders.get(dragon.id).objects.map((o) => o.alpha),
        ),
        skeleton: scene.defenderSprites.get(skeleton.id).alpha,
        ghost: Math.max(
          ...scene.garrisonPresentation.defenders.get(ids.ghost).objects.map((o) => o.alpha),
        ),
        glError: scene.game.renderer.gl.getError(),
      };
    }, ids);
    expect(concealed.hidden).toEqual([true, true, true]);
    expect(concealed.glError).toBe(0);
    expect(concealed.dragon).toBeCloseTo(0.35);
    expect(concealed.skeleton).toBeCloseTo(0.35);
    expect(concealed.ghost).toBeCloseTo(0.35);
    await page.screenshot({
      path: `output/playtest/defender-invisibility-${width}-${browserName}.png`,
    });
    const read = () =>
      page.evaluate(({ dragon, skeleton, ghost }) => {
        const scene = window.__game.scene;
        scene.drawOverlay(0);
        const alpha = (id: number) =>
          Math.max(...scene.garrisonPresentation.defenders.get(id).objects.map((o) => o.alpha));
        return {
          dragon: alpha(dragon),
          skeleton: scene.defenderSprites.get(skeleton).alpha,
          ghost: alpha(ghost),
        };
      }, ids);
    await page.waitForTimeout(200);
    expect(await read()).toEqual({
      dragon: concealed.dragon,
      skeleton: concealed.skeleton,
      ghost: concealed.ghost,
    });
    await page.evaluate(() => {
      window.__game.model.state.settings.reducedMotion = true;
    });
    const reduced = await read();
    for (const alpha of Object.values(reduced)) expect(alpha).toBeCloseTo(0.35);
    const end = await page.evaluate(async () => {
      const { SPELL_TOWER } = await import('/src/game/spell-tower-stats.ts');
      const { stepSpellTower } = await import('/src/game/spell-tower.ts');
      const { model } = window.__game;
      model.state.settings.reducedMotion = false;
      const battle = model.battle;
      const cast = battle.late.spellTower.casts[0];
      const spell = SPELL_TOWER.invisibility.spell;
      const end =
        cast.deployAt + spell.firstHit + (spell.hits - 1) * spell.interval + spell.invisibilityTime;
      battle.elapsed = end + 0.01;
      stepSpellTower({ battle, phase: 'auras', dt: 0.05 });
      return end;
    });
    const restored = await read();
    expect(restored.dragon).toBeCloseTo(1);
    expect(restored.skeleton).toBe(1);
    expect(restored.ghost).toBeCloseTo(0.55);
    await page.screenshot({
      path: `output/playtest/defender-invisibility-restored-${width}-${browserName}.png`,
    });
    await page.evaluate((end) => {
      window.__game.model.battle.elapsed = end - 0.01;
    }, end);
    const rewound = await read();
    for (const alpha of Object.values(rewound)) expect(alpha).toBeCloseTo(0.35);
    await page.evaluate((end) => {
      window.__game.model.battle.elapsed = end + 0.01;
    }, end);
    expect(await read()).toEqual(restored);
    expect(errors).toEqual([]);
  });
}
