import { expect, test, type Page } from '@playwright/test';
import { GameModel, initialSave, makeBuilding } from '../../src/game/model';
import { emptyArmy } from '../../src/game/army';
import { validateSave } from '../../src/game/save';

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

async function boot(page: Page) {
  await page.goto('/?lazyart');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
}

async function addMortar(page: Page, level: number) {
  const id = await page.evaluate(async (level) => {
    const { makeBuilding } = await import('/src/game/model.ts');
    const { model, scene } = window.__game;
    const building = makeBuilding(model.state.nextId++, 'mortar', 32, 32, level);
    model.state.buildings.push(building);
    model.changed();
    scene.sync();
    return building.id;
  }, level);
  await page.waitForFunction(() => window.__game.scene.artSettled);
  return id;
}

async function holdPortrait(page: Page) {
  let release!: () => void;
  let requested = false;
  const gate = new Promise<void>((resolve) => (release = resolve));
  await page.route('**/assets/buildings/mortar-native/level-18.png', async (route) => {
    requested = true;
    await gate;
    await route.continue();
  });
  return { release, wait: () => expect.poll(() => requested).toBe(true) };
}

test('an owned family at phone boot loads only its current levels and the placement base', async ({
  page,
}) => {
  const state = initialSave();
  state.tutorial = true;
  state.obstacles = [];
  state.army = emptyArmy();
  state.buildings = [
    makeBuilding(1, 'townhall', 20, 20, 18),
    makeBuilding(2, 'builder', 26, 26),
    makeBuilding(3, 'mortar', 10, 10, 6),
    makeBuilding(4, 'mortar', 32, 32, 18),
  ];
  state.nextId = 5;
  const save = new GameModel(state).state;
  expect(validateSave(save)).toBe(true);
  await page.addInitScript(
    (save) => localStorage.setItem('crown-clan-save-v1', save),
    JSON.stringify(save),
  );
  await page.goto('/?lazyart');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  expect(
    await page.evaluate(() =>
      window.__game.game.textures
        .getTextureKeys()
        .filter((key) => key === 'mortar' || key.startsWith('mortar-level-'))
        .sort(),
    ),
  ).toEqual(['mortar', 'mortar-level-18', 'mortar-level-6']);
});

test('a phone scouting two level-6 Mortars loads their portrait and the placement base only', async ({
  page,
}) => {
  const portraits: string[] = [];
  const errors: string[] = [];
  page.on('request', (request) => {
    if (/\/mortar-native\/level-\d+\.png$/.test(request.url())) portraits.push(request.url());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await boot(page);
  await page.evaluate(async () => {
    const { emptyArmy } = await import('/src/game/army.ts');
    const { freshNativeCampaign } = await import('/src/game/native-campaign.ts');
    const { model } = window.__game;
    model.state.army = { ...emptyArmy(), swordsman: 20 };
    model.state.nativeCampaign = freshNativeCampaign();
    model.state.nativeCampaign.stars.fill(1);
    model.changed();
    model.startCampaign(40);
  });
  await page.waitForFunction(() => window.__game.scene.artSettled);
  expect(portraits.map((url) => new URL(url).pathname).sort()).toEqual([
    '/assets/buildings/mortar-native/level-1.png',
    '/assets/buildings/mortar-native/level-6.png',
  ]);
  expect(
    await page.evaluate(() =>
      window.__game.game.textures
        .getTextureKeys()
        .filter((key) => key === 'mortar' || key.startsWith('mortar-level-'))
        .sort(),
    ),
  ).toEqual(['mortar', 'mortar-level-6']);
  await expect
    .poll(() => page.evaluate(() => window.__game.scene.mortarPresentation.towers.size))
    .toBe(2);
  expect(errors).toEqual([]);
});

test('a later level fetches its own portrait and refreshes a moving preview after decode', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await boot(page);
  const id = await addMortar(page, 6);
  const gate = await holdPortrait(page);
  try {
    await page.evaluate((id) => {
      const { model, scene } = window.__game;
      model.state.buildings.find((building) => building.id === id)!.level = 18;
      model.changed();
      model.move(id);
      scene.sync();
    }, id);
    await gate.wait();
    expect(await page.evaluate(() => window.__game.scene.ghost.texture.key)).toBe('mortar');
    gate.release();
    await expect
      .poll(() => page.evaluate(() => window.__game.scene.ghost.texture.key))
      .toBe('mortar-level-18');
    expect(errors).toEqual([]);
  } finally {
    gate.release();
  }
});

test('a pending late portrait stays owned through idle cleanup and a later family reload', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await boot(page);
  const id = await addMortar(page, 6);
  const gate = await holdPortrait(page);
  try {
    await page.evaluate((id) => {
      const { model, scene } = window.__game;
      model.state.buildings.find((building) => building.id === id)!.level = 18;
      model.changed();
      scene.sync();
    }, id);
    await gate.wait();
    const retained = await page.evaluate((id) => {
      const { model, scene } = window.__game;
      model.state.buildings = model.state.buildings.filter((building) => building.id !== id);
      model.changed();
      scene.sync();
      scene.familyCheckAt = 0;
      scene.familyIdleSince = 0;
      scene.releaseIdleFamilies(scene.time.now + 21_000);
      const family = scene.deferredFamilies.find((family) => family.draws({ kind: 'mortar' }));
      return {
        loaded: scene.loadedFamilies.has(family),
        owned: scene.familyTextures.get(family)?.includes('mortar-level-18'),
        pending: scene.deferredArt.loading('mortar-level-18'),
      };
    }, id);
    expect(retained).toEqual({ loaded: true, owned: true, pending: true });
    gate.release();
    await page.waitForFunction(() => window.__game.scene.textures.exists('mortar-level-18'));
    const released = await page.evaluate(() => {
      const { scene } = window.__game;
      scene.familyCheckAt = 0;
      scene.familyIdleSince = 0;
      scene.releaseIdleFamilies(scene.time.now + 43_000);
      const family = scene.deferredFamilies.find((family) => family.draws({ kind: 'mortar' }));
      return {
        loaded: scene.loadedFamilies.has(family),
        textures: scene.textures
          .getTextureKeys()
          .filter((key) => key === 'mortar' || key.startsWith('mortar-level-')),
      };
    });
    expect(released).toEqual({ loaded: false, textures: [] });
    await addMortar(page, 18);
    expect(await page.evaluate(() => window.__game.scene.textures.exists('mortar-level-18'))).toBe(
      true,
    );
    expect(errors).toEqual([]);
  } finally {
    gate.release();
  }
});
