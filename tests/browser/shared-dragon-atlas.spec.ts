import { expect, test, type Page } from '@playwright/test';

test.use({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
});
test.describe.configure({ timeout: 180000 });

async function boot(page: Page) {
  await page.goto('/?lazyart');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  await page.evaluate(async () => {
    const { makeBuilding } = await import('/src/game/model.ts');
    const { model, scene } = window.__game;
    const castle = makeBuilding(model.state.nextId++, 'clancastle', 32, 30, 1);
    model.state.buildings.push(castle);
    window.__sharedDragonCastle = castle.id;
    model.changed();
    scene.sync();
  });
  await page.waitForFunction(() => window.__game.scene.artSettled);
}

async function reserve(page: Page, kinds: ('dragon' | 'goldendragon')[]) {
  const ids = await page.evaluate(async (kinds) => {
    const { initializeGarrison } = await import('/src/game/garrison-release.ts');
    const { spawnGarrisonDefender } = await import('/src/game/garrison-combat.ts');
    const { model, scene } = window.__game;
    if (model.battle) model.returnHome();
    scene.paused = false;
    model.startBattle(0, true);
    const battle = model.battle;
    const troops = kinds.map((kind) => ({ kind, level: kind === 'dragon' ? 7 : 1, count: 1 }));
    battle.garrisons = [
      initializeGarrison({ castleId: window.__sharedDragonCastle, mode: 'guard', troops }),
    ];
    const ids = troops.map(
      ({ kind, level }, i) =>
        spawnGarrisonDefender(battle, kind, level, window.__sharedDragonCastle, 32 + i, 31, 0).id,
    );
    model.changed();
    scene.sync();
    scene.cameras.main.centerOn(896, 1168);
    return ids;
  }, kinds);
  await page.waitForFunction(
    () => window.__game.scene.artSettled && !window.__game.scene.battleArtPending(),
  );
  await page.waitForFunction(
    (ids) =>
      ids.every((id) =>
        window.__game.scene.garrisonPresentation.defenders
          .get(id)
          ?.objects.some(
            (object) =>
              object.visible &&
              object.alpha > 0 &&
              !['__MISSING', '__DEFAULT'].includes(object.texture?.key),
          ),
      ),
    ids,
  );
  await page.evaluate(() => {
    window.__game.scene.paused = true;
  });
  return ids;
}

async function allocation(page: Page, ids: number[]) {
  return page.evaluate(async (ids) => {
    const { scene, game } = window.__game;
    const { characterArt } = await import('/src/game/character-art.ts');
    const { nativeMeshTexture } = await import('/src/game/native-mesh.ts');
    const key = nativeMeshTexture(characterArt('Golden Dragon').prefix, 0);
    const texture = scene.textures.get(key);
    const matching = Object.values(scene.textures.list)
      .flatMap((texture) => texture.source ?? [])
      .filter((source) =>
        source.image?.src?.includes('/dragon/golden-dragon/texture/texture-0-compact-v1.'),
      );
    const wrappers = new Set(matching.map((source) => source.glTexture));
    return {
      sameKey: key === nativeMeshTexture(characterArt('Dragon7').prefix, 0),
      separatePresenters: characterArt('Golden Dragon').prefix !== characterArt('Dragon7').prefix,
      wrappers: wrappers.size,
      bytes: [...wrappers].reduce((sum, wrapper) => sum + wrapper.width * wrapper.height * 4, 0),
      textureKeys: matching.length,
      visible: ids.map((id) =>
        scene.garrisonPresentation.defenders
          .get(id)
          ?.objects.some((object) => object.visible && object.alpha > 0),
      ),
      shadows: ids.map(
        (id) => (scene.garrisonPresentation.shadows.get(id)?.objects.length ?? 0) > 0,
      ),
      resident: scene.textures.exists(key) && !!texture.source[0].glTexture,
      error: game.renderer.gl.getError(),
    };
  }, ids);
}

async function expectShared(page: Page, ids: number[]) {
  expect(await allocation(page, ids)).toEqual({
    sameKey: true,
    separatePresenters: true,
    wrappers: 1,
    bytes: 15_955_328,
    textureKeys: 1,
    visible: ids.map(() => true),
    shadows: ids.map(() => true),
    resident: true,
    error: 0,
  });
}

