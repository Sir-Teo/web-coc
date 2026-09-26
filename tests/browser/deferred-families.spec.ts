import { test, expect } from '@playwright/test';

// Production loads a defense family's art only when something draws it; the dev server loads
// every family after boot unless `?lazyart` asks for the production behavior.
test.describe.configure({ timeout: 120_000 });

const loaded = (prefix: string) =>
  `window.__game.game.textures.getTextureKeys().some((k) => k.startsWith('${prefix}:mesh:'))`;

test('a family loads on first use and holds the battle that needs it', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?lazyart');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  // The starter village owns no Mortar or Wizard Tower: neither is resident.
  expect(await page.evaluate(loaded('mortar'))).toBe(false);
  expect(await page.evaluate(loaded('wizardtower'))).toBe(false);

  // Stage 40 has both. The battle holds until they have loaded, then runs and draws them.
  await page.evaluate(async () => {
    const { emptyArmy } = await import('/src/game/army.ts');
    const { freshNativeCampaign } = await import('/src/game/native-campaign.ts');
    const m = window.__game.model;
    m.state.army = { ...emptyArmy(), swordsman: 20 };
    m.state.nativeCampaign = freshNativeCampaign();
    m.state.nativeCampaign.stars.fill(1);
    m.changed();
    m.startCampaign(40);
  });
  expect(await page.evaluate(() => window.__game.scene.artSettled)).toBe(false);
  await page.waitForFunction(() => window.__game.scene.artSettled);
  expect(await page.evaluate(loaded('mortar'))).toBe(true);
  expect(await page.evaluate(loaded('wizardtower'))).toBe(true);
  await page.evaluate(() => {
    const m = window.__game.model;
    m.activeTroop = 'swordsman';
    for (const [x, y] of [
      [2, 24],
      [24, 2],
      [46, 24],
      [24, 46],
    ])
      if (!m.deployBlocked(x, y)) {
        m.deploy(x, y);
        break;
      }
  });
  await expect
    .poll(() => page.evaluate(() => window.__game.model.battle?.elapsed ?? 0))
    .toBeGreaterThan(0);
  const drawn = await page.evaluate(
    () =>
      window.__game.scene.mortarPresentation.towers.size +
      window.__game.scene.wizardTowerPresentation.towers.size,
  );
  expect(drawn).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('families the home village does not draw are released after a while and load again', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?lazyart');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  const attack = () =>
    page.evaluate(async () => {
      const { emptyArmy } = await import('/src/game/army.ts');
      const { freshNativeCampaign } = await import('/src/game/native-campaign.ts');
      const m = window.__game.model;
      m.state.army = { ...emptyArmy(), swordsman: 20 };
      m.state.nativeCampaign = freshNativeCampaign();
      m.state.nativeCampaign.stars.fill(1);
      m.changed();
      m.startCampaign(40);
    });
  await attack();
  await page.waitForFunction(() => window.__game.scene.artSettled);
  expect(await page.evaluate(loaded('mortar'))).toBe(true);
  await page.evaluate(() => {
    const m = window.__game.model;
    m.suspendBattle();
    m.returnHome();
    window.__game.scene.sync();
  });
  // Released after 20 s at home: the starter village draws no Mortar.
  await page.waitForFunction(`!(${loaded('mortar')})`, null, { timeout: 40_000 });
  await attack();
  await page.waitForFunction(() => window.__game.scene.artSettled);
  expect(await page.evaluate(loaded('mortar'))).toBe(true);
  await expect
    .poll(() => page.evaluate(() => window.__game.scene.mortarPresentation.towers.size))
    .toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('a campaign building drawn before its family lands appears once the art is in', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?lazyart');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  // The first Goblin village scouts while its Town Hall's family is still loading.
  await page.evaluate(async () => {
    const { emptyArmy } = await import('/src/game/army.ts');
    const m = window.__game.model;
    m.state.army = { ...emptyArmy(), swordsman: 20 };
    m.changed();
    m.startCampaign(0);
  });
  await page.waitForFunction(() => window.__game.scene.artSettled);
  // Views are redrawn against the landed textures: no mesh keeps Phaser's missing texture.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const views = [...window.__game.scene.goblinBuildingPresentation.buildings.values()];
        const meshes = views.flatMap((view) => [...view.meshes.values()]);
        return (
          meshes.length > 0 &&
          meshes.every((mesh) => mesh.texture.key !== '__MISSING' && mesh.visible)
        );
      }),
    )
    .toBe(true);
  expect(errors).toEqual([]);
});

test('a family whose art failed keeps its fallback and loads once the network returns', async ({
  page,
}) => {
  await page.goto('/?lazyart');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  // The Mortar's level pages fail, as they would offline.
  await page.route('**/assets/buildings/mortar-native/**', (route) => route.abort());
  await page.evaluate(async () => {
    const { emptyArmy } = await import('/src/game/army.ts');
    const { freshNativeCampaign } = await import('/src/game/native-campaign.ts');
    const m = window.__game.model;
    m.state.army = { ...emptyArmy(), swordsman: 20 };
    m.state.nativeCampaign = freshNativeCampaign();
    m.state.nativeCampaign.stars.fill(1);
    m.changed();
    m.startCampaign(40);
  });
  // A failed family never holds the battle, and its fallback sprite stays visible.
  await page.waitForFunction(() => window.__game.scene.artSettled);
  const fallback = () =>
    page.evaluate(() => {
      const { model, scene } = window.__game;
      const mortar = model.battle.buildings.find((b) => b.kind === 'mortar');
      return scene.sprites.get(mortar.id).alpha;
    });
  expect(await fallback()).toBeGreaterThan(0);
  expect(await page.evaluate(loaded('mortar'))).toBe(true);
  // Back online: the family is requested again without a refresh.
  await page.unroute('**/assets/buildings/mortar-native/**');
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect.poll(fallback, { timeout: 30_000 }).toBe(0);
});

test('garrison defenders and the legacy King load only when a battle draws them', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?lazyart');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  // The home village draws neither: the boot preload no longer carries them.
  expect(await page.evaluate(loaded('garrison-dragon'))).toBe(false);
  expect(await page.evaluate(() => window.__game.game.textures.exists('king-front-left'))).toBe(
    false,
  );
  // No Flight Zone posts a Clan Castle garrison; its battle holds until the art lands.
  await page.evaluate(async () => {
    const { emptyArmy } = await import('/src/game/army.ts');
    const { freshNativeCampaign } = await import('/src/game/native-campaign.ts');
    const m = window.__game.model;
    m.state.army = { ...emptyArmy(), swordsman: 20 };
    m.state.nativeCampaign = freshNativeCampaign();
    m.state.nativeCampaign.stars.fill(1);
    m.changed();
    m.startCampaign(56);
  });
  expect(await page.evaluate(() => window.__game.model.battle.garrisons.length)).toBeGreaterThan(0);
  await page.waitForFunction(() => window.__game.scene.artSettled);
  expect(await page.evaluate(loaded('garrison-dragon'))).toBe(true);
  expect(errors).toEqual([]);
});
