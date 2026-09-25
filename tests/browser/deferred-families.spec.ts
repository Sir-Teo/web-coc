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
