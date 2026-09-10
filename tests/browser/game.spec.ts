import { test, expect } from '@playwright/test';
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.ready);
  await page.evaluate(() => {
    window.__game.audio?.enabled && (window.__game.audio.enabled = false);
  });
});
test('boots with a complete village and no browser errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await expect(page.getByText('Oakheart', { exact: true })).toBeVisible();
  await expect(page.locator('canvas')).toBeVisible();
  await page.waitForTimeout(4000);
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'output/playtest/village-desktop.png' });
  expect(errors).toEqual([]);
  expect(
    await page.evaluate(() => JSON.parse(window.render_game_to_text()).buildings.length),
  ).toBeGreaterThan(40);
});
test('collects, upgrades, finishes and persists through reload', async ({ page }) => {
  const before = await page.evaluate(() => window.__game.model.state.gold);
  await page.locator('[data-action="collect"]').last().click();
  expect(await page.evaluate(() => window.__game.model.state.gold)).toBeGreaterThan(before);
  const point = await page.evaluate(() => {
    const { scene, model } = window.__game;
    const b = model.state.buildings.find((b) => b.kind === 'townhall');
    const p = scene.screenFor(b.x + 2, b.y + 2);
    return { x: p.x, y: p.y - 35 };
  });
  await page.mouse.click(point.x, point.y);
  await expect(page.locator('.building-context h2')).toHaveText('Town Hall');
  await page.locator('[data-action^="upgrade:"]').click();
  await expect(page.locator('[data-action^="finish:"]')).toBeVisible();
  await page.locator('[data-action^="finish:"]').click();
  await expect(page.locator('.max-level')).toBeVisible();
  await page.waitForTimeout(1200);
  await page.reload();
  await page.waitForFunction(() => window.__game?.scene.ready);
  expect(
    await page.evaluate(
      () => window.__game.model.state.buildings.find((b) => b.kind === 'townhall').level,
    ),
  ).toBe(3);
});
test('shop places a building and cancel leaves the village unchanged', async ({ page }) => {
  await page.locator('[data-action="shop"]').last().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.locator('[data-action="tab:Defenses"]').click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'output/playtest/shop-desktop.png' });
  await page.locator('[data-action="build:cannon"]').click();
  await expect(page.locator('.placement-banner')).toBeVisible();
  const before = await page.evaluate(() => window.__game.model.state.buildings.length);
  const p = await page.evaluate(() => window.__game.scene.screenFor(2.5, 20.5));
  await page.mouse.click(p.x, p.y);
  expect(await page.evaluate(() => window.__game.model.state.buildings.length)).toBe(before + 1);
  await page.locator('[data-action="cancel"]').click();
  await page.locator('[data-action="shop"]').last().click();
  await page.locator('[data-action="build:wall"]').click();
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => window.__game.model.state.buildings.length)).toBe(before + 1);
});
test('trains troops through the queue', async ({ page }) => {
  await page.locator('.train-add').click();
  await page.locator('[data-action="train:archer"]').click();
  await expect(page.locator('.queue-items>div')).toHaveCount(1);
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'output/playtest/army-desktop.png' });
  await page.waitForTimeout(5000);
  expect(await page.evaluate(() => window.__game.model.state.army.archer)).toBe(13);
  await expect(page.locator('.queue-items>div')).toHaveCount(0);
});
test('plays an actual battle through results and unlocks the next village', async ({ page }) => {
  await page.locator('.attack-btn').click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'output/playtest/campaign-desktop.png' });
  await page.locator('[data-action="attack:0"]').click();
  await expect(page.locator('.battle-enemy h2')).toHaveText('Goblin Outpost');
  await page.locator('[data-action="troop:giant"]').click();
  const p = await page.evaluate(() => window.__game.scene.screenFor(4, 11));
  await page.mouse.click(p.x, p.y);
  expect(await page.evaluate(() => window.__game.model.battle.units.length)).toBe(1);
  await page.evaluate(() => {
    const m = window.__game.model;
    for (const k of ['giant', 'swordsman', 'archer', 'wizard']) {
      m.activeTroop = k;
      let i = 0;
      while (m.battle.remaining[k] > 0) {
        m.deploy(4 + (i % 3) * 0.3, 10 + (i % 4) * 0.5);
        i++;
      }
    }
    window.advanceTime(4000);
  });
  await page.waitForTimeout(100);
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'output/playtest/battle-desktop.png' });
  await page.evaluate(() => window.advanceTime(180000));
  await expect(page.locator('#result-title')).toHaveText('Victory!');
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'output/playtest/victory-desktop.png' });
  await page.locator('[data-action="home"]').click();
  await page.locator('.attack-btn').click();
  await expect(page.locator('[data-action="attack:1"]')).toBeEnabled();
});
test('settings switches and modal keyboard focus work', async ({ page }) => {
  await page.locator('[data-action="settings"]').click();
  const sound = page.getByRole('switch', { name: 'Sound effects' });
  await sound.click();
  await expect(sound).toHaveAttribute('aria-checked', 'false');
  await page.getByRole('switch', { name: 'Reduced motion' }).click();
  await expect(page.locator('html')).toHaveClass(/reduce-motion/);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('[data-action="settings"]')).toBeFocused();
});
test('mobile portrait preserves playfield and usable menus', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(4500);
  await page.screenshot({ path: 'output/playtest/village-mobile.png' });
  await expect(page.locator('.attack-btn')).toBeVisible();
  await page.locator('.shop-btn').click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'output/playtest/shop-mobile.png' });
  await expect(page.locator('.shop-grid')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.keyboard.press('Escape');
  await page.locator('.train-add').click();
  await expect(page.locator('.training-card')).toHaveCount(4);
});
test('camera responds to zoom and drag while dialogs block the playfield', async ({ page }) => {
  const before = await page.evaluate(() => window.__game.scene.cameras.main.zoom);
  await page.locator('[data-action="zoom-in"]').click();
  expect(await page.evaluate(() => window.__game.scene.cameras.main.zoom)).toBeGreaterThan(before);
  await page.mouse.move(700, 500);
  await page.mouse.down();
  await page.mouse.move(820, 520, { steps: 10 });
  await page.mouse.up();
  await page.locator('[data-action="recenter"]').click();
  await page.locator('.shop-btn').click();
  expect(await page.evaluate(() => window.__game.scene.uiBlocked)).toBe(true);
});

