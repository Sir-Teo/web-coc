import { expect, test, type Page } from '@playwright/test';

const MONOLITH = 64,
  SCATTERSHOT = 32;
function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.text().startsWith('Skipped drawing') || m.text().includes('Texture key already in use'))
      errors.push(m.text());
  });
  return errors;
}

function watchLateModules(page: Page) {
  const wanted = new Set([
    'spell-tower-scene',
    'tornado-trap-scene',
    'freeze-trap-scene',
    'ghost-trap-scene',
    'eagle-artillery-scene',
    'scattershot-scene',
    'monolith-scene',
    'late-goblin-buildings-scene',
    'builder-hut-scene',
    'defending-builder-scene',
  ]);
  const modules: string[] = [];
  page.on('request', (request) => {
    const name = new URL(request.url()).pathname.split('/').at(-1)?.replace(/\.ts$/, '');
    if (name && wanted.has(name)) modules.push(name);
  });
  return modules;
}

async function boot(page: Page) {
  await page.goto('/?lazyart');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
}
async function homeBuilding(page: Page, kind: 'monolith' | 'scattershot') {
  return page.evaluate(async (kind) => {
    const { makeBuilding } = await import('/src/game/model.ts');
    const { model, scene } = window.__game;
    const building = makeBuilding(model.state.nextId++, kind, kind === 'monolith' ? 32 : 36, 32, 1);
    model.state.buildings.push(building);
    model.changed();
    scene.sync();
    scene.cameras.main.centerOn(896, 1184);
    return building.id;
  }, kind);
}
async function settled(page: Page) {
  await page.waitForFunction(
    () =>
      window.__game.scene.lateAssetsReady &&
      !window.__game.scene.lateArtLoading &&
      !window.__game.scene.battleArtPending(),
  );
}
async function scoutScattershot(page: Page) {
  return page.evaluate(async () => {
    const { makeBuilding } = await import('/src/game/model.ts');
    const { model, scene } = window.__game;
    model.startBattle(0, true);
    const building = makeBuilding(model.state.nextId++, 'scattershot', 36, 32, 1);
    model.battle!.buildings.push(building);
    model.changed();
    scene.sync();
    scene.cameras.main.centerOn(896, 1184);
    // A released family's presentation must stay on its fallback during the next load.
    scene.drawOverlay(0);
    return building.id;
  });
}

test('a new home family loads without unrelated atlases or reuploading the Monolith', async ({
  page,
}) => {
  test.setTimeout(180000);
  const errors = watchErrors(page);
  const modules = watchLateModules(page);
  await boot(page);
  const mono = await homeBuilding(page, 'monolith');
  await settled(page);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const { scene, game } = window.__game;
        scene.drawOverlay(0);
        game.events.once('postrender', () => resolve());
      }),
  );
  expect(
    await page.evaluate(() => {
      const { scene } = window.__game;
      window.__game.__monoSources = new Map(
        Object.entries(scene.textures.list)
          .filter(([key]) => key.startsWith('monolith-native:mesh:') && !key.includes(':color:'))
          .map(([key, texture]) => [
            key,
            { gl: texture.source[0].glTexture, image: texture.source[0].image },
          ]),
      );
      return {
        coverage: scene.lateBuildingCoverage,
        characters: scene.lateCharactersReady,
        unrelated: Object.keys(scene.textures.list).filter((key) =>
          /^(scattershot|eagle-artillery|builder-hut|spell-tower-native):mesh:/.test(key),
        ),
      };
    }),
  ).toEqual({ coverage: MONOLITH, characters: false, unrelated: [] });
  expect(modules).toEqual(['monolith-scene']);
  const scatter = await homeBuilding(page, 'scattershot');
  await settled(page);
  const rendered = await page.evaluate(
    ({ mono, scatter }) => {
      const { scene, game } = window.__game;
      const family = scene.lateCampaign.families.find(
        (f) => f.constructor.name === 'MonolithPresentation',
      );
      const sources = Object.entries(scene.textures.list).filter(
        ([key]) => key.startsWith('monolith-native:mesh:') && !key.includes(':color:'),
      );
      const changedSources = sources
        .filter(
          ([key, texture]) =>
            texture.source[0].glTexture !== window.__game.__monoSources.get(key)?.gl,
        )
        .map(([key, texture]) => ({
          key,
          width: texture.source[0].width,
          height: texture.source[0].height,
          sameImage: texture.source[0].image === window.__game.__monoSources.get(key)?.image,
        }));
      return {
        coverage: scene.lateBuildingCoverage,
        mono: family.towers.get(mono).objects.filter((o) => o.visible && o.alpha > 0).length,
        scatter: scene.children.list.filter(
          (o) => o.visible && o.alpha > 0 && o.getData?.('scattershot')?.id === scatter,
        ).length,
        changedSources,
        error: game.renderer.gl.getError(),
      };
    },
    { mono, scatter },
  );
  expect(modules).toEqual(['monolith-scene', 'scattershot-scene']);
  expect(rendered.coverage).toBe(MONOLITH | SCATTERSHOT);
  expect(rendered.mono).toBeGreaterThan(0);
  expect(rendered.scatter).toBeGreaterThan(0);
  expect(rendered.changedSources).toEqual([]);
  expect(rendered.error).toBe(0);
  expect(errors).toEqual([]);
});

