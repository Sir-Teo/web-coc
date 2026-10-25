import { expect, test, type Page } from '@playwright/test';

test.use({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
});

async function boot(page: Page) {
  await page.goto('/?lazyart');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  await page.evaluate(async () => {
    const { makeBuilding } = await import('/src/game/model.ts');
    const { model, scene } = window.__game;
    const castle = makeBuilding(model.state.nextId++, 'clancastle', 32, 30, 1);
    model.state.buildings.push(castle);
    window.__garrisonCastleId = castle.id;
    model.changed();
    scene.sync();
  });
  await page.waitForFunction(() => window.__game.scene.artSettled);
}
async function scout(
  page: Page,
  kind: 'archer' | 'dragon' | 'balloon',
  reserve = true,
  withoutMonolith = false,
) {
  return page.evaluate(
    async ({ kind, reserve, withoutMonolith }) => {
      const { initializeGarrison } = await import('/src/game/garrison-release.ts');
      const { spawnGarrisonDefender } = await import('/src/game/garrison-combat.ts');
      const { model, scene } = window.__game;
      if (model.battle) model.returnHome();
      model.startBattle(0, true);
      const battle = model.battle;
      if (withoutMonolith)
        battle.buildings = battle.buildings.filter((building) => building.kind !== 'monolith');
      const level = kind === 'archer' ? 9 : kind === 'dragon' ? 7 : 8;
      battle.garrisons = reserve
        ? [
            initializeGarrison({
              castleId: window.__garrisonCastleId,
              mode: 'guard',
              troops: [{ kind, level, count: 1 }],
            }),
          ]
        : [];
      const defender = spawnGarrisonDefender(
        battle,
        kind,
        level,
        window.__garrisonCastleId,
        32,
        31,
        0,
      );
      model.changed();
      scene.sync();
      scene.cameras.main.centerOn(896, 1168);
      return defender.id;
    },
    { kind, reserve, withoutMonolith },
  );
}
async function visible(page: Page, id: number) {
  await page.waitForFunction(
    () => window.__game.scene.artSettled && !window.__game.scene.battleArtPending(),
  );
  await expect
    .poll(
      () =>
        page.evaluate((id) => {
          const { scene } = window.__game;
          scene.drawOverlay(0);
          return (
            scene.garrisonPresentation.defenders
              .get(id)
              ?.objects.filter(
                (object) =>
                  object.visible &&
                  object.alpha > 0 &&
                  !['__MISSING', '__DEFAULT'].includes(object.texture?.key),
              ).length ?? 0
          );
        }, id),
      { timeout: 30000 },
    )
    .toBeGreaterThan(0);
}
async function resident(page: Page) {
  return page.evaluate(() => {
    const { scene } = window.__game;
    const keys = scene.textures.getTextureKeys().filter((key) => !key.includes(':color:'));
    return {
      dragon: keys.some((key) => key.startsWith('garrison-dragon:mesh:')),
      balloon: keys.some((key) => key.startsWith('garrison-balloon:mesh:')),
      death: keys.some((key) => key.startsWith('garrison-dragonDeath:mesh:')),
      gl: scene.game.renderer.gl.getError(),
    };
  });
}

