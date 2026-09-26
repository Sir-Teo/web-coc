import { test, expect } from '@playwright/test';

// Regressions for the 2026-09 HUD audit: each check drives the real HUD rather than the model.
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.evaluate(() => {
    window.__game.audio?.enabled && (window.__game.audio.enabled = false);
  });
});

test('collector info shows the simulated production and capacity', async ({ page }) => {
  await page.evaluate(() => {
    const { model, hud } = window.__game;
    const mine = model.state.buildings.find((b) => b.kind === 'goldmine');
    mine.level = 2;
    model.selected = mine.id;
    hud.show('info');
  });
  const row = (label: string) =>
    page.locator('.info-table tr', { hasText: label }).locator('td').nth(1);
  await expect(row('Holds')).toHaveText('2,000');
  await expect(row('Production')).toHaveText('400 / hour');
});

test('an import that cannot be saved says so instead of reporting success', async ({ page }) => {
  const backup = await page.evaluate(() => {
    const state = structuredClone(window.__game.model.state);
    state.gold = 4321;
    return JSON.stringify(state);
  });
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    };
    IDBObjectStore.prototype.put = () => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    };
  });
  await page.locator('#import-file').setInputFiles({
    name: 'village.json',
    mimeType: 'application/json',
    buffer: Buffer.from(backup),
  });
  await expect(page.locator('#toast')).toContainText('session only');
  await expect(page.locator('#toast')).not.toContainText('successfully');
  await expect(page.locator('#save-state')).toContainText('Saving is unavailable');
  expect(await page.evaluate(() => window.__game.model.state.gold)).toBe(4321);
});

test('the Star Bonus becomes collectable when its cooldown ends with the panel open', async ({
  page,
}) => {
  await page.evaluate(() => {
    const { model, hud } = window.__game;
    model.state.starBonus = { stars: 5, readyAt: model.clock + 1000 };
    hud.show('achievements');
  });
  const collect = page.locator('.star-bonus [data-action="star-bonus"]');
  await expect(collect).toBeDisabled();
  await expect(page.locator('.star-bonus')).toContainText('Ready in');
  // Only the clock moves: no structural redraw happens.
  await page.evaluate(() => window.__game.model.tick(window.__game.model.clock + 1500));
  await expect(collect).toBeEnabled();
  await expect(page.locator('.star-bonus')).toContainText('Ready to collect');
});

test('an expired super boost locks the troop and offers the boost again', async ({ page }) => {
  await page.evaluate(async () => {
    const { TROOP_KEYS, maxTroopLevel } = await import('/src/game/data.ts');
    const { model } = window.__game;
    model.townhall.level = 11;
    model.state.dark = 100000;
    model.state.troopLevels = Object.fromEntries(TROOP_KEYS.map((k) => [k, maxTroopLevel(k)]));
    model.boostSuperTroop('superbarbarian');
  });
  await page.locator('.train-add').click();
  const tile = page.locator('.army-tile', {
    has: page.locator('[data-action="train:superbarbarian"]'),
  });
  await expect(tile.locator('[data-action="train:superbarbarian"]')).toBeEnabled();
  await expect(tile.locator('.boost-left')).toContainText('left');
  await page.evaluate(() => {
    const { model } = window.__game;
    model.tick(model.state.superBoosts.superbarbarian);
  });
  await expect(tile.locator('[data-action="train:superbarbarian"]')).toBeDisabled();
  await expect(tile.locator('[data-action="boost-super:superbarbarian"]')).toBeVisible();
});

test('the achievements star total matches the campaign screen', async ({ page }) => {
  const total = await page.evaluate(async () => {
    const { NATIVE_CAMPAIGN } = await import('/src/game/native-campaign.ts');
    window.__game.hud.show('achievements');
    return NATIVE_CAMPAIGN.length * 3;
  });
  await expect(page.locator('.modal')).toContainText(`/ ${total}`);
  await expect(page.locator('.modal')).not.toContainText('/ 270');
});

test('troop shortcuts never pan the camera', async ({ page }) => {
  await page.evaluate(async () => {
    const { emptyArmy } = await import('/src/game/army.ts');
    const { TROOP_HOTKEYS } = await import('/src/game/data.ts');
    const m = window.__game.model;
    m.state.army = { ...emptyArmy(), swordsman: 5 };
    m.startCampaign(0);
    window.__keys = TROOP_HOTKEYS;
  });
  const keys: string[] = await page.evaluate(() => window.__keys);
  const camera = () =>
    page.evaluate(() => {
      const c = window.__game.scene.cameras.main;
      return [Math.round(c.scrollX), Math.round(c.scrollY)];
    });
  await page.mouse.click(5, 5);
  const before = await camera();
  for (const key of keys) {
    await page.keyboard.down(key);
    await page.waitForTimeout(150);
    await page.keyboard.up(key);
  }
  expect(await camera()).toEqual(before);
});

test('the system reduced-motion preference reaches the canvas, with an explicit override', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  expect(await page.evaluate(() => window.__game.model.reducedMotion)).toBe(true);
  await expect(page.locator('html')).toHaveClass(/reduce-motion/);
  // The saved switch is untouched: the preference belongs to the device.
  expect(await page.evaluate(() => window.__game.model.state.settings.reducedMotion)).toBe(false);
  await page.evaluate(() => window.__game.hud.show('settings'));
  const toggle = page.locator('[data-action="motion"]');
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await toggle.click();
  await expect(page.locator('[data-action="motion"]')).toHaveAttribute('aria-checked', 'false');
  expect(await page.evaluate(() => window.__game.model.reducedMotion)).toBe(false);
  await expect(page.locator('html')).toHaveClass(/full-motion/);
  // Following the device again once it stops asking.
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect.poll(() => page.evaluate(() => window.__game.model.systemReducedMotion)).toBe(false);
});
