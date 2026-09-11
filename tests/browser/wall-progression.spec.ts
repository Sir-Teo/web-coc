import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.ready);
  await page.locator('[data-action="skip-tutorial"]').click();
  await expect(page.locator('#loading')).toBeHidden();
});

test('the wall Info panel shows destination health and cost, then persists the upgrade', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const id = await page.evaluate(() => {
    const m = window.__game.model;
    m.townhall!.level = 3;
    const wall = m.state.buildings.find((b) => b.kind === 'wall')!;
    m.selected = wall.id;
    m.state.gold = 5000;
    m.changed();
    return wall.id;
  });
  await page.locator('.wall-context').getByRole('button', { name: 'Info', exact: true }).click();
  const health = page.locator('.info-table tr').filter({ hasText: 'Hitpoints' });
  await expect(health.locator('td').nth(1)).toHaveText('500');
  await expect(health.locator('td').nth(2)).toHaveText(/700/);
  await expect(page.locator('.info-cost')).toContainText('5,000');
  await expect(page.locator('.info-cost')).toContainText('Instant');
  await page.screenshot({
    animations: 'disabled',
    path: `output/playtest/wall-progression-info-${test.info().project.name}.png`,
  });
  await page.locator(`[data-action="wall-info-upgrade:${id}"]`).click();
  expect(
    await page.evaluate((id) => {
      const m = window.__game.model,
        b = m.state.buildings.find((b) => b.id === id)!;
      return {
        gold: m.state.gold,
        hp: b.hp,
        maxHp: b.maxHp,
        level: b.level,
        timer: !!b.upgradeEnd,
      };
    }, id),
  ).toEqual({ gold: 0, hp: 700, maxHp: 700, level: 3, timer: false });
  await page.reload();
  await page.waitForFunction(() => window.__game?.scene.ready);
  expect(
    await page.evaluate((id) => {
      const m = window.__game.model,
        b = m.state.buildings.find((b) => b.id === id)!;
      return [m.state.gold, b.level, b.hp, b.maxHp];
    }, id),
  ).toEqual([0, 3, 700, 700]);
});

test('the shop shows the TH2 wall limit and unlocks another 25 pieces at TH3', async ({ page }) => {
  await page.locator('[data-action="shop"]').last().click();
  await page.locator('[data-action="tab:Defenses"]').click();
  const tile = page
    .locator('.shop-tile')
    .filter({ has: page.locator('[data-action="build:wall"]') });
  await expect(tile).toContainText('25/25');
  await expect(page.locator('[data-action="build:wall"]')).toBeDisabled();
  await page.evaluate(() => {
    const m = window.__game.model;
    m.townhall!.level = 3;
    m.changed();
  });
  await expect(tile).toContainText('25/50');
  await expect(page.locator('[data-action="build:wall"]')).toBeEnabled();
  await expect(page.locator('[data-action="build:wall"]')).toContainText('50');
});