test('phone Dragons share one GPU page through context restoration and home release', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await boot(page);
  const ids = await reserve(page, ['dragon', 'goldendragon']);
  await expectShared(page, ids);
  await page.evaluate(async () => {
    const { scene, game } = window.__game;
    const extension = game.renderer.gl.getExtension('WEBGL_lose_context');
    await new Promise<void>((resolve) => {
      game.canvas.addEventListener(
        'webglcontextlost',
        () => setTimeout(() => extension.restoreContext(), 50),
        { once: true },
      );
      game.canvas.addEventListener(
        'webglcontextrestored',
        () =>
          game.events.once('postrender', () => {
            scene.paused = true;
            resolve();
          }),
        { once: true },
      );
      extension.loseContext();
    });
  });
  await expectShared(page, ids);
  await page.evaluate(() => {
    const { model, scene } = window.__game;
    model.returnHome();
    scene.sync();
    scene.lateIdleSince = undefined;
    scene.releaseLateAssetsWhenIdle(1e9);
    scene.releaseLateAssetsWhenIdle(1e9 + 100000);
    scene.familyIdleSince = undefined;
    scene.releaseIdleFamilies(1e9);
    scene.releaseIdleFamilies(1e9 + 100000);
  });
  expect(
    await page.evaluate(() => window.__game.scene.textures.exists('garrison-dragon:mesh:0')),
  ).toBe(false);
  await expectShared(page, await reserve(page, ['goldendragon']));
  expect(errors).toEqual([]);
});

test('a late-first Golden page transfers ownership before late art releases', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await boot(page);
  await page.evaluate(async () => {
    const { scene } = window.__game;
    await scene.loadLateArtRequest({
      withCharacters: true,
      buildingMask: 0,
      animations: new Set(['Golden Dragon']),
    });
  });
  expect(
    await page.evaluate(() =>
      window.__game.scene.lateTextureKeys.includes('garrison-dragon:mesh:0'),
    ),
  ).toBe(true);
  await expectShared(page, await reserve(page, ['dragon']));
  expect(
    await page.evaluate(
      () =>
        window.__game.scene.lateTextureKeys.includes('garrison-dragon:mesh:0') ||
        window.__game.scene.lateCharacterKeys.includes('garrison-dragon:mesh:0'),
    ),
  ).toBe(false);
  await page.evaluate(() => {
    const { model, scene } = window.__game;
    model.returnHome();
    scene.sync();
    scene.lateIdleSince = undefined;
    scene.releaseLateAssetsWhenIdle(1e9);
    scene.releaseLateAssetsWhenIdle(1e9 + 100000);
  });
  expect(
    await page.evaluate(() => window.__game.scene.textures.exists('garrison-dragon:mesh:0')),
  ).toBe(true);
  await expectShared(page, await reserve(page, ['goldendragon']));
  await expectShared(page, await reserve(page, ['dragon', 'goldendragon']));
  expect(errors).toEqual([]);
});

test('an unused late-only Golden page releases with a retained home building', async ({ page }) => {
  await boot(page);
  await page.evaluate(async () => {
    const { scene } = window.__game;
    const { model } = window.__game;
    const { makeBuilding } = await import('/src/game/model.ts');
    model.state.buildings.push(makeBuilding(model.state.nextId++, 'monolith', 36, 28, 1));
    model.changed();
    scene.sync();
    const { LATE_BUILDING_ART } = await import('/src/game/late-building-demand.ts');
    await scene.loadLateArtRequest({
      withCharacters: true,
      buildingMask: LATE_BUILDING_ART.monolith,
      animations: new Set(['Golden Dragon']),
    });
    scene.paused = true;
    scene.lateIdleSince = undefined;
    scene.releaseLateAssetsWhenIdle(1e9);
    scene.releaseLateAssetsWhenIdle(1e9 + 100000);
  });
  expect(
    await page.evaluate(() => window.__game.scene.textures.exists('garrison-dragon:mesh:0')),
  ).toBe(false);
  await expectShared(page, await reserve(page, ['goldendragon']));
  // Once the foundation owns it, releasing the late character subset beside the
  // retained Monolith must preserve the page for the next Dragon-only battle.
  await page.evaluate(() => {
    const { model, scene } = window.__game;
    model.returnHome();
    scene.sync();
    scene.lateIdleSince = undefined;
    scene.releaseLateAssetsWhenIdle(1e9);
    scene.releaseLateAssetsWhenIdle(1e9 + 100000);
  });
  expect(
    await page.evaluate(() => window.__game.scene.textures.exists('garrison-dragon:mesh:0')),
  ).toBe(true);
  await expectShared(page, await reserve(page, ['dragon']));
});

test('a failed Golden page recovers through the shared foundation key', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await boot(page);
  let failed = 0;
  const atlas = '**/assets/characters-native/dragon/golden-dragon/texture/texture-0-compact-v1.png';
  await page.route(atlas, async (route) => {
    failed++;
    await route.fulfill({ status: 503, body: 'atlas unavailable' });
  });
  const recovery = (async () => {
    await expect.poll(() => failed).toBeGreaterThan(0);
    await page.unroute(atlas);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
  })();
  const ids = await reserve(page, ['goldendragon']);
  await recovery;
  await expectShared(page, ids);
  expect(errors).toEqual([]);
});
