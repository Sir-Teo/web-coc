import { expect, test, type Page } from '@playwright/test';

const FIRST = ['king', 'queen', 'prince', 'warden'];
test.use({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
});
test.describe.configure({ timeout: 180000 });

async function ready(page: Page, kinds: string[], pet?: string) {
  await page.waitForFunction(
    (keys) =>
      keys.every((key) =>
        window.__game.scene.heroNativePresentation.packs.has(`heroes-native/${key}`),
      ),
    [...kinds, ...(pet ? [pet] : [])],
  );
}
async function boot(page: Page, lineup = FIRST) {
  await page.goto('/?lazyart');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  await page.evaluate(async (lineup) => {
    const { makeBuilding } = await import('/src/game/model.ts');
    const { BUILDINGS } = await import('/src/game/data.ts');
    const { HERO_KINDS } = await import('/src/game/native-hero-data.ts');
    const { model, scene } = window.__game;
    model.townhall.level = 18;
    model.state.buildings.push(makeBuilding(model.state.nextId++, 'herohall', 4, 32, 12));
    model.state.buildings.push(
      makeBuilding(model.state.nextId++, 'pethouse', 9, 32, BUILDINGS.pethouse.maxLevel),
    );
    model.state.king = { level: 1 };
    model.state.heroes = Object.fromEntries(
      HERO_KINDS.filter((kind) => kind !== 'king').map((kind) => [kind, { level: 1 }]),
    );
    model.state.pets = { levels: { lassi: 1, unicorn: 1, diggy: 1 }, assigned: {} };
    model.state.heroLineup = lineup;
    model.changed();
    scene.sync();
  }, lineup);
  await page.waitForFunction(() => window.__game.scene.artSettled);
  await ready(page, lineup);
}
async function lineup(page: Page, kinds: string[], wait = true) {
  await page.evaluate((kinds) => {
    const { model, scene } = window.__game;
    if (!model.setHeroLineup(kinds)) throw Error('Invalid lineup');
    scene.sync();
  }, kinds);
  if (wait) await ready(page, kinds);
}
async function resident(page: Page) {
  return page.evaluate(() => {
    const { scene, game } = window.__game;
    const textures = new Set();
    for (const [key, texture] of Object.entries(scene.textures.list))
      if (key.startsWith('baked:heroes-native/'))
        for (const source of texture.source ?? [])
          if (source.glTexture) textures.add(source.glTexture);
    return {
      packs: [...scene.heroNativePresentation.packs.keys()]
        .map((key) => key.slice('heroes-native/'.length))
        .sort(),
      bytes: [...textures].reduce((sum, texture) => sum + texture.width * texture.height * 4, 0),
      error: game.renderer.gl.getError(),
    };
  });
}

test('home hero lineups and pet assignments release obsolete atlases', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await boot(page);
  for (const [kinds, bytes] of [
    [FIRST, 28_311_552],
    [['king', 'queen', 'champion', 'duke'], 28_311_552],
    [['prince', 'warden', 'champion', 'duke'], 25_165_824],
    [FIRST, 28_311_552],
  ] as const) {
    await lineup(page, [...kinds]);
    expect(await resident(page)).toEqual({ packs: [...kinds].sort(), bytes, error: 0 });
  }
  for (const [pet, bytes] of [
    ['lassi', 33_040_400],
    ['unicorn', 32_692_444],
    ['diggy', 36_856_188],
    [null, 28_311_552],
  ] as const) {
    await page.evaluate((pet) => {
      const { model, scene } = window.__game;
      if (!model.assignPet('king', pet)) throw Error('Invalid pet');
      scene.sync();
    }, pet);
    await ready(page, FIRST, pet ?? undefined);
    expect(await resident(page)).toEqual({
      packs: [...FIRST, ...(pet ? [pet] : [])].sort(),
      bytes,
      error: 0,
    });
  }
  expect(errors).toEqual([]);
});

for (const phase of ['metadata', 'texture'])
  test(`home lineup changes cancel obsolete King ${phase} and partial pages`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const initial = ['queen', 'prince', 'warden', 'champion'];
    const next = ['king', 'prince', 'warden', 'champion'];
    await boot(page, initial);
    let url = '**/assets/characters/king-v1/atlas.json';
    if (phase === 'texture') {
      const pack = await (await page.request.get('/assets/characters/king-v1/atlas.json')).json();
      const file = Object.values(pack.states).flatMap((state) =>
        state.frames.flat().map((frame) => frame.image),
      )[0];
      url = `**/assets/characters/king-v1/${file}`;
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
      await lineup(page, next, false);
      await expect.poll(() => requested).toBe(true);
      if (phase === 'texture')
        await page.waitForFunction(
          () =>
            window.__game.scene.heroNativePresentation.pending.get('heroes-native/king')?.size > 0,
        );
      await lineup(page, initial);
      const done = page.waitForResponse(url);
      release();
      await (await done).finished();
      await page.waitForTimeout(250);
      expect(await resident(page)).toEqual({
        packs: [...initial].sort(),
        bytes: 25_165_824,
        error: 0,
      });
      await page.unroute(url);
      await lineup(page, next);
      expect(await resident(page)).toEqual({
        packs: [...next].sort(),
        bytes: 28_311_552,
        error: 0,
      });
      expect(errors).toEqual([]);
    } finally {
      release();
    }
  });

test('home lineup updates during battle preserve the active hero and pet', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await boot(page);
  const id = await page.evaluate(async () => {
    const { model, scene } = window.__game;
    const { iso } = await import('/src/game/scene.ts');
    model.assignPet('king', 'lassi');
    model.startBattle(0, true);
    let deployed = false;
    for (let x = 1; x < 48 && !deployed; x++)
      for (let y = 1; y < 48 && !deployed; y++)
        if (!model.deployBlocked(x, y) && model.deployNativeHero('king', x, y)) {
          const point = iso(x, y);
          scene.cameras.main.centerOn(point.x, point.y);
          deployed = true;
        }
    if (!deployed) throw Error('Could not deploy King at a legal point');
    scene.sync();
    return model.battle.nativeHeroes.find((hero) => hero.kind === 'king').unitId;
  });
  await page.waitForFunction(() => window.__game.scene.artSettled);
  await page.waitForFunction(
    (id) => window.__game.scene.heroNativePresentation.sprites.get(id)?.visible,
    id,
  );
  await page.evaluate((id) => {
    const { model, scene } = window.__game;
    scene.paused = true;
    window.__keptHomeHero = scene.heroNativePresentation.sprites.get(id);
    model.state.heroLineup = ['king', 'queen', 'champion', 'duke'];
    model.state.pets.assigned.king = 'unicorn';
    model.changed();
    scene.sync();
  }, id);
  await ready(page, ['king', 'queen', 'champion', 'duke'], 'unicorn');
  expect(
    await page.evaluate((id) => {
      const { scene, game } = window.__game;
      const sprite = scene.heroNativePresentation.sprites.get(id);
      return {
        same: sprite === window.__keptHomeHero,
        visible: sprite?.visible && !['__MISSING', '__DEFAULT'].includes(sprite.texture.key),
        pet: scene.heroNativePresentation.packs.has('heroes-native/lassi'),
        error: game.renderer.gl.getError(),
      };
    }, id),
  ).toEqual({ same: true, visible: true, pet: true, error: 0 });
  expect(errors).toEqual([]);
});
