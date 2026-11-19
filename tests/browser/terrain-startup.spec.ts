import { expect, test } from '@playwright/test';
import { developedSave } from '../fixtures/developed-village';

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const path = '/assets/environment/terrain-field-v4.webp';
const pattern = `**${path}`;
const key = 'crown-clan-save-v1';

test('slow critical terrain offers retry and completes without reloading', async ({
  page,
}, info) => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(pattern, async (route) => {
    await held;
    await route.continue();
  });
  let navigations = 0;
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) navigations++;
  });
  let waitingNavigation = 0;
  try {
    const request = page.waitForRequest((request) => new URL(request.url()).pathname === path);
    await page.goto('/?lazyart', { waitUntil: 'domcontentloaded' });
    await request;
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible({ timeout: 16000 });
    await expect(page.locator('#load-label')).toContainText('terrain is taking longer');
    await expect(page.locator('#loading')).toBeVisible();
    expect(await page.evaluate(() => window.__game?.scene.ready)).toBe(false);
    // Vite may reload once while discovering dependencies, before the scene starts.
    waitingNavigation = navigations;
    await page.screenshot({ path: info.outputPath('slow-terrain-retry.png') });
  } finally {
    release();
  }
  await expect(page.locator('#loading')).toBeHidden();
  await page.locator('[data-action="skip-tutorial"]').tap();
  await page.locator('[data-action="settings"]').tap();
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  expect(navigations).toBe(waitingNavigation);
});

test('failed terrain keeps the saved village intact until player retry', async ({ page }) => {
  const saved = developedSave();
  saved.tutorial = true;
  await page.addInitScript(
    ({ key, value }) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, value);
      const set = Storage.prototype.setItem;
      Storage.prototype.setItem = function (name, value) {
        if (this === localStorage && name === key && !window.__game?.scene.ready)
          set.call(sessionStorage, 'terrain-test-early-write', 'yes');
        set.call(this, name, value);
      };
    },
    { key, value: JSON.stringify(saved) },
  );
  await page.route(pattern, (route) => route.fulfill({ status: 503, body: 'Terrain unavailable' }));
  let navigations = 0;
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) navigations++;
  });
  await page.goto('/?lazyart', { waitUntil: 'domcontentloaded' });
  const retry = page.getByRole('button', { name: 'Try again' });
  await expect(retry).toBeVisible();
  await expect(page.locator('#load-label')).toContainText('terrain could not load');
  expect(await page.evaluate(() => window.__game?.scene.ready)).toBe(false);
  await expect(page.locator('#loading')).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), key)).toBe(JSON.stringify(saved));
  const failedNavigation = navigations;

  await page.unroute(pattern);
  await retry.tap();
  await expect(page.locator('#loading')).toBeHidden({ timeout: 20000 });
  const village = await page.evaluate(() => {
    const { model, scene } = window.__game;
    return {
      gold: model.state.gold,
      army: model.state.army,
      terrain: scene.textures.exists('terrain'),
    };
  });
  expect(village).toEqual({ gold: saved.gold, army: saved.army, terrain: true });
  expect(navigations).toBe(failedNavigation + 1);
  expect(await page.evaluate(() => sessionStorage.getItem('terrain-test-early-write'))).toBeNull();
  await page.locator('.attack-btn').tap();
  await page.locator('[data-action="attack:0"]').tap();
  await expect(page.locator('.prep-banner')).toBeVisible();
  await page.waitForFunction(() => !window.__game.scene.battleArtPending());
  const troop = page.locator('[data-action="troop:swordsman"]');
  await troop.tap();
  const spot = await page.evaluate(() => {
    const { model, scene, game } = window.__game;
    for (let x = 1.5; x < 44; x++)
      for (let y = 1.5; y < 44; y++) {
        if (model.deployBlocked(x, y)) continue;
        const p = scene.screenFor(x, y);
        if (
          p.y > innerHeight * 0.3 &&
          p.y < innerHeight * 0.6 &&
          document.elementFromPoint(p.x, p.y) === game.canvas
        )
          return p;
      }
    throw Error('No visible deployment point');
  });
  await page.touchscreen.tap(spot.x, spot.y);
  await expect(troop.locator('.troop-count')).toHaveText(`x${saved.army.swordsman - 1}`);
});