test('an empty battle releases its unused building family while the home Monolith stays', async ({
  page,
}) => {
  test.setTimeout(180000);
  const errors = watchErrors(page);
  await boot(page);
  const mono = await homeBuilding(page, 'monolith');
  await settled(page);
  await scoutScattershot(page);
  await settled(page);
  expect(await page.evaluate(() => window.__game.scene.lateCharactersReady)).toBe(false);
  const released = await page.evaluate(
    ({ mono, scatterBit }) => {
      const { model, scene } = window.__game;
      const keys = [...scene.lateBuildingKeys.get(scatterBit)];
      window.__game.__scatterSources = keys
        .filter((key) => key.startsWith('scattershot:mesh:'))
        .flatMap((key) => scene.textures.get(key).source.map((s) => s.glTexture));
      model.returnHome();
      scene.sync();
      scene.lateIdleSince = undefined;
      scene.releaseLateAssetsWhenIdle(0);
      scene.releaseLateAssetsWhenIdle(Number.MAX_SAFE_INTEGER);
      scene.drawOverlay(0);
      const family = scene.lateCampaign.families.find(
        (f) => f.constructor.name === 'MonolithPresentation',
      );
      return {
        coverage: scene.lateBuildingCoverage,
        left: keys.filter((key) => scene.textures.exists(key)),
        mono: family.towers.get(mono).objects.filter((o) => o.visible && o.alpha > 0).length,
      };
    },
    { mono, scatterBit: SCATTERSHOT },
  );
  expect(released.coverage).toBe(MONOLITH);
  expect(released.left).toEqual([]);
  expect(released.mono).toBeGreaterThan(0);
  const scatter = await scoutScattershot(page);
  await settled(page);
  await expect
    .poll(() =>
      page.evaluate(
        (scatter) =>
          window.__game.scene.children.list.some(
            (object) =>
              object.visible && object.alpha > 0 && object.getData?.('scattershot')?.id === scatter,
          ),
        scatter,
      ),
    )
    .toBe(true);
  const restored = await page.evaluate((scatter) => {
    const { scene, game } = window.__game;
    const sources = Object.entries(scene.textures.list)
      .filter(([key]) => key.startsWith('scattershot:mesh:'))
      .flatMap(([, texture]) => texture.source.map((s) => s.glTexture));
    return {
      fresh:
        sources.length > 0 &&
        sources.every((source) => !window.__game.__scatterSources.includes(source)),
      visible: scene.children.list.filter(
        (o) => o.visible && o.alpha > 0 && o.getData?.('scattershot')?.id === scatter,
      ).length,
      error: game.renderer.gl.getError(),
    };
  }, scatter);
  expect(restored.fresh).toBe(true);
  expect(restored.visible).toBeGreaterThan(0);
  expect(restored.error).toBe(0);
  expect(errors).toEqual([]);
});

test('a home family queued during another load shares its preview request', async ({ page }) => {
  test.setTimeout(180000);
  const errors = watchErrors(page);
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let previewRequests = 0,
    characters = 0;
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/assets/buildings/monolith-native/preview-1.png')
      previewRequests++;
    if (request.url().includes('/assets/characters-native/')) characters++;
  });
  await page.route('**/assets/buildings/monolith-native/**', async (route) => {
    await held;
    await route.continue();
  });
  try {
    await boot(page);
    const mono = await homeBuilding(page, 'monolith');
    await page.waitForFunction(() => window.__game.scene.lateArtLoading);
    const scatter = await homeBuilding(page, 'scattershot');
    release();
    await settled(page);
    const result = await page.evaluate(
      ({ mono, scatter }) => {
        const { scene, game } = window.__game;
        const family = scene.lateCampaign.families.find(
          (f) => f.constructor.name === 'MonolithPresentation',
        );
        return {
          coverage: scene.lateBuildingCoverage,
          mono: family.towers.get(mono)?.objects.some((o) => o.visible && o.alpha > 0),
          scatter: scene.children.list.some(
            (o) => o.visible && o.alpha > 0 && o.getData?.('scattershot')?.id === scatter,
          ),
          error: game.renderer.gl.getError(),
        };
      },
      { mono, scatter },
    );
    expect(result).toEqual({
      coverage: MONOLITH | SCATTERSHOT,
      mono: true,
      scatter: true,
      error: 0,
    });
    expect(previewRequests).toBe(1);
    expect(characters).toBe(0);
    expect(errors).toEqual([]);
  } finally {
    release();
  }
});

