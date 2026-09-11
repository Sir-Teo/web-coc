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
  await expect(health.locator('td').nth(1)).toHaveText('200');
  await expect(health.locator('td').nth(2)).toHaveText(/400/);
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
  ).toEqual({ gold: 0, hp: 400, maxHp: 400, level: 3, timer: false });
  await page.reload();
  await page.waitForFunction(() => window.__game?.scene.ready);
  expect(
    await page.evaluate((id) => {
      const m = window.__game.model,
        b = m.state.buildings.find((b) => b.id === id)!;
      return [m.state.gold, b.level, b.hp, b.maxHp];
    }, id),
  ).toEqual([0, 3, 400, 400]);
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
  await expect(page.locator('[data-action="build:wall"]')).toHaveText('Free');
});

test('an empty treasury can place a free wall run up to the count limit and reload it', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const firstId = await page.evaluate(() => {
    const { model: m, scene } = window.__game;
    const removed = new Set(
      m.state.buildings
        .filter((b) => b.kind === 'wall')
        .slice(0, 2)
        .map((b) => b.id),
    );
    m.state.buildings = m.state.buildings.filter((b) => !removed.has(b.id));
    m.state.obstacles = [];
    m.state.gold = 0;
    m.changed();
    scene.cameras.main.centerOn(896, 208);
    return m.state.nextId;
  });
  await page.locator('.shop-btn').click();
  await page.locator('[data-action="tab:Defenses"]').click();
  const buy = page.locator('[data-action="build:wall"]');
  await expect(buy).toHaveText('Free');
  await page.screenshot({
    path: `output/playtest/free-wall-shop-${test.info().project.name || 'chromium'}.png`,
    animations: 'disabled',
  });
  await buy.click();
  for (const x of [3, 5]) {
    const p = await page.evaluate((x) => window.__game.scene.screenFor(x, 3), x);
    await page.mouse.click(p.x, p.y);
  }
  await expect(page.locator('.wall-context')).toBeVisible();
  const snapshot = () =>
    page.evaluate((firstId) => {
      const m = window.__game.model;
      return {
        gold: m.state.gold,
        count: m.countOf('wall'),
        placement: m.placement,
        walls: m.state.buildings
          .filter((b) => b.id >= firstId)
          .map((b) => ({ id: b.id, x: b.x, y: b.y, hp: b.hp, timer: !!b.upgradeEnd })),
        busy: m.busy,
      };
    }, firstId);
  const placed = await snapshot();
  expect(placed).toMatchObject({ gold: 0, count: 25, placement: null, busy: 0 });
  expect(placed.walls).toHaveLength(2);
  for (const wall of placed.walls) expect(wall).toMatchObject({ hp: 100, timer: false });
  await page.reload();
  await page.waitForFunction(() => window.__game?.scene.ready);
  expect(await snapshot()).toEqual(placed);
  await page.locator('.shop-btn').click();
  await page.locator('[data-action="tab:Defenses"]').click();
  await expect(buy).toBeDisabled();
  await expect(buy).toHaveText('At limit');
});
