import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function boot(page: Page) {
  await page.goto('/?lazyart');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
}
async function addHomeBuilding(page: Page, kind: 'monolith' | 'builder') {
  return page.evaluate(async (kind) => {
    const { makeBuilding } = await import('/src/game/model.ts');
    const { model, scene } = window.__game;
    const building = makeBuilding(model.state.nextId++, kind, 32, 32, kind === 'builder' ? 4 : 1);
    model.state.buildings.push(building);
    model.changed();
    scene.sync();
    scene.cameras.main.centerOn(896, 1184);
    return building.id;
  }, kind);
}
async function scoutDefender(page: Page, kind = 'archer', level = 9) {
  return page.evaluate(
    async ({ kind, level }) => {
      const { spawnGarrisonDefender } = await import('/src/game/garrison-combat.ts');
      const { model, scene } = window.__game;
      model.startBattle(0, true);
      const battle = model.battle;
      spawnGarrisonDefender(battle, kind, level, battle.buildings[0].id, 32, 31, 0);
      model.changed();
      scene.sync();
      return {
        battle: !!model.battle,
        loading: scene.lateArtLoading,
        ready: scene.lateCharactersReady,
        pending: scene.battleArtPending(),
        keys: scene.lateCharacterKeys.length,
      };
    },
    { kind, level },
  );
}

test('upgraded home Builder huts render without requesting the late combat batch', async ({
  page,
}) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  const characterRequests: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (request.url().includes('/assets/characters-native/')) characterRequests.push(request.url());
  });
  await boot(page);
  const id = await addHomeBuilding(page, 'builder');
  await page.waitForFunction(
    (id) =>
      window.__game.scene.children.list.some(
        (object) => object.visible && object.getData?.('nativeVillage') === id,
      ),
    id,
  );
  expect(
    await page.evaluate(() => ({
      ready: window.__game.scene.lateAssetsReady,
      loading: window.__game.scene.lateArtLoading,
      gl: window.__game.game.renderer.gl.getError(),
    })),
  ).toEqual({ ready: false, loading: false, gl: 0 });
  expect(characterRequests).toEqual([]);
  expect(errors).toEqual([]);
});