test('open dialogs remain mounted through passive economy ticks', async ({ page }) => {
  await page.locator('.shop-btn').click();
  await page.evaluate(() => {
    window.__dialogNode = document.querySelector('[role="dialog"]');
  });
  await page.waitForTimeout(2200);
  expect(
    await page.evaluate(() => window.__dialogNode === document.querySelector('[role="dialog"]')),
  ).toBe(true);
});

test('exported villages restore through the file import control', async ({ page }) => {
  await page.locator('[data-action="settings"]').click();
  const expected = await page.evaluate(() => structuredClone(window.__game.model.state));
  const download = page.waitForEvent('download');
  await page.locator('[data-action="export"]').click();
  expect((await download).suggestedFilename()).toBe('crown-and-clan-village.json');
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    window.__game.model.state.gold = 123;
    window.__game.model.changed();
  });
  await page
    .locator('#import-file')
    .setInputFiles({
      name: 'village.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(expected)),
    });
  await expect(page.locator('#toast')).toContainText('Village restored');
  expect(await page.evaluate(() => window.__game.model.state.gold)).toBe(expected.gold);
  await page.locator('[data-action="settings"]').click();
  await page
    .locator('#import-file')
    .setInputFiles({
      name: 'broken.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{broken'),
    });
  await expect(page.locator('#toast')).toContainText('not a valid');
  expect(await page.evaluate(() => window.__game.model.state.gold)).toBe(expected.gold);
});

test('touch input selects buildings and opens menus', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  await page.goto('http://localhost:5173');
  await page.waitForFunction(() => window.__game?.scene.ready);
  await page.waitForTimeout(4500);
  const point = await page.evaluate(() => {
    const { model, scene } = window.__game;
    const b = model.state.buildings.find((v) => v.kind === 'townhall');
    const p = scene.screenFor(b.x + 2, b.y + 2);
    return { x: p.x, y: p.y - 30 };
  });
  await page.touchscreen.tap(point.x, point.y);
  await expect(page.locator('.building-context h2')).toHaveText('Town Hall');
  await page.screenshot({ path: 'output/playtest/touch-building.png' });
  await page.locator('[data-action="cancel"]').tap();
  await page.locator('.shop-btn').tap();
  await expect(page.getByRole('dialog')).toBeVisible();
  await context.close();
});

test('landscape phone keeps primary controls usable', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(800);
  await expect(page.locator('.attack-btn')).toBeVisible();
  await expect(page.locator('.shop-btn')).toBeVisible();
  await page.screenshot({ path: 'output/playtest/village-landscape.png' });
  await page.locator('.shop-btn').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  const bounds = await page.getByRole('dialog').boundingBox();
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(391);
});
