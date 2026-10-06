import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
});

test('the Shop’s Treasure sells storage packs for gems after the client’s confirmation', async ({
  page,
  browserName,
}) => {
  const village = await page.evaluate(async () => {
    const { resourceGems } = await import('/src/game/gem-costs.ts');
    const m = window.__game.model;
    m.state.gold = 0;
    m.state.gems = 500;
    m.changed();
    const cap = m.resourceCap('gold');
    return { cap, tenth: Math.floor(cap / 10), gems: resourceGems('gold', Math.floor(cap / 10)) };
  });
  await page.locator('.shop-btn').tap();
  await page.locator(`[data-action="tab:Treasure"]`).tap();
  // A starter village stores no Dark Elixir: Gold and Elixir only, three packs each.
  await expect(page.locator('.treasure-tile')).toHaveCount(6);
  const tenth = page.locator('[data-pack="gold-10"]');
  await expect(tenth).toContainText('Fill Storages by 10%');
  await expect(tenth).toContainText(`+${village.tenth.toLocaleString()}`);
  await expect(page.locator('[data-pack="gold-100"]')).toContainText('Fill Gold Storages');
  await page.screenshot({ path: `output/playtest/treasure-390-${browserName}.png` });
  await tenth.locator('button').tap();
  await expect(page.locator('#modal-title')).toHaveText('Buy Gold?');
  await expect(page.locator('.shortfall-body')).toContainText(
    `Are you sure you want to buy ${village.tenth.toLocaleString()} Gold?`,
  );
  await page.locator('[data-action="treasure-buy"]').tap();
  expect(
    await page.evaluate(() => ({
      gold: window.__game.model.state.gold,
      gems: window.__game.model.state.gems,
    })),
  ).toEqual({ gold: village.tenth, gems: 500 - village.gems });
  // Back in the Treasure, now 90% short of full: the half pack still fits, the full one fills.
  await expect(page.locator('.treasure-tile')).toHaveCount(6);
  await expect(page.locator('[data-pack="gold-100"]')).toContainText(
    `+${(village.cap - village.tenth).toLocaleString()}`,
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test('full storages lock their packs and too few gems stop the purchase', async ({ page }) => {
  await page.evaluate(() => {
    const m = window.__game.model;
    m.state.gold = m.resourceCap('gold');
    m.state.elixir = 0;
    m.state.gems = 0;
    m.changed();
  });
  await page.locator('.shop-btn').tap();
  await page.locator(`[data-action="tab:Treasure"]`).tap();
  for (const share of [10, 50, 100])
    await expect(page.locator(`[data-pack="gold-${share}"] button`)).toHaveText(
      'Not enough storage space!',
    );
  await expect(page.locator('[data-pack="gold-10"] button')).toBeDisabled();
  await page.locator('[data-pack="elixir-50"] button').tap();
  await expect(page.locator('#modal-title')).toHaveText('Buy Elixir?');
  await expect(page.locator('[data-action="treasure-buy"]')).toBeDisabled();
  await expect(page.locator('.shortfall-body')).toContainText('Not enough Gems');
  await page.locator('.shortfall-body [data-action="close"]').tap();
  await expect(page.locator('.treasure-tile')).toHaveCount(6);
});