test('cold Spell Tower Move previews request the selected supported level and spell', async ({
  page,
}) => {
  test.setTimeout(180000);
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const invalid: string[] = [];
  page.on('request', (request) => {
    if (/preview-[1-3]-earthquake\./.test(request.url())) invalid.push(request.url());
  });
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/src/game/late-campaign-scene.ts*', async (route) => {
    await held;
    await route.continue();
  });
  await page.route('**/assets/village-native/spelltower/graph.json', async (route) => {
    await held;
    await route.continue();
  });
  try {
    await boot(page);
    const id = await page.evaluate(async () => {
      const { makeBuilding } = await import('/src/game/model.ts');
      const { model, scene } = window.__game;
      model.state.obstacles = [];
      model.townhall!.level = 16;
      const tower = makeBuilding(model.state.nextId++, 'spelltower', 32, 32, 1);
      tower.spellMode = 'rage';
      tower.spellTowerWeapon = 'rage';
      model.state.buildings.push(tower);
      model.move(tower.id);
      scene.sync();
      scene.trackGhost(160, 350);
      return tower.id;
    });
    for (const level of [1, 2, 3, 4])
      for (const spell of [
        'rage',
        'poison',
        'invisibility',
        ...(level >= 4 ? ['earthquake'] : []),
      ]) {
        await page.evaluate(
          ({ id, level, spell }) => {
            const { model, scene } = window.__game;
            model.cancel();
            const tower = model.state.buildings.find((b) => b.id === id)!;
            tower.level = level;
            tower.spellMode = spell;
            tower.spellTowerWeapon = spell;
            model.move(id);
            scene.sync();
            scene.trackGhost(160, 350);
          },
          { id, level, spell },
        );
        const expected = `spell-tower-native-${level}-${spell}`;
        await expect
          .poll(() => page.evaluate(() => window.__game.scene.ghost?.texture.key))
          .toBe(expected);
        const portrait = await page.evaluate(() => {
          const { scene, game } = window.__game;
          const ghost = scene.ghost;
          return {
            source: ghost.texture.source[0].image.currentSrc || ghost.texture.source[0].image.src,
            alpha: ghost.alpha,
            width: ghost.displayWidth,
            height: ghost.displayHeight,
            error: game.renderer.gl.getError(),
          };
        });
        expect(new URL(portrait.source).pathname).toBe(
          `/assets/buildings/spell-tower-native/preview-${level}-${spell}.png`,
        );
        expect(portrait.alpha).toBe(0.72);
        expect(portrait.width).toBeGreaterThan(0);
        expect(portrait.height).toBeGreaterThan(0);
        expect(portrait.error).toBe(0);
      }
    await page.evaluate(() => {
      window.__game.model.cancel();
      window.__game.scene.sync();
    });
    release();
    await settled(page);
    await page.waitForFunction(() => window.__game.scene.artSettled);
    expect(invalid).toEqual([]);
    expect(errors).toEqual([]);
  } finally {
    release();
  }
});

