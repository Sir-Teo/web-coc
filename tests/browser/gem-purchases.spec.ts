import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

test('a Shop building the village cannot afford offers its missing elixir for gems, then goes in hand', async ({
  page,
  browserName,
}) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  const cost = await page.evaluate(async () => {
    const { buildPrice } = await import('/src/game/data.ts');
    const m = window.__game.model;
    m.townhall!.level = 5;
    m.state.elixir = 0;
    m.state.gems = 500;
    m.changed();
    return buildPrice('laboratory', 0).cost;
  });
  await page.locator('[data-action="shop"]').last().click();
  await page.locator('[data-action="tab:Army"]').click();
  await page.locator('[data-action="build:laboratory"]').click();
  // The client's own wording, with the price from its resource table.
  await expect(page.locator('#modal-title')).toHaveText('You need more Elixir');
  await expect(page.locator('.shortfall-body')).toContainText(
    `Buy the missing ${cost.toLocaleString()} Elixir?`,
  );
  const buy = page.locator('[data-action="shortfall-buy"]');
  const box = (await buy.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(44);
  await page.screenshot({ path: `output/playtest/gem-purchase-390-${browserName}.png` });
  const gems = await page.evaluate(async (cost) => {
    const { resourceGems } = await import('/src/game/gem-costs.ts');
    return resourceGems('elixir', cost);
  }, cost);
  await expect(buy).toContainText(String(gems));
  await buy.tap();
  await expect(page.locator('.placement-banner')).toBeVisible();
  expect(
    await page.evaluate(() => ({
      placement: window.__game.model.placement,
      elixir: window.__game.model.state.elixir,
      gems: window.__game.model.state.gems,
    })),
  ).toEqual({ placement: 'laboratory', elixir: cost, gems: 500 - gems });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test('declining the offer keeps the gems, and a short gem balance cannot buy', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  await page.evaluate(() => {
    const m = window.__game.model;
    m.state.gold = 0;
    m.state.gems = 0;
    m.upgrade(m.state.buildings.find((b) => b.kind === 'cannon')!.id);
  });
  await expect(page.locator('#modal-title')).toHaveText('You need more Gold');
  await expect(page.locator('[data-action="shortfall-buy"]')).toBeDisabled();
  await expect(page.locator('.shortfall-body')).toContainText('Not enough Gems');
  await page.locator('.shortfall-body [data-action="close"]').tap();
  await expect(page.locator('#modal-title')).toBeHidden();
  expect(await page.evaluate(() => window.__game.model.shortfall)).toBeNull();
});
