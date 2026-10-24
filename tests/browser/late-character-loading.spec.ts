import { expect, test, type Page } from '@playwright/test';

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
    await page.evaluate(() => {
      const { model, scene } = window.__game;
      model.startBattle(0, true);
      scene.sync();
    });
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
    expect(released.count).toBeGreaterThan(20);
    expect(released.beforeGrace).toBe(true);
    expect(released.remaining).toEqual([]);
    expect(released.buildingsKept).toBe(true);
    expect(released.buildingReady).toBe(true);
    expect(released.characterReady).toBe(false);
    await page.waitForFunction(
      (id) => window.__game.scene.lateCampaign.families.some((family) => family.towers?.has(id)),
      id,
    );
    const restarted = await page.evaluate(() => {
      window.__game.model.startBattle(0, true);
      window.__game.scene.sync();
      const { scene, model } = window.__game;
      return {
        battle: !!model.battle,
        loading: scene.lateArtLoading,
        ready: scene.lateCharactersReady,
        pending: scene.battleArtPending(),
        keys: scene.lateCharacterKeys.length,
      };
    });
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
    expect(finalState.keys).toBeGreaterThan(20);
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
  const target = await page.evaluate(async () => {
    const resource = performance
      .getEntriesByType('resource')
      .find((entry) => entry.name.includes('/src/game/character-art.ts'))!.name;
    const { characterArts } = await import(/* @vite-ignore */ resource);
    type Art = {
      prefix: string;
      graph: { textures: Record<string, { path: string; width: number; height: number }> };
    };
    const art = (Object.values(characterArts()) as Art[]).find((art) =>
      art.prefix.includes('electrodragon'),
    )!;
    const [id, texture] = Object.entries(art.graph.textures).find(
      ([, texture]) =>
        texture.path.includes('/characters-native/') && texture.width * texture.height > 1_000_000,
    )!;
    return { key: `${art.prefix}:mesh:${id}`, path: '/' + texture.path };
  });
  let attempts = 0;
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === target.path) attempts++;
  });
  await page.route('**' + target.path, (route) =>
    route.fulfill({ status: 503, body: 'Temporary outage' }),
  );
  await page.evaluate(() => {
    window.__game.model.startBattle(0, true);
    window.__game.scene.sync();
  });
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
    const { model, scene } = window.__game;
    const building = makeBuilding(model.state.nextId++, 'monolith', 32, 32, 1);
    model.state.buildings.push(building);
    model.changed();
    scene.sync();
    model.startBattle(0, true);
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
