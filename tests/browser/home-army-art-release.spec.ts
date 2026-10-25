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
  await page.evaluate(() => {
    const { model, scene } = window.__game;
    model.townhall.level = 18;
    model.changed();
    scene.sync();
  });
  await page.waitForFunction(() => window.__game.scene.artSettled);
}
async function army(page: Page, kind: string | null, ready = true) {
  const level = await page.evaluate(async (kind) => {
    const { emptyArmy } = await import('/src/game/army.ts');
    const { model, scene } = window.__game;
    model.state.army = { ...emptyArmy(), ...(kind ? { [kind]: 1 } : {}) };
    model.changed();
    scene.sync();
    return kind ? model.troopLevel(kind) : null;
  }, kind);
  if (kind && ready)
    await page.waitForFunction(
      ({ kind, level }) =>
        window.__game.scene.troopNativePresentation.levelsReady.get(kind)?.has(level),
      { kind, level },
    );
}
async function resident(page: Page) {
  return page.evaluate(() => {
    const { scene, game } = window.__game;
    const textures = new Set();
    for (const [key, texture] of Object.entries(scene.textures.list))
      if (key.startsWith('troop:'))
        for (const source of texture.source ?? [])
          if (source.glTexture) textures.add(source.glTexture);
    return {
      kinds: [...scene.troopNativePresentation.packs.keys()].sort(),
      bytes: [...textures].reduce((sum, texture) => sum + texture.width * texture.height * 4, 0),
      error: game.renderer.gl.getError(),
    };
  });
}

test('changing the home army releases obsolete packs and an empty army releases every troop page', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await boot(page);
  for (const [kind, bytes] of [
    ['electrodragon', 86_187_200],
    ['flameflinger', 55_628_752],
    ['archer', 762_184],
    [null, 0],
  ] as const) {
    await army(page, kind);
    expect(await resident(page)).toEqual({ kinds: kind ? [kind] : [], bytes, error: 0 });
  }
  await army(page, 'flameflinger');
  expect(await resident(page)).toEqual({ kinds: ['flameflinger'], bytes: 55_628_752, error: 0 });
  expect(errors).toEqual([]);
});

for (const phase of ['metadata', 'texture'])
  test(`changing the home army cancels obsolete ${phase} without repopulating its pages`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await boot(page);
    let url = '**/assets/troops-native/electrodragon/graph.json';
    if (phase === 'texture') {
      const pack = await (
        await page.request.get('/assets/troops-native/electrodragon/graph.json')
      ).json();
      const texture = Object.values(pack.scenes.chr_electro_dragon.textures).sort(
        (a, b) => b.width * b.height - a.width * a.height,
      )[0];
      url = `**/${texture.path}`;
    }
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let requested = false;
    await page.route(url, async (route) => {
      requested = true;
      await gate;
      await route.continue();
    });
    try {
      await army(page, 'electrodragon', false);
      await expect.poll(() => requested).toBe(true);
      await army(page, 'archer');
      const done = page.waitForResponse(url);
      release();
      await (await done).finished();
      await page.waitForTimeout(250);
      expect(await resident(page)).toEqual({ kinds: ['archer'], bytes: 762_184, error: 0 });
      await page.unroute(url);
      await army(page, 'electrodragon');
      expect(await resident(page)).toEqual({
        kinds: ['electrodragon'],
        bytes: 86_187_200,
        error: 0,
      });
      expect(errors).toEqual([]);
    } finally {
      release();
    }
  });

test('a home-army update during battle preserves the active troop presentation', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await boot(page);
  await army(page, 'electrodragon');
  const id = await page.evaluate(() => {
    const { model, scene } = window.__game;
    model.startBattle(0, true);
    model.activeTroop = 'electrodragon';
    if (!model.deploy(16, 21)) throw Error('Could not deploy Electro Dragon');
    scene.sync();
    return model.battle.units.find((unit) => unit.kind === 'electrodragon').id;
  });
  await page.waitForFunction(() => window.__game.scene.artSettled);
  await page.waitForFunction(
    (id) =>
      window.__game.scene.troopNativePresentation.views
        .get(id)
        ?.view.objects.some((object) => object.visible && object.alpha > 0),
    id,
  );
  await page.evaluate((id) => {
    const { scene } = window.__game;
    scene.paused = true;
    window.__homeArmyBattleView = scene.troopNativePresentation.views.get(id).view;
  }, id);
  await army(page, 'archer');
  expect(
    await page.evaluate((id) => {
      const { scene, game } = window.__game;
      const view = scene.troopNativePresentation.views.get(id)?.view;
      return {
        same: view === window.__homeArmyBattleView,
        visible: view?.objects.some(
          (object) =>
            object.visible &&
            object.alpha > 0 &&
            !['__MISSING', '__DEFAULT'].includes(object.texture?.key),
        ),
        error: game.renderer.gl.getError(),
      };
    }, id),
  ).toEqual({ same: true, visible: true, error: 0 });
  expect(errors).toEqual([]);
});
