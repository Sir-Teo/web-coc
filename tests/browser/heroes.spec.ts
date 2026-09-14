import { test, expect, type Page } from '@playwright/test';

async function boot(page: Page) {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.ready);
  await page.locator('[data-action="skip-tutorial"]').click();
}
async function unlock(page: Page, th = 7) {
  await page.evaluate((th) => {
    const m = window.__game.model;
    m.state.obstacles = []; // The developed hero fixture uses cleared ground.
    m.townhall!.level = th;
    m.beginBuild('herohall');
    if (!m.place(2, 26)) throw Error('Hero Hall fixture cannot be placed');
    m.tick(m.state.buildings.at(-1)!.upgradeEnd! + 1);
    m.cancel();
    m.state.dark = 10000;
    m.changed();
  }, th);
}
async function heroes(page: Page) {
  await page.locator('.train-add').click();
  await page.locator('[data-action="heroes"]').click();
}

test('Hero Hall, dark buildings, and King art load with accurate unlock labels', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('response', (r) => {
    if (r.status() >= 400 && r.url().includes('/assets/')) errors.push(r.url());
  });
  await boot(page);
  await heroes(page);
  await expect(page.locator('.hero-body')).toContainText('Town Hall 4');
  await page.locator('.hero-body [data-action="shop"]').click();
  await expect(page.locator('.shop-tile').filter({ hasText: 'Hero Hall' })).toContainText(
    'Town Hall 4',
  );
  await expect(page.locator('.shop-tile').filter({ hasText: 'Dark Elixir Drill' })).toContainText(
    'Town Hall 7',
  );
  expect(
    await page.evaluate(() =>
      ['king', 'herohall', 'darkdrill', 'darkstorage'].every((k) =>
        window.__game.scene.textures.exists(k),
      ),
    ),
  ).toBe(true);
  await page.locator('[data-action="close-drawer"]').click();
  await page.locator('.train-add').click();
  await page.locator('[data-action="progression"]').click();
  await expect(page.locator('.progression-tier')).toHaveCount(9);
  await expect(page.locator('.progression-tier.current')).toContainText('Town Hall 2');
  const th5 = page
    .locator('.progression-tier')
    .filter({ has: page.getByRole('heading', { name: 'Town Hall 5', exact: true }) });
  await expect(
    th5.locator('.progression-unlock').filter({ hasText: /^Wall/ }).locator('img'),
  ).toHaveAttribute('src', /walls-v1\/level-5.webp$/);
  await expect(
    th5
      .locator('.progression-unlock')
      .filter({ hasText: /^Mortar/ })
      .locator('img'),
  ).toHaveAttribute('src', /mortar-native\/level-3.png$/);
  await expect(
    th5
      .locator('.progression-unlock')
      .filter({ hasText: /^Archer Tower/ })
      .locator('img'),
  ).toHaveAttribute('src', /tier3\/archertower.webp$/);
  await page.screenshot({
    animations: 'disabled',
    path: 'output/playtest/progression-desktop.png',
  });
  expect(errors).toEqual([]);
});

test('hero upgrade charges once, persists through reload, and finishes through the UI', async ({
  page,
}) => {
  await boot(page);
  await unlock(page);
  await heroes(page);
  await expect(page.locator('.hero-overview')).toContainText('Level 1');
  await page.screenshot({ animations: 'disabled', path: 'output/playtest/heroes-desktop.png' });
  await page.locator('[data-action="hero-upgrade"]').click();
  await expect(page.locator('[data-hero-timer]')).toBeVisible();
  expect(await page.evaluate(() => window.__game.model.state.dark)).toBe(5000);
  await page.waitForTimeout(400);
  await page.reload();
  await page.waitForFunction(() => window.__game?.scene.ready);
  await heroes(page);
  await expect(page.locator('[data-hero-timer]')).toBeVisible();
  await page.locator('[data-action="hero-finish"]').click();
  await expect(page.locator('.hero-overview')).toContainText('Level 2');
  expect(await page.evaluate(() => window.__game.model.heroReady)).toBe(true);
});