for (const inFlight of [false, true]) {
  test(`home late art extends to battle characters and releases them again (${inFlight ? 'in-flight' : 'settled'})`, async ({
    page,
  }) => {
    test.setTimeout(180000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    let release!: () => void;
    let requests = 0;
    const gate = new Promise<void>((resolve) => (release = resolve));
    await page.route('**/assets/characters-native/**', async (route) => {
      requests++;
      await gate;
      await route.continue();
    });
    await boot(page);
    const id = await addHomeBuilding(page, 'monolith');
    if (!inFlight) {
      await page.waitForFunction((id) => {
        const { scene } = window.__game;
        return (
          scene.lateAssetsReady &&
          !scene.lateArtLoading &&
          scene.lateCampaign.families.some((family) => family.towers?.has(id))
        );
      }, id);
      expect(requests).toBe(0);
      expect(await page.evaluate(() => window.__game.scene.lateCharactersReady)).toBe(false);
    }
    await scoutDefender(page);
    await expect.poll(() => requests, { timeout: 30000 }).toBeGreaterThan(0);
    expect(
      await page.evaluate(() => ({
        pending: window.__game.scene.battleArtPending(),
        elapsed: window.__game.model.battle.elapsed,
        characters: window.__game.scene.lateCharactersReady,
      })),
    ).toEqual({ pending: true, elapsed: 0, characters: false });
    release();
    await page.waitForFunction(
      () =>
        window.__game.scene.lateCharactersReady &&
        !window.__game.scene.lateArtLoading &&
        !window.__game.scene.battleArtPending(),
    );
    const released = await page.evaluate(() => {
      const { model, scene } = window.__game;
      const characters = [...scene.lateCharacterKeys];
      scene.releasedCharacterSourcesForTest = new Set(
        characters.map((key) => scene.textures.get(key).source[0].glTexture),
      );
      const keep = scene.lateTextureKeys.filter((key) => !characters.includes(key));
      model.returnHome();
      scene.sync();
      scene.lateIdleSince = undefined;
      scene.releaseLateAssetsWhenIdle(0);
      const beforeGrace = characters.every((key) => scene.textures.exists(key));
      scene.releaseLateAssetsWhenIdle(20001);
      return {
        count: characters.length,
        beforeGrace,
        remaining: characters.filter((key) => scene.textures.exists(key)),
        buildingsKept: keep.every((key) => scene.textures.exists(key)),
        buildingReady: scene.lateAssetsReady,
        characterReady: scene.lateCharactersReady,
      };
    });
    expect(released.count).toBeGreaterThan(0);
    expect(released.beforeGrace).toBe(true);
    expect(released.remaining).toEqual([]);
    expect(released.buildingsKept).toBe(true);
    expect(released.buildingReady).toBe(true);
    expect(released.characterReady).toBe(false);
    await page.waitForFunction(
      (id) => window.__game.scene.lateCampaign.families.some((family) => family.towers?.has(id)),
      id,
    );
    const restarted = await scoutDefender(page);
    await page.waitForFunction(
      () =>
        window.__game.scene.lateCharactersReady &&
        !window.__game.scene.lateArtLoading &&
        !window.__game.scene.battleArtPending(),
    );
    const finalState = await page.evaluate(() => {
      const { scene } = window.__game;
      return {
        loading: scene.lateArtLoading,
        ready: scene.lateCharactersReady,
        keys: scene.lateCharacterKeys.length,
        loaded: scene.lateCharacterKeys.filter((key) => scene.textures.exists(key)).length,
        recreated: scene.lateCharacterKeys.every(
          (key) =>
            !scene.releasedCharacterSourcesForTest.has(scene.textures.get(key).source[0].glTexture),
        ),
      };
    });
    expect(restarted).toMatchObject({ battle: true, loading: true, ready: false, pending: true });
    expect(finalState.keys).toBeGreaterThan(0);
    expect(finalState.loaded).toBe(finalState.keys);
    expect(finalState.recreated).toBe(true);
    expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
    expect(errors).toEqual([]);
  });
}

test('a failed defender page retries after returning to a home village with late buildings', async ({
  page,
}) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => performance.setResourceTimingBufferSize(4000));
  await boot(page);
  await addHomeBuilding(page, 'monolith');
  await page.waitForFunction(
    () => window.__game.scene.lateAssetsReady && !window.__game.scene.lateArtLoading,
  );
  // Read the failure target without priming the character module that the home no longer needs.
  const graph = JSON.parse(
    await readFile('reference/characters/electro_dragon/electrodragon-lvl3.json', 'utf8'),
  ) as { textures: Record<string, { path: string; width: number; height: number }> };
  const [id, texture] = Object.entries(graph.textures).find(
    ([, texture]) =>
      texture.path.includes('/characters-native/') && texture.width * texture.height > 1_000_000,
  )!;
  const target = { key: `character-electrodragon-lvl3:mesh:${id}`, path: '/' + texture.path };
  let attempts = 0;
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === target.path) attempts++;
  });
  await page.route('**' + target.path, (route) =>
    route.fulfill({ status: 503, body: 'Temporary outage' }),
  );
  await scoutDefender(page, 'electrodragon', 3);
  await page.waitForFunction(
    () => !!window.__game.scene.lateArtFailure && !window.__game.scene.lateArtLoading,
  );
  expect(await page.evaluate(() => window.__game.scene.lateCharactersReady)).toBe(true);
  await page.evaluate(() => {
    window.__game.model.returnHome();
    window.__game.scene.sync();
  });
  const before = attempts;
  await page.unroute('**' + target.path);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await page.waitForFunction((key) => {
    const { scene } = window.__game;
    return !scene.lateArtFailure && !scene.lateArtLoading && scene.textures.exists(key);
  }, target.key);
  expect(attempts).toBeGreaterThan(before);
  expect(
    await page.evaluate(() => ({
      battle: window.__game.model.battle,
      buildingReady: window.__game.scene.lateAssetsReady,
      characterReady: window.__game.scene.lateCharactersReady,
      error: window.__game.game.renderer.gl.getError(),
    })),
  ).toEqual({ battle: null, buildingReady: true, characterReady: true, error: 0 });
  expect(errors).toEqual([]);
});

test('leaving scouting cancels a character extension waiting on the home building load', async ({
  page,
}) => {
  test.setTimeout(120000);
  let characters = 0;
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (request.url().includes('/assets/characters-native/')) characters++;
  });
  await boot(page);
  const id = await page.evaluate(async () => {
    const { makeBuilding } = await import('/src/game/model.ts');
    const { spawnGarrisonDefender } = await import('/src/game/garrison-combat.ts');
    const { model, scene } = window.__game;
    const building = makeBuilding(model.state.nextId++, 'monolith', 32, 32, 1);
    model.state.buildings.push(building);
    model.changed();
    scene.sync();
    model.startBattle(0, true);
    spawnGarrisonDefender(model.battle, 'archer', 9, model.battle.buildings[0].id, 32, 31, 0);
    scene.sync();
    model.returnHome();
    scene.sync();
    scene.cameras.main.centerOn(896, 1184);
    return building.id;
  });
  await page.waitForFunction((id) => {
    const { scene } = window.__game;
    return (
      scene.lateAssetsReady &&
      !scene.lateArtLoading &&
      scene.lateCampaign.families.some((family) => family.towers?.has(id))
    );
  }, id);
  expect(
    await page.evaluate(() => ({
      battle: window.__game.model.battle,
      characters: window.__game.scene.lateCharactersReady,
      loading: window.__game.scene.lateArtLoading,
      error: window.__game.game.renderer.gl.getError(),
    })),
  ).toEqual({ battle: null, characters: false, loading: false, error: 0 });
  expect(characters).toBe(0);
  expect(errors).toEqual([]);
});

