import { expect, test } from '@playwright/test';

for (const stage of ['camp', 'battle'] as const) {
  for (const width of [1440, 390]) {
    test(`late Giant walk artwork keeps its size on the first ${stage} frame at ${width}px`, async ({
      page,
      browserName,
    }) => {
      await page.setViewportSize({ width, height: width === 1440 ? 960 : 844 });
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      let releaseWalk!: () => void;
      let releaseNative!: () => void;
      const walk = new Promise<void>((resolve) => (releaseWalk = resolve));
      const native = new Promise<void>((resolve) => (releaseNative = resolve));
      await page.route('**/assets/characters/walk/giant*.webp', async (route) => {
        await walk;
        await route.continue();
      });
      await page.route('**/assets/troops-native/giant/graph.json', async (route) => {
        await native;
        await route.continue();
      });
      await page.goto('/?lazyart');
      await page.waitForFunction(() => window.__game?.scene.artSettled);
      await page.locator('[data-action="skip-tutorial"]').click();
      const expected = await page.evaluate(
        async ({ stage, shrunk }) => {
          const { makeBuilding } = await import('/src/game/model.ts');
          const { emptyArmy, emptySpells } = await import('/src/game/army.ts');
          const { TROOPS } = await import('/src/game/data.ts');
          const { troopArt } = await import('/src/game/troop-art.ts');
          const { applyShrink } = await import('/src/game/shrink-trap.ts');
          const { iso } = await import('/src/game/scene.ts');
          const { model, scene } = window.__game;
          scene.paused = true;
          model.state.obstacles = [];
          model.state.buildings = [
            makeBuilding(1, 'townhall', 24, 24),
            makeBuilding(2, 'camp', 30, 30),
          ];
          model.state.army = { ...emptyArmy(), giant: 1 };
          model.state.spells = emptySpells();
          model.state.king = undefined;
          if (stage === 'battle') {
            model.startBattle(0, true);
            model.activeTroop = 'giant';
            if (!model.deploy(10, 10)) throw Error('Could not deploy Giant');
            if (shrunk) applyShrink(model.battle.units[0], 0);
          }
          model.changed();
          scene.sync();
          scene.drawOverlay(0);
          const target =
            stage === 'camp'
              ? scene.ambientUnits[0]
              : scene.unitSprites.get(model.battle.units[0].id);
          window.__walkTarget = target;
          window.__walkStage = stage;
          const point = stage === 'camp' ? { x: target.x, y: target.y } : iso(10, 10);
          scene.cameras.main.setZoom(2).centerOn(point.x, point.y - 30);
          if (!target.getData('isFallback')) throw Error('Walk artwork arrived before the fixture');
          return (
            TROOPS.giant.width *
            troopArt('giant').displayScale *
            (stage === 'camp' ? 0.7 : shrunk ? 0.5 : 1)
          );
        },
        { stage, shrunk: width === 390 && stage === 'battle' },
      );
      releaseWalk();
      await page.waitForFunction(() => window.__game.scene.textures.exists('giant-walk'));
      const first = await page.evaluate(() => {
        const { scene } = window.__game;
        if (window.__walkStage === 'camp') scene.drawCampUnits();
        else scene.drawOverlay(0);
        const sprite = window.__walkTarget;
        return {
          texture: sprite.texture.key,
          width: sprite.displayWidth,
          height: sprite.displayHeight,
          visible: sprite.visible,
          fallback: sprite.getData('isFallback'),
        };
      });
      expect(first.texture).toBe('giant-walk');
      expect(first.fallback).toBe(false);
      expect(first.visible).toBe(true);
      expect(first.width).toBeCloseTo(expected, 6);
      expect(first.height).toBeCloseTo(expected, 6);
      await page.screenshot({
        path: `output/playtest/walk-handoff-${stage}-${width}-${browserName}.png`,
      });
      await page.evaluate(() => {
        const { model, scene } = window.__game;
        model.state.settings.reducedMotion = true;
        if (window.__walkStage === 'camp') scene.drawCampUnits();
        else scene.drawOverlay(0);
      });
      expect(await page.evaluate(() => window.__walkTarget.displayWidth)).toBeCloseTo(expected, 6);
      releaseNative();
      expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
      expect(errors).toEqual([]);
    });
  }
}

for (const width of [1440, 390]) {
  test(`late hero portrait keeps its size on the first battle frame at ${width}px`, async ({
    page,
    browserName,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize({ width, height: width === 1440 ? 960 : 844 });
    let releasePortrait!: () => void;
    let releaseAtlas!: () => void;
    const portrait = new Promise<void>((resolve) => (releasePortrait = resolve));
    const atlas = new Promise<void>((resolve) => (releaseAtlas = resolve));
    await page.route('**/hero-redesign-v1/queen/portrait.webp', async (route) => {
      await portrait;
      await route.continue();
    });
    await page.route('**/hero-redesign-v1/queen/atlas.json', async (route) => {
      await atlas;
      await route.continue();
    });
    await page.goto('/?lazyart');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').click();
    const expected = await page.evaluate(async (shrunk) => {
      const { makeBuilding } = await import('/src/game/model.ts');
      const { emptyArmy, emptySpells } = await import('/src/game/army.ts');
      const { applyShrink } = await import('/src/game/shrink-trap.ts');
      const { KING_ART } = await import('/src/game/king-art.ts');
      const { iso } = await import('/src/game/scene.ts');
      const { model, scene } = window.__game;
      scene.paused = true;
      model.state.buildings = [
        makeBuilding(1, 'townhall', 24, 24, 18),
        makeBuilding(2, 'herohall', 34, 34, 12),
      ];
      model.state.obstacles = [];
      model.state.nextId = 100;
      model.state.army = { ...emptyArmy(), swordsman: 1 };
      model.state.spells = emptySpells();
      model.state.king = undefined;
      model.state.heroes = { queen: { level: 1 } };
      model.state.heroLineup = ['queen'];
      model.startBattle(0, true);
      if (!model.deployNativeHero('queen', 10, 10)) throw Error('Could not deploy Queen');
      const unit = model.battle.units[0];
      if (shrunk) applyShrink(unit, 0);
      const point = iso(10, 10);
      scene.cameras.main.setZoom(2).centerOn(point.x, point.y);
      model.changed();
      scene.sync();
      scene.drawOverlay(0);
      window.__walkTarget = scene.unitSprites.get(unit.id);
      if (window.__walkTarget.texture.key !== 'troop-fallback')
        throw Error('Portrait arrived before the fixture');
      return KING_ART.width * (shrunk ? 0.5 : 1);
    }, width === 390);
    releasePortrait();
    await page.waitForFunction(() => window.__game.scene.textures.exists('hero-fallback-queen'));
    const first = await page.evaluate(() => {
      window.__game.scene.drawOverlay(0);
      const sprite = window.__walkTarget;
      return {
        width: sprite.displayWidth,
        height: sprite.displayHeight,
        texture: sprite.texture.key,
        visible: sprite.visible,
      };
    });
    releaseAtlas();
    expect(first.texture).toBe('hero-fallback-queen');
    expect(first.visible).toBe(true);
    expect(first.width).toBeCloseTo(expected, 6);
    expect(first.height).toBeCloseTo(expected, 6);
    await page.screenshot({
      path: `output/playtest/hero-portrait-handoff-${width}-${browserName}.png`,
    });
    expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
    expect(errors).toEqual([]);
  });
}