test('phone garrisons load only their bodies, extend a warm roster, and reload after home release', async ({
  page,
}) => {
  test.setTimeout(240000);
  const errors: string[] = [];
  const bodyGraphs = new Set<string>();
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname;
    if (
      (path.startsWith('/reference/characters/') &&
        path.endsWith('.json') &&
        !path.includes('/projectiles/') &&
        !path.endsWith('/catalog.json')) ||
      /\/reference\/garrison\/(dragon7|balloon8)\.json$/.test(path)
    )
      bodyGraphs.add(path);
  });
  await boot(page);
  await visible(page, await scout(page, 'archer'));
  expect(await resident(page)).toEqual({ dragon: false, balloon: false, death: true, gl: 0 });
  expect([...bodyGraphs]).toEqual(['/reference/characters/archer/archer9.json']);
  await visible(page, await scout(page, 'dragon'));
  expect(await resident(page)).toEqual({ dragon: true, balloon: false, death: true, gl: 0 });
  await page.evaluate(() => {
    const { scene } = window.__game;
    window.__dragonSources = Object.entries(scene.textures.list)
      .filter(([key]) => key.startsWith('garrison-dragon:mesh:') && !key.includes(':color:'))
      .map(([key, texture]) => [key, texture.source[0].glTexture]);
  });
  await visible(page, await scout(page, 'balloon'));
  expect(await resident(page)).toEqual({ dragon: true, balloon: true, death: true, gl: 0 });
  expect([...bodyGraphs].sort()).toEqual([
    '/reference/characters/archer/archer9.json',
    '/reference/garrison/balloon8.json',
    '/reference/garrison/dragon7.json',
  ]);
  expect(
    await page.evaluate(() =>
      window.__dragonSources.every(
        ([key, source]) => window.__game.scene.textures.get(key).source[0].glTexture === source,
      ),
    ),
  ).toBe(true);
  await page.evaluate(() => {
    const { scene, model } = window.__game;
    model.returnHome();
    scene.sync();
    scene.lateIdleSince = undefined;
    scene.releaseLateAssetsWhenIdle(1e9);
    scene.releaseLateAssetsWhenIdle(1e9 + 100000);
    scene.familyIdleSince = undefined;
    scene.releaseIdleFamilies(1e9);
    scene.releaseIdleFamilies(1e9 + 100000);
  });
  expect(await resident(page)).toEqual({ dragon: false, balloon: false, death: false, gl: 0 });
  await visible(page, await scout(page, 'dragon'));
  expect(await resident(page)).toEqual({ dragon: true, balloon: false, death: true, gl: 0 });
  expect(
    await page.evaluate(() =>
      window.__dragonSources.every(
        ([key, source]) => window.__game.scene.textures.get(key).source[0].glTexture !== source,
      ),
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test('recording defenders without a reserve load their foundation body and shared death', async ({
  page,
}) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await boot(page);
  await visible(page, await scout(page, 'dragon', false));
  expect(await resident(page)).toEqual({ dragon: true, balloon: false, death: true, gl: 0 });
  expect(errors).toEqual([]);
});

test('a failed Dragon body retries independently without fetching the Balloon body', async ({
  page,
}) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  const balloon: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (request.url().includes('/assets/garrison-native/balloon8/')) balloon.push(request.url());
  });
  // Exact atlas URLs are selected from the character graph below, before scouting starts.
  await boot(page);
  const path = await page.evaluate(async () => {
    const url = performance
      .getEntriesByType('resource')
      .find((entry) => entry.name.includes('/src/game/character-art.ts'))!.name;
    const { loadCharacterArt, characterArt } = await import(url);
    await loadCharacterArt();
    return '/' + Object.values(characterArt('Dragon7').graph.textures)[0].path;
  });
  const pattern = '**' + path;
  let requests = 0;
  await page.route(pattern, (route) => {
    requests++;
    return route.fulfill({ status: 503, body: 'Temporary Dragon outage' });
  });
  const id = await scout(page, 'dragon');
  await page.waitForFunction(() => window.__game.scene.artSettled);
  expect(requests).toBe(1);
  expect(balloon).toEqual([]);
  await page.unroute(pattern);
  await page.route(pattern, (route) => {
    requests++;
    return route.continue();
  });
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect.poll(() => requests).toBe(2);
  await visible(page, id);
  expect(
    await page.evaluate(async () => {
      const url = performance
        .getEntriesByType('resource')
        .find((entry) => entry.name.includes('/src/game/character-art.ts'))!.name;
      const { characterArt } = await import(url);
      const { nativeMeshesReady } = await import('/src/game/native-mesh-scene.ts');
      const art = characterArt('Dragon7');
      return nativeMeshesReady(window.__game.scene, art.graph, art.prefix);
    }),
  ).toBe(true);
  expect(await resident(page)).toEqual({ dragon: true, balloon: false, death: true, gl: 0 });
  expect(balloon).toEqual([]);
  expect(errors).toEqual([]);
});