test('a different next defender roster loads its missing atlases without loading unrelated bodies', async ({
  page,
}) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await boot(page);
  await addHomeBuilding(page, 'monolith');
  await page.waitForFunction(
    () => window.__game.scene.lateAssetsReady && !window.__game.scene.lateArtLoading,
  );
  await scoutDefender(page, 'golem', 8);
  await page.waitForFunction(
    () => !window.__game.scene.lateArtLoading && !window.__game.scene.battleArtPending(),
  );
  const first = await page.evaluate(() => [...window.__game.scene.lateCharacterAnimations]);
  expect(first).toEqual(expect.arrayContaining(['Golem_lvl6', 'GolemSmall_lvl6']));
  expect(first).not.toContain('Necromancer_lvl2');
  await page.evaluate(() => {
    window.__game.model.returnHome();
    window.__game.scene.sync();
  });
  const second = await scoutDefender(page, 'witch', 4);
  expect(second).toMatchObject({ loading: true, pending: true });
  await page.waitForFunction(
    () => !window.__game.scene.lateArtLoading && !window.__game.scene.battleArtPending(),
  );
  const result = await page.evaluate(() => {
    const { scene, game } = window.__game;
    return {
      names: [...scene.lateCharacterAnimations],
      all: scene.lateAllCharactersReady,
      unrelated: Object.keys(scene.textures.list).filter((key) =>
        key.startsWith('character-electrodragon-'),
      ),
      bodies: [...scene.garrisonPresentation.defenders.values()].reduce(
        (n, v) => n + v.objects.filter((o) => o.visible).length,
        0,
      ),
      error: game.renderer.gl.getError(),
    };
  });
  expect(result.names).toEqual(
    expect.arrayContaining(['Golem_lvl6', 'GolemSmall_lvl6', 'Necromancer_lvl2', 'Skeleton']),
  );
  expect(result.all).toBe(false);
  expect(result.unrelated).toEqual([]);
  await expect
    .poll(() => page.evaluate(() => window.__game.scene.garrisonPresentation.defenders.size))
    .toBeGreaterThan(0);
  expect(result.error).toBe(0);
  expect(errors).toEqual([]);
});

test('an explicit full preload waits for the rest of the characters after an active selective request', async ({
  page,
}) => {
  test.setTimeout(180000);
  await boot(page);
  await addHomeBuilding(page, 'monolith');
  await page.waitForFunction(
    () => window.__game.scene.lateAssetsReady && !window.__game.scene.lateArtLoading,
  );
  const result = await page.evaluate(async () => {
    const { spawnGarrisonDefender } = await import('/src/game/garrison-combat.ts');
    const { scene, model, game } = window.__game;
    model.startBattle(0, true);
    spawnGarrisonDefender(model.battle, 'witch', 4, model.battle.buildings[0].id, 32, 31, 0);
    model.changed();
    scene.sync();
    const active = scene.lateArtLoading && !scene.lateAllCharactersReady;
    await scene.loadLateAssets();
    return {
      active,
      all: scene.lateAllCharactersReady,
      ready: scene.lateCharactersReady,
      unrelated: Object.keys(scene.textures.list).some((key) =>
        key.startsWith('character-electrodragon-'),
      ),
      error: game.renderer.gl.getError(),
    };
  });
  expect(result).toEqual({ active: true, all: true, ready: true, unrelated: true, error: 0 });
});

