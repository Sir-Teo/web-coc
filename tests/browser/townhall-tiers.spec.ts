import { test, expect, type Page } from '@playwright/test';

async function boot(page: Page) {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
}
/** Raise the village to a tier on cleared ground, with room to buy anything. */
async function tier(page: Page, townhall: number) {
  await page.evaluate((townhall) => {
    const m = window.__game.model;
    m.state.obstacles = [];
    m.townhall!.level = townhall;
    m.state.gold = m.state.elixir = 500_000_000;
    m.state.dark = 20_000_000;
    m.changed();
  }, townhall);
}
const tierCard = (page: Page, townhall: number) =>
  page
    .locator('.progression-tier')
    .filter({ has: page.getByRole('heading', { name: `Town Hall ${townhall}`, exact: true }) });

test('the progression browser lists every tier and the families each one unlocks', async ({
  page,
}) => {
  await boot(page);
  await page.locator('.train-add').click();
  await page.locator('[data-action="progression"]').click();
  await expect(page.locator('.progression-tier')).toHaveCount(18);
  await expect(tierCard(page, 9)).toContainText('X-Bow');
  await expect(tierCard(page, 10)).toContainText('Inferno Tower');
  await expect(tierCard(page, 11)).toContainText('Eagle Artillery');
  await expect(tierCard(page, 11)).toContainText('Tornado Trap');
  await expect(tierCard(page, 13)).toContainText('Scattershot');
  await expect(tierCard(page, 15)).toContainText('Monolith');
  await expect(tierCard(page, 15)).toContainText('Spell Tower');
});

test('the shop opens the late families at their own tiers', async ({ page }) => {
  await boot(page);
  const tile = (name: string) => page.locator('.shop-tile').filter({ hasText: name });
  await page.locator('.shop-btn').click();
  await page.locator('[data-action="tab:Defenses"]').click();
  // A starter village sees each one locked behind its original Town Hall.
  await expect(tile('Inferno Tower')).toContainText('Town Hall 10');
  await expect(tile('Eagle Artillery')).toContainText('Town Hall 11');
  await expect(tile('Scattershot')).toContainText('Town Hall 13');
  await expect(tile('Monolith')).toContainText('Town Hall 15');
  await tier(page, 18);
  await expect(tile('Inferno Tower').locator('.shop-count')).toHaveText('0/3');
  await expect(tile('Eagle Artillery').locator('.shop-count')).toHaveText('0/1');
  await expect(tile('Scattershot').locator('.shop-count')).toHaveText('0/2');
});

test('a late-tier village builds a Spell Tower and cycles its original weapons', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await boot(page);
  await tier(page, 18);
  // Placement by pointer is covered by the expansion suite; this checks the built result.
  const id = await page.evaluate(() => {
    const m = window.__game.model;
    m.beginBuild('spelltower');
    if (!m.place(30, 30)) throw Error('Spell Tower cannot be placed');
    const built = m.state.buildings.at(-1)!;
    m.tick(built.upgradeEnd! + 1);
    m.selected = built.id;
    m.changed();
    return built.id;
  });
  const weapon = page.locator('.building-context [data-action="spell-tower-weapon"]');
  await expect(weapon).toContainText('Rage');
  await weapon.click();
  await expect(weapon).toContainText('Poison');
  await weapon.click();
  await expect(weapon).toContainText('Invisibility');
  expect(
    await page.evaluate(
      (id) => window.__game.model.state.buildings.find((b) => b.id === id)!.spellTowerWeapon,
      id,
    ),
  ).toBe('invisibility');
  expect(errors).toEqual([]);
});
