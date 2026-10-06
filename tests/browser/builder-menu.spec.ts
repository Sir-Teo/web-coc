import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
});

test('the builder counter opens the builder menu, whose suggestions show each building in turn', async ({
  page,
  browserName,
}) => {
  const village = await page.evaluate(() => {
    const m = window.__game.model;
    m.townhall!.level = 5;
    m.state.gold = m.state.elixir = 1_000_000;
    const cannons = m.state.buildings.filter((b) => b.kind === 'cannon');
    for (const b of cannons) b.level = 2;
    // One builder at work on the Gold Storage.
    const storage = m.state.buildings.find((b) => b.kind === 'goldstorage')!;
    m.upgrade(storage.id);
    m.changed();
    return { storage: storage.id, cannons: cannons.map((b) => b.id) };
  });
  await page.locator('.status-chips [data-action="builders"]').tap();
  await expect(page.locator('#modal-title')).toHaveText('Builders');
  const menu = page.locator('.builder-menu');
  await expect(menu.locator('h3')).toHaveText([
    'Upgrades in progress:',
    'Suggested upgrades:',
    'Other upgrades:',
  ]);
  await expect(menu.locator('.working')).toContainText('Gold Storage');
  for (const row of await menu.locator('.builder-option').all()) {
    const box = (await row.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
  await page.screenshot({ path: `output/playtest/builder-menu-390-${browserName}.png` });
  // The Cannons share one row; each tap shows the next of them.
  const cannons = menu.locator('[data-action="builder-option:cannon,2"]');
  await expect(cannons).toContainText(`×${village.cannons.length}`);
  await expect(menu.locator('[data-action^="builder-option:wall,"]')).toHaveCount(0);
  const seen: number[] = [];
  for (let i = 0; i < 2; i++) {
    if (i) await page.locator('.status-chips [data-action="builders"]').tap();
    await page.locator('[data-action="builder-option:cannon,2"]').tap();
    await expect(page.locator('#modal-title')).toHaveCount(0);
    seen.push(await page.evaluate(() => window.__game.model.selected!));
  }
  expect(village.cannons).toContain(seen[0]);
  expect(village.cannons).toContain(seen[1]);
  expect(seen[1]).not.toBe(seen[0]);
  // The work in progress opens its building, and More builders opens the Shop.
  await page.locator('.status-chips [data-action="builders"]').tap();
  await menu.locator('.working').first().tap();
  expect(await page.evaluate(() => window.__game.model.selected)).toBe(village.storage);
  await page.locator('.status-chips [data-action="builders"]').tap();
  await page.locator('[data-action="builder-hut"]').tap();
  await expect(page.locator('.drawer-sheet')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