test('releasing late art preserves shared death borrowed by the foundation family', async ({
  page,
}) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await boot(page);
  // Seed a late-only preload before any foundation family exists, so its pages really
  // are borrowed in the next reserve (recording defenders now load the shared family too).
  const sharedKeys = await page.evaluate(async () => {
    const { scene } = window.__game;
    await scene.loadLateArtRequest({
      withCharacters: true,
      buildingMask: 0,
      animations: new Set(['Archer9']),
    });
    return scene.lateTextureKeys.filter((key) => key.startsWith('garrison-dragonDeath:mesh:'));
  });
  expect(sharedKeys.length).toBeGreaterThan(0);
  // The next reserve borrows the resident death pages, then becomes their release owner.
  await visible(page, await scout(page, 'dragon'));
  await page.evaluate(() => {
    const { model, scene } = window.__game;
    model.returnHome();
    scene.sync();
    scene.lateIdleSince = undefined;
    scene.releaseLateAssetsWhenIdle(1e9);
    scene.releaseLateAssetsWhenIdle(1e9 + 100000);
  });
  expect(await resident(page)).toEqual({ dragon: true, balloon: false, death: true, gl: 0 });
  await visible(page, await scout(page, 'dragon'));
  expect(
    await page.evaluate(
      (keys) => keys.every((key) => window.__game.scene.textures.exists(key)),
      sharedKeys,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test('an ordinary garrison skips the late building module until a home building needs it', async ({
  page,
}) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  const requests: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/src/game/late-campaign-scene.ts')
      requests.push(request.url());
  });
  await boot(page);
  await visible(page, await scout(page, 'archer'));
  expect(requests).toEqual([]);
  const id = await page.evaluate(async () => {
    const { makeBuilding } = await import('/src/game/model.ts');
    const { model, scene } = window.__game;
    model.returnHome();
    const mono = makeBuilding(model.state.nextId++, 'monolith', 32, 32);
    model.state.buildings.push(mono);
    model.changed();
    scene.sync();
    scene.cameras.main.centerOn(896, 1184);
    return mono.id;
  });
  await page.waitForFunction(
    () => window.__game.scene.artSettled && !window.__game.scene.lateArtLoading,
  );
  await expect
    .poll(() =>
      page.evaluate((id) => {
        const { scene } = window.__game;
        scene.drawOverlay(0);
        return scene.children.list.some(
          (object) =>
            object.visible && object.alpha > 0 && object.getData?.('nativeMonolith')?.id === id,
        );
      }, id),
    )
    .toBe(true);
  expect(requests).toHaveLength(1);
  expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
  expect(errors).toEqual([]);
});

test('recorded workers without a hut still load their late presentation with no building families', async ({
  page,
}) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await boot(page);
  const id = await page.evaluate(async () => {
    const { makeBuilding } = await import('/src/game/model.ts');
    const { spawnDefendingBuilder } = await import('/src/game/defending-builder.ts');
    const { model, scene } = window.__game;
    model.startBattle(0, true);
    const battle = model.battle;
    battle.garrisons = [];
    battle.late ??= {};
    const worker = spawnDefendingBuilder(battle, makeBuilding(99999, 'builder', 32, 31, 2), 0);
    // A recorded worker can survive after its source hut has disappeared from the setup.
    battle.buildings = battle.buildings.filter((building) => building.kind !== 'builder');
    model.changed();
    await scene.loadLateAssets(true, battle, 0);
    scene.sync();
    scene.cameras.main.centerOn(896, 1168);
    return worker.id;
  });
  await expect
    .poll(() =>
      page.evaluate((id) => {
        const { scene } = window.__game;
        scene.drawOverlay(0);
        return scene.children.list.filter(
          (object) =>
            object.visible &&
            object.alpha > 0 &&
            object.getData?.('defendingBuilder') === id &&
            !['__MISSING', '__DEFAULT'].includes(object.texture?.key),
        ).length;
      }, id),
    )
    .toBeGreaterThan(0);
  expect(
    await page.evaluate(() => ({
      coverage: window.__game.scene.lateBuildingCoverage,
      gl: window.__game.game.renderer.gl.getError(),
    })),
  ).toEqual({ coverage: 0, gl: 0 });
  expect(errors).toEqual([]);
});

test('a warm home presentation survives a garrison-only enemy and the return home', async ({
  page,
}) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await boot(page);
  const id = await page.evaluate(async () => {
    const { makeBuilding } = await import('/src/game/model.ts');
    const { model, scene } = window.__game;
    const mono = makeBuilding(model.state.nextId++, 'monolith', 32, 32);
    model.state.buildings.push(mono);
    model.changed();
    scene.sync();
    return mono.id;
  });
  await page.waitForFunction(
    () => window.__game.scene.artSettled && !window.__game.scene.lateArtLoading,
  );
  await visible(page, await scout(page, 'archer', true, true));
  expect(await page.evaluate(() => window.__game.scene.wantedLateBuildings())).toBe(0);
  await page.evaluate(() => {
    const { model, scene } = window.__game;
    model.returnHome();
    scene.sync();
    scene.cameras.main.centerOn(896, 1184);
  });
  await expect
    .poll(() =>
      page.evaluate((id) => {
        const { scene } = window.__game;
        scene.drawOverlay(0);
        return scene.children.list.some(
          (object) =>
            object.visible && object.alpha > 0 && object.getData?.('nativeMonolith')?.id === id,
        );
      }, id),
    )
    .toBe(true);
  expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
  expect(errors).toEqual([]);
});