test('deploy King by pointer, activate with H, and start a fresh practice from the result', async ({
  page,
}) => {
  await boot(page);
  await unlock(page);
  await page.locator('.train-add').click();
  await page.locator('[data-action="clear-army"]').click();
  await page.locator('[data-action="practice"]').click();
  await page.getByRole('button', { name: 'Barbarian King, Deploy King' }).click();
  const point = await page.evaluate(() => window.__game.scene.screenFor(2.5, 13.5));
  await page.mouse.click(point.x, point.y);
  await expect(
    page.getByRole('button', { name: 'Barbarian King, Activate ability' }),
  ).toBeEnabled();
  await page.keyboard.press('h');
  await expect(page.getByRole('button', { name: 'Barbarian King, Ability used' })).toBeDisabled();
  await expect
    .poll(() =>
      page.evaluate(() => window.__game.model.battle!.units.filter((u) => u.summoned).length),
    )
    .toBe(8);
  await page.screenshot({
    animations: 'disabled',
    path: 'output/playtest/hero-battle-desktop.png',
  });
  await page.locator('[data-action="surrender"]').click();
  await page.locator('[data-action="end"]').click();
  await page.locator('[data-action="raid-again"]').click();
  await expect(page.getByRole('button', { name: 'Barbarian King, Deploy King' })).toBeEnabled();
  expect(await page.evaluate(() => window.__game.model.state.king!.level)).toBe(1);
});

test('hero and progression panels fit phone portrait and landscape with reachable controls', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await boot(page);
  await unlock(page);
  await heroes(page);
  // A queued village render or viewport resize can replace the dialog during scrolling.
  await expect(async () => {
    await page.locator('[data-action="hero-upgrade"]').scrollIntoViewIfNeeded();
    await expect(page.locator('[data-action="hero-upgrade"]')).toBeInViewport();
  }).toPass({ timeout: 5000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ animations: 'disabled', path: 'output/playtest/heroes-mobile.png' });
  await page.setViewportSize({ width: 844, height: 390 });
  // A queued village render or viewport resize can replace the dialog during scrolling.
  await expect(async () => {
    await page.locator('[data-action="hero-upgrade"]').scrollIntoViewIfNeeded();
    await expect(page.locator('[data-action="hero-upgrade"]')).toBeInViewport();
  }).toPass({ timeout: 5000 });
  await page.locator('[data-action="hero-upgrade"]').click();
  await expect(page.locator('[data-hero-timer]')).toBeVisible();
  await page.screenshot({ animations: 'disabled', path: 'output/playtest/heroes-landscape.png' });
  await page.locator('[data-action="close"]').click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('[data-action="heroes"]')).toBeFocused();
  await page.locator('[data-action="progression"]').click();
  await expect(page.locator('.progression-tier')).toHaveCount(9);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ animations: 'disabled', path: 'output/playtest/progression-mobile.png' });
});

test('dark elixir collection updates its own HUD counter and survives reload', async ({ page }) => {
  await boot(page);
  await unlock(page);
  await page.evaluate(() => {
    const m = window.__game.model;
    m.state.dark = 0;
    m.state.elixir = 1000000; // Fund the native storage's 250,000 Elixir construction price.
    for (const kind of ['darkstorage', 'darkdrill'] as const) {
      let point: { x: number; y: number } | undefined;
      for (let y = 2; y < 23 && !point; y++)
        for (let x = 2; x < 23 && !point; x++) if (m.canPlace(kind, x, y)) point = { x, y };
      if (!point) throw Error('No space for dark resource fixture');
      m.beginBuild(kind);
      if (!m.place(point.x, point.y)) throw Error('Cannot build dark resource fixture');
      m.tick(m.state.buildings.at(-1)!.upgradeEnd! + 1);
    }
    m.cancel();
    m.tick(m.clock + 3600000);
    m.changed();
  });
  await expect(page.locator('.resource-bar.dark')).not.toHaveClass(/full/);
  await page.locator('.collect-btn').click();
  await expect(page.locator('.resource-bar [data-resource="dark"]')).toHaveText('360');
  expect(await page.evaluate(() => window.__game.model.resourceCap('dark'))).toBe(10000);
  await page.screenshot({
    animations: 'disabled',
    path: 'output/playtest/dark-elixir-village.png',
  });
  await page.waitForTimeout(400);
  await page.reload();
  await page.waitForFunction(() => window.__game?.scene.ready);
  await expect(page.locator('.resource-bar [data-resource="dark"]')).toHaveText('360');
});
