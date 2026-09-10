import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.ready);
  await page.locator('[data-action="skip-tutorial"]').click();
});

test('new troop portraits, tactical details, training and reload persistence', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.locator('.train-add').click();
  await page.getByRole('button', { name: 'About Goblin', exact: true }).click();
  await expect(page.locator('#modal-title')).toHaveText('Goblin');
  await expect(page.locator('.troop-stats')).toContainText('Resources (2× damage)');
  await expect(page.locator('.troop-info-hero img')).toHaveJSProperty('naturalWidth', 360);
  await page.waitForTimeout(350);
  await page.screenshot({ path: 'output/playtest/goblin-details-desktop.png' });
  await page.locator('.troop-info-body [data-action="army"]').click();
  await page.getByRole('button', { name: 'About Wall Breaker', exact: true }).click();
  await expect(page.locator('.troop-stats')).toContainText('Walls (40× damage)');
  await page.waitForTimeout(350);
  await page.screenshot({ path: 'output/playtest/wallbreaker-details-desktop.png' });
  await page.locator('.troop-info-body [data-action="army"]').click();
  await page.locator('[data-action="train:goblin"]').click();
  await page.locator('[data-action="train:wallbreaker"]').click();
  await page.evaluate(() => window.advanceTime(60000));
  await expect.poll(() => page.evaluate(() => window.__game.model.state.army.goblin)).toBe(3);
  await expect.poll(() => page.evaluate(() => window.__game.model.state.army.wallbreaker)).toBe(2);
  await page.waitForTimeout(350);
  await page.screenshot({ path: 'output/playtest/specialist-army-desktop.png' });
  await page.reload();
  await page.waitForFunction(() => window.__game?.scene.ready);
  await expect.poll(() => page.evaluate(() => window.__game.model.state.army.wallbreaker)).toBe(2);
  expect(errors).toEqual([]);
});

test('seven troop keys and three spell keys select and deploy the right units', async ({
  page,
}) => {
  await page.locator('[data-action="campaign"]').first().click();
  await page.locator('[data-action="attack:0"]').click();
  await page.keyboard.press('7');
  await expect(page.locator('[data-action="troop:wallbreaker"]')).toHaveClass(/selected/);
  await expect(page.locator('.deploy-label')).toContainText('Walls ×40');
  const point = await page.evaluate(() => window.__game.scene.screenFor(4, 12));
  await page.mouse.click(point.x, point.y);
  await expect
    .poll(() =>
      page.evaluate(() => window.__game.model.battle.units.some((u) => u.kind === 'wallbreaker')),
    )
    .toBe(true);
  await page.keyboard.press('6');
  await expect(page.locator('[data-action="troop:goblin"]')).toHaveClass(/selected/);
  await page.mouse.click(point.x, point.y + 20);
  await expect
    .poll(() =>
      page.evaluate(() => window.__game.model.battle.units.some((u) => u.kind === 'goblin')),
    )
    .toBe(true);
  await page.keyboard.press('8');
  await expect(page.locator('[data-action="spell:rage"]')).toHaveClass(/selected/);
  await page.waitForTimeout(350);
  await page.screenshot({ path: 'output/playtest/specialists-battle-desktop.png' });
});

test('mobile army and battle trays scroll to every specialist without overflowing', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.army-label button').click();
  await page.getByRole('button', { name: 'About Wall Breaker', exact: true }).click();
  await expect(page.locator('#modal-title')).toHaveText('Wall Breaker');
  await page.waitForTimeout(350);
  await page.screenshot({ path: 'output/playtest/wallbreaker-details-mobile.png' });
  await page.locator('[data-action="close"]').click();
  await page.locator('[data-action="campaign"]').first().click();
  await page.locator('[data-action="attack:0"]').click();
  await page.locator('[data-action="troop:wallbreaker"]').click();
  await expect(page.locator('[data-action="troop:wallbreaker"]')).toHaveClass(/selected/);
  await page.waitForTimeout(350);
  await page.screenshot({ path: 'output/playtest/specialists-battle-mobile.png' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  const bounds = await page.locator('.army-tray').boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  const enemy = await page.locator('.battle-enemy').boundingBox();
  const timer = await page.locator('.battle-clock').boundingBox();
  const prep = await page.locator('.prep-banner').boundingBox();
  expect(timer!.y).toBeGreaterThan(enemy!.y + enemy!.height);
  expect(prep!.y).toBeGreaterThan(timer!.y + timer!.height);
  const selected = await page.locator('[data-action="troop:wallbreaker"]').boundingBox();
  expect(selected!.x).toBeGreaterThanOrEqual(0);
  expect(selected!.x + selected!.width).toBeLessThanOrEqual(390);
});

test('imports an older village backup and preserves its gold and existing army', async ({
  page,
}) => {
  const backup = await page.evaluate(() => {
    const s = structuredClone(window.__game.model.state);
    delete s.army.goblin;
    delete s.army.wallbreaker;
    s.gold = 4321;
    return JSON.stringify(s);
  });
  await page.locator('[data-action="settings"]').click();
  await page.locator('#import-file').setInputFiles({
    name: 'older-village.json',
    mimeType: 'application/json',
    buffer: Buffer.from(backup),
  });
  await expect(page.locator('#toast')).toHaveText('Village restored successfully.');
  expect(
    await page.evaluate(() => ({
      gold: window.__game.model.state.gold,
      army: window.__game.model.state.army,
    })),
  ).toMatchObject({
    gold: 4321,
    army: { swordsman: 12, goblin: 0, wallbreaker: 0 },
  });
});

test('scouting a mortar shows its range without starting the battle', async ({ page }) => {
  await page.evaluate(() => {
    const m = window.__game.model;
    m.state.stars.fill(1);
    m.startBattle(2);
  });
  await expect(page.locator('.prep-banner')).toBeVisible();
  const mortar = await page.evaluate(() => {
    const { model, scene } = window.__game;
    const b = model.battle.buildings.find((v) => v.kind === 'mortar');
    const p = scene.screenFor(b.x + 1, b.y + 1);
    return { id: b.id, x: p.x, y: p.y - 18 };
  });
  await page.mouse.click(mortar.x, mortar.y);
  await expect.poll(() => page.evaluate(() => window.__game.model.selected)).toBe(mortar.id);
  await expect(page.locator('#toast')).toContainText('Range 4–10 tiles');
  expect(await page.evaluate(() => window.__game.model.battle.started)).toBe(false);
  await page.waitForTimeout(350);
  await page.screenshot({ path: 'output/playtest/mortar-scouting-desktop.png' });
});