test('automatic loading includes Ghost Trap bodies and armed hut workers before they spawn', async ({
  page,
}) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.text().startsWith('Skipped drawing')) errors.push(message.text());
  });
  await boot(page);
  const hutId = await addHomeBuilding(page, 'builder');
  await page.evaluate(async () => {
    const { makeBuilding } = await import('/src/game/model.ts');
    const { model, scene } = window.__game;
    const trap = makeBuilding(model.state.nextId++, 'bomb', 34, 32, 1);
    trap.npc = 'ghost-trap';
    model.state.buildings.push(trap);
    model.changed();
    scene.sync();
    model.startBattle(0, true);
    scene.sync();
    scene.cameras.main.centerOn(896, 1184);
  });
  await page.waitForFunction(
    () => !window.__game.scene.lateArtLoading && !window.__game.scene.battleArtPending(),
  );
  const spawned = await page.evaluate(async (hutId) => {
    const { spawnDefendingBuilder } = await import('/src/game/defending-builder.ts');
    const { spawnGarrisonDefender } = await import('/src/game/garrison-combat.ts');
    const { ghostTrapSource } = await import('/src/game/ghost-trap.ts');
    const { model, scene } = window.__game;
    const battle = model.battle,
      hut = battle.buildings.find((b) => b.id === hutId);
    const worker = spawnDefendingBuilder(battle, hut, 0);
    const source = ghostTrapSource();
    const ghost = spawnGarrisonDefender(battle, source.kind, source.level, hut.id, 33, 32, 0);
    ghost.stealthUntil = 0;
    battle.elapsed = 0.2;
    model.changed();
    scene.sync();
    scene.drawOverlay(200);
    return { worker: worker.id, ghost: ghost.id };
  }, hutId);
  const result = await page.evaluate(
    (ids) => ({
      worker: window.__game.scene.children.list.filter(
        (o) => o.visible && o.alpha > 0 && o.getData?.('defendingBuilder') === ids.worker,
      ).length,
      ghost:
        window.__game.scene.garrisonPresentation.defenders
          .get(ids.ghost)
          ?.objects.filter((o) => o.visible && o.alpha > 0).length ?? 0,
      all: window.__game.scene.lateAllCharactersReady,
      error: window.__game.game.renderer.gl.getError(),
    }),
    spawned,
  );
  expect(result.worker).toBeGreaterThan(0);
  expect(result.ghost).toBeGreaterThan(0);
  expect(result.all).toBe(false);
  expect(result.error).toBe(0);
  expect(errors).toEqual([]);
});

test('a late battle with no possible defenders requests no character payload', async ({ page }) => {
  test.setTimeout(120000);
  let requests = 0;
  let graphRequests = 0;
  page.on('request', (request) => {
    if (request.url().includes('/assets/characters-native/')) requests++;
    if (new URL(request.url()).pathname === '/src/game/character-graphs.ts') graphRequests++;
  });
  await page.route('**/src/game/character-graphs.ts*', (route) =>
    route.fulfill({ status: 503, body: 'Unused character module unavailable' }),
  );
  await boot(page);
  await addHomeBuilding(page, 'monolith');
  await page.waitForFunction(
    () => window.__game.scene.lateAssetsReady && !window.__game.scene.lateArtLoading,
  );
  await page.evaluate(() => {
    window.__game.model.startBattle(0, true);
    window.__game.scene.sync();
  });
  await page.waitForFunction(
    () => !window.__game.scene.lateArtLoading && !window.__game.scene.battleArtPending(),
  );
  expect(
    await page.evaluate(async () => {
      const { characterArtLoaded } = await import('/src/game/character-art.ts');
      return {
        battle: !!window.__game.model.battle,
        characters: window.__game.scene.lateCharactersReady,
        graphs: characterArtLoaded(),
        keys: window.__game.scene.lateCharacterKeys.length,
        error: window.__game.game.renderer.gl.getError(),
      };
    }),
  ).toEqual({ battle: true, characters: false, graphs: false, keys: 0, error: 0 });
  expect(requests).toBe(0);
  expect(graphRequests).toBe(0);
});

