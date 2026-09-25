import { test, expect } from '@playwright/test';
test('baked heroes, pets and Guardians render without missing assets', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('response', (r) => {
    if (r.status() >= 400 && r.url().includes('/assets/')) errors.push(r.url());
  });
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  await page.evaluate(async () => {
    const { makeBuilding } = await import('/src/game/model.ts');
    const { HERO_KINDS, heroDefaultItems } = await import('/src/game/native-hero-data.ts');
    const { emptyArmy, emptySpells } = await import('/src/game/army.ts');
    const m = window.__game.model;
    m.state.obstacles = [];
    m.state.buildings = [
      makeBuilding(1, 'townhall', 22, 22, 18),
      makeBuilding(2, 'herohall', 15, 15, 12),
      makeBuilding(3, 'cannon', 25, 18, 10),
    ];
    m.state.king = { level: 20 };
    m.state.heroes = Object.fromEntries(
      HERO_KINDS.filter((k) => k !== 'king').map((k) => [k, { level: 20 }]),
    );
    m.state.heroLineup = ['king', 'queen', 'warden', 'duke'];
    m.state.gear = {
      levels: Object.fromEntries(HERO_KINDS.flatMap((k) => heroDefaultItems(k)).map((k) => [k, 1])),
      loadouts: Object.fromEntries(HERO_KINDS.map((k) => [k, heroDefaultItems(k)])),
    };
    m.state.pets = {
      levels: { lassi: 1, unicorn: 1, owl: 1, yak: 1 },
      assigned: { king: 'lassi', queen: 'unicorn', warden: 'owl', duke: 'yak' },
    };
    m.state.army = { ...emptyArmy(), giant: 1 };
    m.state.spells = emptySpells();
    m.state.nextId = 5000;
    m.startBattle(0, true);
    for (const [i, k] of ['king', 'queen', 'warden', 'duke'].entries())
      m.deployNativeHero(k, 10 + i * 2, 8);
    m.changed();
  });
  await page.waitForFunction(
    () =>
      window.__game.scene.children.list.filter((o) => o.getData?.('nativeHero') !== undefined)
        .length >= 8,
    { timeout: 20000 },
  );
  await page.screenshot({ path: 'output/playtest/native-hero-art-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'output/playtest/native-hero-art-mobile.png' });
  expect(errors).toEqual([]);
});

test('Workshop and super boost controls prepare their new troops', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error' || e.text().includes('has no frame')) errors.push(e.text());
  });
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  await page.evaluate(async () => {
    const { makeBuilding } = await import('/src/game/model.ts');
    const m = window.__game.model;
    m.townhall.level = 12;
    m.state.dark = 50000;
    m.state.buildings.push(makeBuilding(900, 'workshop', 30, 30, 8));
    m.state.troopLevels ??= {};
    m.state.troopLevels.swordsman = 7;
    m.changed();
  });
  await page.locator('.train-add').click();
  await page.locator('[data-action="train:wallwrecker"]').click();
  await expect.poll(() => page.evaluate(() => window.__game.model.state.army.wallwrecker)).toBe(1);
  await page.locator('[data-action="boost-super:superbarbarian"]').click();
  await page.locator('[data-action="train:superbarbarian"]').click();
  await expect
    .poll(() => page.evaluate(() => window.__game.model.state.army.superbarbarian))
    .toBe(1);
  expect(await page.evaluate(() => window.__game.model.state.dark)).toBe(25000);
  await page.locator('[data-action="close-drawer"]').click();
  await page.waitForFunction(() => window.__game.scene.campTime > 2);
  expect(errors).toEqual([]);
});
