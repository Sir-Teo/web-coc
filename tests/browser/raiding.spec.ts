import { readFileSync } from 'node:fs';
import { useDevelopedVillage } from './developed-village';
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await useDevelopedVillage(page);
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
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await expect.poll(() => page.evaluate(() => window.__game.model.state.army.wallbreaker)).toBe(2);
  expect(errors).toEqual([]);
});

test('seven troop keys and three spell keys select and deploy the right units', async ({
  page,
}) => {
  await page.locator('[data-action="campaign"]').first().click();
  await page.locator('[data-action="attack:0"]').click();
  await page.keyboard.press('5');
  await expect(page.locator('[data-action="troop:wallbreaker"]')).toHaveClass(/selected/);
  await expect(page.locator('.deploy-label')).toContainText('Walls ×40');
  const point = await page.evaluate(() => window.__game.scene.screenFor(4, 12));
  await page.mouse.click(point.x, point.y);
  await expect
    .poll(() =>
      page.evaluate(() => window.__game.model.battle.units.some((u) => u.kind === 'wallbreaker')),
    )
    .toBe(true);
  await page.keyboard.press('4');
  await expect(page.locator('[data-action="troop:goblin"]')).toHaveClass(/selected/);
  await page.mouse.click(point.x, point.y + 20);
  await expect
    .poll(() =>
      page.evaluate(() => window.__game.model.battle.units.some((u) => u.kind === 'goblin')),
    )
    .toBe(true);
  await page.keyboard.press('0');
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

test('rejects a mislabeled current backup, then imports a genuine version 2 village', async ({
  page,
}) => {
  // Emitted and validated by the historical 6910dd19 model before the 28-tile grid expanded.
  const legacy = readFileSync(new URL('../fixtures/village-v2-6910dd19.json', import.meta.url));
  await page.clock.setFixedTime(Date.parse('2026-09-12T12:00:00Z'));
  const snapshot = () =>
    page.evaluate(() => {
      const { state } = window.__game.model;
      const { version, gold, army, raidLog, buildings } = state;
      return {
        version,
        gold,
        army,
        records: raidLog?.map(({ id, replay }) => ({ id, replay })),
        buildings: buildings.map(({ id, x, y, level, upgradeEnd }) => ({
          id,
          x,
          y,
          level,
          upgradeEnd,
        })),
      };
    });
  const before = await snapshot();
  const invalid = await page.evaluate(() => {
    const state = structuredClone(window.__game.model.state);
    state.version = 2;
    delete state.army.goblin;
    delete state.army.wallbreaker;
    state.gold = 4321;
    return JSON.stringify(state);
  });
  expect(before.buildings.some(({ x, y }) => x >= 28 || y >= 28)).toBe(true);
  await page.locator('[data-action="settings"]').click();
  const file = page.locator('#import-file');
  const confirm = page.locator('[data-action="import-confirm"]');
  await file.setInputFiles({
    name: 'mislabeled-village.json',
    mimeType: 'application/json',
    buffer: Buffer.from(invalid),
  });
  await expect(page.locator('#toast')).toContainText('not a valid Crown & Clan village');
  await expect(confirm).toHaveCount(0);
  expect(await snapshot()).toEqual(before);

  await file.setInputFiles({
    name: 'village-v2.json',
    mimeType: 'application/json',
    buffer: legacy,
  });
  await expect(confirm).toBeVisible();
  expect(await snapshot()).toEqual(before);
  await confirm.click();
  await expect(page.locator('#toast')).toContainText('Village updated · 1 building moved to clear ground. Your progress is preserved.');
  const restored = await snapshot();
  expect(restored).toMatchObject({
    version: 4,
    gold: 4321,
    army: { swordsman: 12, goblin: 0, wallbreaker: 0 },
    records: [{ replay: { version: 11 } }],
  });
  expect(restored.buildings.find(({ id }) => id === 10)).toMatchObject({
    level: 1,
    upgradeEnd: Date.parse('2026-09-12T12:00:45Z'),
  });
  await page.reload();
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  expect(await snapshot()).toEqual(restored);

  await page.locator('[data-action="battle-log"]').click();
  const record = page.locator('.raid-record');
  await expect(record).toContainText('Your village');
  await expect(record).toContainText('Replay unavailable · Recorded before a combat update.');
  await expect(record.getByRole('button', { name: 'Watch replay' })).toHaveCount(0);
  expect(await snapshot()).toEqual(restored);
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
  await expect(page.locator('#toast')).toContainText('Range 4–11 tiles');
  expect(await page.evaluate(() => window.__game.model.battle.started)).toBe(false);
  await page.waitForTimeout(350);
  await page.screenshot({
    path: `output/playtest/mortar-scouting-${test.info().project.name}.png`,
  });
});