test('a failed body waits for its shared preview and retries without duplicate image loads', async ({
  page,
}) => {
  test.setTimeout(180000);
  const errors = watchErrors(page);
  let release!: () => void;
  const preview = new Promise<void>((resolve) => {
    release = resolve;
  });
  let releaseNative!: () => void;
  const nativeGraph = new Promise<void>((resolve) => {
    releaseNative = resolve;
  });
  await page.route('**/assets/village-native/monolith/graph.json', async (route) => {
    await nativeGraph;
    await route.continue();
  });
  let previewRequests = 0,
    bodyRequests = 0;
  const broken = '**/assets/buildings/monolith-native/texture-18.png';
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/assets/buildings/monolith-native/preview-1.png')
      previewRequests++;
    if (new URL(request.url()).pathname === '/assets/buildings/monolith-native/texture-18.png')
      bodyRequests++;
  });
  await page.route('**/assets/buildings/monolith-native/preview-1.png', async (route) => {
    await preview;
    await route.continue();
  });
  await page.route(broken, (route) =>
    route.fulfill({ status: 503, body: 'Temporary body failure' }),
  );
  try {
    await boot(page);
    const id = await homeBuilding(page, 'monolith');
    await expect.poll(() => bodyRequests).toBe(1);
    await page.waitForFunction(() => !window.__game.scene.load.isLoading());
    expect(
      await page.evaluate(() => ({
        ready: window.__game.scene.lateAssetsReady,
        loading: window.__game.scene.lateArtLoading,
      })),
    ).toEqual({ ready: false, loading: true });
    release();
    await settled(page);
    await expect
      .poll(() =>
        page.evaluate((id) => {
          const fallback = window.__game.scene.sprites.get(id);
          return !!fallback?.visible && fallback.alpha > 0;
        }, id),
      )
      .toBe(true);
    expect(
      await page.evaluate((id) => {
        const { scene } = window.__game;
        scene.drawOverlay(0);
        const fallback = scene.sprites.get(id);
        return {
          failed: !!scene.lateArtFailure,
          visible: !!fallback?.visible && fallback.alpha > 0,
          key: fallback?.texture.key,
        };
      }, id),
    ).toEqual({ failed: true, visible: true, key: 'monolith-native-1' });
    await page.evaluate(async (mask) => {
      const { scene } = window.__game;
      await Promise.all(
        Array.from({ length: 3 }, () => scene.loadLateAssets(false, undefined, mask)),
      );
    }, MONOLITH);
    expect(previewRequests).toBe(1);
    expect(bodyRequests).toBe(1);
    await page.unroute(broken);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await page.waitForFunction(
      () => !window.__game.scene.lateArtFailure && !window.__game.scene.lateArtLoading,
    );
    await expect
      .poll(() =>
        page.evaluate((id) => {
          const family = window.__game.scene.lateCampaign.families.find(
            (f) => f.constructor.name === 'MonolithPresentation',
          );
          return (
            family?.towers.get(id)?.objects.filter((o) => o.visible && o.alpha > 0).length ?? 0
          );
        }, id),
      )
      .toBeGreaterThan(0);
    expect(bodyRequests).toBeGreaterThan(1);
    expect(previewRequests).toBe(1);
    expect(errors).toEqual([]);
  } finally {
    release();
    releaseNative();
  }
});

test('a failed family module preserves warm building views and retries on reconnect', async ({
  page,
}) => {
  test.setTimeout(180000);
  const errors = watchErrors(page);
  await boot(page);
  const mono = await homeBuilding(page, 'monolith');
  await settled(page);
  let attempts = 0;
  page.on('request', (request) => {
    if (
      request.method() === 'GET' &&
      new URL(request.url()).pathname === '/src/game/scattershot-scene.ts'
    )
      attempts++;
  });
  const pattern = '**/src/game/scattershot-scene.ts*';
  await page.route(pattern, (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/javascript',
      body: 'Temporary family outage',
    }),
  );
  const scatter = await homeBuilding(page, 'scattershot');
  await page.waitForFunction(
    () => window.__game.scene.lateArtFailure?.module && !window.__game.scene.lateArtLoading,
  );
  const monoVisible = () =>
    page.evaluate((id) => {
      const { scene } = window.__game;
      scene.drawOverlay(0);
      return scene.children.list.some(
        (object) =>
          object.visible && object.alpha > 0 && object.getData?.('nativeMonolith')?.id === id,
      );
    }, mono);
  await expect.poll(monoVisible).toBe(true);
  expect(attempts).toBe(1);
  await page.evaluate(async () => {
    const { scene } = window.__game;
    for (let i = 0; i < 3; i++)
      await scene.loadLateAssets(false, undefined, scene.wantedLateBuildings());
  });
  expect(attempts).toBe(1);
  await page.unroute(pattern);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await settled(page);
  await expect
    .poll(() =>
      page.evaluate((id) => {
        const { scene } = window.__game;
        scene.drawOverlay(0);
        return scene.children.list.some(
          (object) =>
            object.visible && object.alpha > 0 && object.getData?.('scattershot')?.id === id,
        );
      }, scatter),
    )
    .toBe(true);
  expect(attempts).toBe(2);
  expect(await monoVisible()).toBe(true);
  expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
  expect(errors).toEqual([]);
});