test('a first defender module failure after home building loading honors backoff and reconnects', async ({
  page,
}) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await boot(page);
  await addHomeBuilding(page, 'monolith');
  await page.waitForFunction(
    () => window.__game.scene.lateAssetsReady && !window.__game.scene.lateArtLoading,
  );
  const pattern = '**/src/game/character-graphs.ts*';
  let attempts = 0;
  page.on('request', (request) => {
    if (
      request.method() === 'GET' &&
      new URL(request.url()).pathname === '/src/game/character-graphs.ts'
    )
      attempts++;
  });
  await page.route(pattern, (route) =>
    route.fulfill({ status: 503, body: 'Temporary defender module outage' }),
  );
  await scoutDefender(page);
  await page.waitForFunction(
    () => !!window.__game.scene.lateArtFailure && !window.__game.scene.lateArtLoading,
  );
  // Repeated refreshes and queued callers must share the module retry backoff even though
  // the building phase has already succeeded.
  await page.evaluate(async () => {
    const { scene, model } = window.__game;
    await Promise.all(Array.from({ length: 3 }, () => scene.loadLateAssets(true, model.battle)));
  });
  expect(attempts).toBe(1);
  expect(
    await page.evaluate(() => ({
      buildings: window.__game.scene.lateAssetsReady,
      characters: window.__game.scene.lateCharactersReady,
      pending: window.__game.scene.battleArtPending(),
      elapsed: window.__game.model.battle!.elapsed,
    })),
  ).toEqual({ buildings: true, characters: false, pending: true, elapsed: 0 });
  await page.unroute(pattern);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect.poll(() => attempts, { timeout: 2000 }).toBeGreaterThan(1);
  await page.waitForFunction(
    () =>
      window.__game.scene.lateCharactersReady &&
      !window.__game.scene.lateArtLoading &&
      !window.__game.scene.battleArtPending(),
  );
  await page.evaluate(() => window.__game.scene.drawOverlay(0));
  expect(
    await page.evaluate(() => ({
      failure: window.__game.scene.lateArtFailure,
      visible: [...window.__game.scene.garrisonPresentation.defenders.values()].some((view) =>
        view.objects.some((object) => object.visible && object.alpha > 0),
      ),
      error: window.__game.game.renderer.gl.getError(),
    })),
  ).toEqual({ failure: undefined, visible: true, error: 0 });
  expect(errors).toEqual([]);
});

test('an already spawned Builder waits for its first character module without stopping frames', async ({
  page,
}) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.text().startsWith('Skipped drawing')) errors.push(message.text());
  });
  let releaseGraph!: () => void;
  const heldGraph = new Promise<void>((resolve) => {
    releaseGraph = resolve;
  });
  let graphRequests = 0;
  await page.route('**/src/game/character-graphs.ts*', async (route) => {
    graphRequests++;
    await heldGraph;
    await route.continue();
  });
  try {
    await boot(page);
    await addHomeBuilding(page, 'monolith');
    const hutId = await addHomeBuilding(page, 'builder');
    await page.waitForFunction(
      () => window.__game.scene.lateAssetsReady && !window.__game.scene.lateArtLoading,
    );
    const spawned = await page.evaluate(async (hutId) => {
      const { spawnDefendingBuilder } = await import('/src/game/defending-builder.ts');
      const { spawnGarrisonDefender } = await import('/src/game/garrison-combat.ts');
      const { characterArtLoaded } = await import('/src/game/character-art.ts');
      const { model, scene, game } = window.__game;
      const graphsBeforeBattle = characterArtLoaded();
      model.startBattle(0, true);
      const battle = model.battle!;
      const hut = battle.buildings.find((building) => building.id === hutId)!;
      const worker = spawnDefendingBuilder(battle, hut, 0);
      const archer = spawnGarrisonDefender(battle, 'archer', 9, hut.id, 33, 32, 0);
      battle.elapsed = 0.2;
      model.changed();
      scene.sync();
      scene.drawOverlay(200);
      return { worker: worker.id, archer: archer.id, graphsBeforeBattle, frame: game.loop.frame };
    }, hutId);
    expect(spawned.graphsBeforeBattle).toBe(false);
    await expect.poll(() => graphRequests).toBe(1);
    await page.waitForFunction((frame) => window.__game.game.loop.frame > frame + 2, spawned.frame);
    expect(
      await page.evaluate(() => ({
        pending: window.__game.scene.battleArtPending(),
        elapsed: window.__game.model.battle!.elapsed,
      })),
    ).toEqual({ pending: true, elapsed: 0.2 });
    expect(errors).toEqual([]);
    releaseGraph();
    await page.waitForFunction(
      () =>
        window.__game.scene.lateCharactersReady &&
        !window.__game.scene.lateArtLoading &&
        !window.__game.scene.battleArtPending(),
    );
    await page.evaluate(() => window.__game.scene.drawOverlay(200));
    const visible = await page.evaluate(
      (ids) => ({
        worker: window.__game.scene.children.list.filter(
          (object) =>
            object.visible &&
            object.alpha > 0 &&
            object.getData?.('defendingBuilder') === ids.worker,
        ).length,
        archer:
          window.__game.scene.garrisonPresentation.defenders
            .get(ids.archer)
            ?.objects.filter((object) => object.visible && object.alpha > 0).length ?? 0,
        error: window.__game.game.renderer.gl.getError(),
      }),
      spawned,
    );
    expect(visible.worker).toBeGreaterThan(0);
    expect(visible.archer).toBeGreaterThan(0);
    expect(visible.error).toBe(0);
    expect(errors).toEqual([]);
  } finally {
    releaseGraph();
  }
});
