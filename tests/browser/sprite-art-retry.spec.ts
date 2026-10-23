import { expect, test } from '@playwright/test';

for (const width of [1440, 390]) {
  test(`camp walk artwork recovers from a failed request at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 1440 ? 960 : 844 });
    let requests = 0;
    const times: number[] = [];
    await page.route('**/assets/characters/walk/giant*.webp', async (route) => {
      requests++;
      times.push(Date.now());
      if (requests === 1)
        await route.fulfill({
          status: 503,
          body: 'Temporarily unavailable',
          headers: { 'cache-control': 'no-store' },
        });
      else await route.continue();
    });
    await page.goto('/?lazyart');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').click();
    const expected = await page.evaluate(async () => {
      const { makeBuilding } = await import('/src/game/model.ts');
      const { emptyArmy } = await import('/src/game/army.ts');
      const { TROOPS } = await import('/src/game/data.ts');
      const { troopArt } = await import('/src/game/troop-art.ts');
      const { model, scene } = window.__game;
      scene.paused = true;
      model.state.obstacles = [];
      model.state.buildings = [
        makeBuilding(1, 'townhall', 24, 24),
        makeBuilding(2, 'camp', 30, 30),
      ];
      model.state.army = { ...emptyArmy(), giant: 1 };
      model.changed();
      scene.sync();
      scene.drawOverlay(0);
      return TROOPS.giant.width * troopArt('giant').displayScale * 0.7;
    });
    await expect.poll(() => requests).toBe(1);
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const { scene } = window.__game;
            scene.drawCampUnits();
            return scene.ambientUnits[0]?.texture.key;
          }),
        { timeout: 12000 },
      )
      .toBe('giant-walk');
    expect(requests).toBe(2);
    expect(times[1] - times[0]).toBeGreaterThanOrEqual(4500);
    expect(await page.evaluate(() => window.__game.scene.ambientUnits[0].displayWidth)).toBeCloseTo(
      expected,
      6,
    );
    expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
  });
}

for (const kind of ['giant', 'queen'] as const) {
  for (const width of [1440, 390]) {
    test(`battle ${kind} fallback recovers from a failed request at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: width === 1440 ? 960 : 844 });
      const path =
        kind === 'giant'
          ? '**/assets/characters/walk/giant*.webp'
          : '**/hero-redesign-v1/queen/portrait.webp';
      const heldPath =
        kind === 'giant'
          ? '**/assets/troops-native/giant/graph.json'
          : '**/hero-redesign-v1/queen/atlas.json';
      let requests = 0;
      let releaseNative!: () => void;
      const native = new Promise<void>((resolve) => (releaseNative = resolve));
      await page.route(heldPath, async (route) => {
        await native;
        await route.continue();
      });
      await page.route(path, async (route) => {
        if (++requests === 1)
          await route.fulfill({
            status: 503,
            body: 'Temporarily unavailable',
            headers: { 'cache-control': 'no-store' },
          });
        else await route.continue();
      });
      await page.goto('/?lazyart');
      await page.waitForFunction(() => window.__game?.scene.artSettled);
      await page.locator('[data-action="skip-tutorial"]').click();
      const unitId = await page.evaluate(
        async ({ kind, shrunk }) => {
          const { makeBuilding } = await import('/src/game/model.ts');
          const { emptyArmy, emptySpells } = await import('/src/game/army.ts');
          const { applyShrink } = await import('/src/game/shrink-trap.ts');
          const { iso } = await import('/src/game/scene.ts');
          const { model, scene } = window.__game;
          scene.paused = true;
          model.state.obstacles = [];
          model.state.buildings = [
            makeBuilding(1, 'townhall', 24, 24, kind === 'queen' ? 18 : 1),
            makeBuilding(2, 'herohall', 34, 34, 12),
          ];
          model.state.nextId = 100;
          model.state.army = { ...emptyArmy(), [kind === 'giant' ? 'giant' : 'swordsman']: 1 };
          model.state.spells = emptySpells();
          model.state.king = undefined;
          if (kind === 'queen') {
            model.state.heroes = { queen: { level: 1 } };
            model.state.heroLineup = ['queen'];
          }
          model.startBattle(0, true);
          if (kind === 'queen') {
            if (!model.deployNativeHero('queen', 10, 10)) throw Error('Queen deployment failed');
          } else {
            model.activeTroop = 'giant';
            if (!model.deploy(10, 10)) throw Error('Giant deployment failed');
          }
          const unit = model.battle.units[0];
          if (shrunk) applyShrink(unit, 0);
          model.changed();
          scene.sync();
          const point = iso(10, 10);
          scene.cameras.main.setZoom(2).centerOn(point.x, point.y - 30);
          scene.drawOverlay(0);
          return unit.id;
        },
        { kind, shrunk: width === 390 },
      );
      await expect.poll(() => requests).toBeGreaterThan(0);
      await expect
        .poll(
          () =>
            page.evaluate((id) => {
              const { scene } = window.__game;
              scene.drawOverlay(0);
              return scene.unitSprites.get(id)?.texture.key;
            }, unitId),
          { timeout: 12000 },
        )
        .toBe(kind === 'giant' ? 'giant-walk' : 'hero-fallback-queen');
      const sprite = await page.evaluate((id) => {
        const im = window.__game.scene.unitSprites.get(id);
        return { width: im.displayWidth, visible: im.visible, alpha: im.alpha };
      }, unitId);
      releaseNative();
      expect(requests).toBeGreaterThanOrEqual(2);
      expect(sprite.width).toBeCloseTo(
        (kind === 'giant' ? 66.6 : 88) * (width === 390 ? 0.5 : 1),
        6,
      );
      expect(sprite.visible).toBe(true);
      expect(sprite.alpha).toBe(1);
      expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
    });
  }
}
