import { test, expect, type Page } from '@playwright/test';

const drawn = (page: Page, kind: string) =>
  page.evaluate((kind) => {
    const { model, scene } = window.__game;
    const b = model.state.buildings.find((v) => v.kind === kind)!;
    return scene.children.list.filter(
      (o: { getData?: (k: string) => unknown }) => o.getData?.('nativeVillage') === b.id,
    ).length;
  }, kind);

test('a starter village and its army load only their own levels’ pages', async ({ page }) => {
  test.setTimeout(120_000);
  const requests: string[] = [];
  page.on('request', (r) => requests.push(new URL(r.url()).pathname));
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  await page.locator('#loading').waitFor({ state: 'detached' });
  for (const kind of ['townhall', 'builder', 'goldstorage', 'barracks'])
    await expect.poll(() => drawn(page, kind)).toBeGreaterThan(0);
  expect(requests.some((r) => r.startsWith('/assets/native-pages/'))).toBe(true);
  // Neither the 3002×3066 Town Hall atlas nor the all-level Barbarian atlas is fetched.
  expect(requests).not.toContain('/assets/village-native/townhall/buildings/texture-25.png');
  expect(requests).not.toContain('/assets/troops-native/swordsman/chr_barbarian/texture-0.png');
  // Starting an upgrade draws the same level's construction art from pages already loaded.
  await page.evaluate(() => {
    const m = window.__game.model;
    m.state.gold = m.state.elixir = 5_000_000;
    m.upgrade(m.state.buildings.find((b) => b.kind === 'townhall')!.id);
    m.changed();
  });
  await expect.poll(() => drawn(page, 'townhall')).toBeGreaterThan(0);
  // A deployed Barbarian draws from its level's pages.
  await page.evaluate(() => {
    const m = window.__game.model;
    m.startBattle(0, true);
    m.activeTroop = 'swordsman';
    m.deploy(1, 11);
  });
  await expect
    .poll(() =>
      page.evaluate(() => {
        const { model, scene } = window.__game;
        const unit = model.battle!.units.find((u) => u.kind === 'swordsman');
        return !!unit && scene.troopNativePresentation.drewUnit(unit.id);
      }),
    )
    .toBe(true);
  expect(requests).not.toContain('/assets/troops-native/swordsman/chr_barbarian/texture-0.png');
  await page.screenshot({ path: 'output/playtest/native-pages.png' });
});
