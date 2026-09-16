import { test, expect, type Page } from '@playwright/test';

async function boot(page: Page) {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.ready);
  await page.locator('[data-action="skip-tutorial"]').click();
}

/** Developed village with Hero Hall 5, Pet House 4 and Blacksmith 5; no build timers involved. */
async function develop(page: Page) {
  await page.evaluate(() => {
    const m = window.__game.model;
    m.state.obstacles = [];
    m.townhall!.level = 15;
    m.state.gold = 1e9;
    m.state.elixir = 1e9;
    m.state.dark = 1e7;
    m.state.gems = 1e5;
    m.state.ores = { shiny: 5000, glowy: 500, starry: 100 };
    const add = (id: number, kind: string, x: number, y: number, level: number) => {
      if (!m.state.buildings.some((b: any) => b.kind === kind))
        m.state.buildings.push({
          id,
          kind,
          x,
          y,
          level,
          hp: 100000,
          maxHp: 100000,
          stored: 0,
          cooldown: 0,
        });
    };
    add(900, 'herohall', 30, 20, 5);
    add(901, 'pethouse', 34, 20, 4);
    add(902, 'blacksmith', 38, 20, 5);
    m.state.nextId = Math.max(m.state.nextId, 903);
    m.tick(Date.now() + 1000);
    m.changed();
  });
}

async function heroes(page: Page) {
  await page.locator('.train-add').click();
  await page.locator('[data-action="heroes"]').click();
}

test('roster lists every hero with gates, upgrades and lineup swaps', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('response', (r) => {
    if (r.status() >= 400 && r.url().includes('/assets/')) errors.push(r.url());
  });
  await boot(page);
  await develop(page);
  await heroes(page);
  for (const name of [
    'Barbarian King',
    'Archer Queen',
    'Minion Prince',
    'Grand Warden',
    'Royal Champion',
    'Dragon Duke',
  ])
    await expect(page.locator('.hero-body')).toContainText(name);
  // Locked heroes name their own requirement.
  await expect(page.locator('[data-hero="champion"]')).toContainText('Town Hall 13');
  // A full lineup swaps rather than overflows.
  expect(await page.evaluate(() => window.__game.model.heroLineup)).toEqual([
    'king',
    'queen',
    'prince',
  ]);
  await page.locator('[data-action="hero-lineup:warden"]').click();
  expect(await page.evaluate(() => window.__game.model.heroLineup)).toEqual([
    'king',
    'queen',
    'warden',
  ]);
  // Native upgrade with a builder and dark elixir.
  await page.locator('[data-action="hero-upgrade:queen"]').click();
  await expect(page.locator('[data-hero-timer="queen"]')).toBeVisible();
  await page.locator('[data-action="hero-finish:queen"]').click();
  expect(await page.evaluate(() => window.__game.model.heroProgress('queen').level)).toBe(2);
  expect(errors).toEqual([]);
});

test('pets research once, finish with gems, assign and move between heroes', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('response', (r) => {
    if (r.status() >= 400 && r.url().includes('/assets/')) errors.push(r.url());
  });
  await boot(page);
  await develop(page);
  await heroes(page);
  await page.locator('[data-action="pets"]').first().click();
  await expect(page.locator('.modal-body')).toContainText('L.A.S.S.I');
  await expect(page.locator('[data-pet="yak"]')).toContainText('Mighty Yak');
  await page.locator('[data-action="pet-research:lassi"]').click();
  await expect(page.locator('[data-pet-timer]')).toBeVisible();
  await page.locator('[data-action="pet-finish"]').click();
  expect(await page.evaluate(() => window.__game.model.petProgress.levels.lassi)).toBe(2);
  await page.locator('[data-action="pet-assign:lassi,king"]').click();
  expect(await page.evaluate(() => window.__game.model.petProgress.assigned)).toEqual({
    king: 'lassi',
  });
  await page.locator('[data-action="pet-assign:lassi,queen"]').click();
  expect(await page.evaluate(() => window.__game.model.petProgress.assigned)).toEqual({
    queen: 'lassi',
  });
  await page.locator('[data-action="pet-assign:lassi,none"]').click();
  expect(await page.evaluate(() => window.__game.model.petProgress.assigned)).toEqual({});
  expect(errors).toEqual([]);
});

test('native forge equips, upgrades with ore or gems, and sells epics', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('response', (r) => {
    if (r.status() >= 400 && r.url().includes('/assets/')) errors.push(r.url());
  });
  await boot(page);
  await develop(page);
  await page.evaluate(() => window.__game.hud.action('blacksmith'));
  await page.locator('[data-action="blacksmith-hero:queen"]').click();
  await expect(page.locator('.blacksmith-body')).toContainText('Healer Puppet');
  await page.locator('.equipment-catalog [data-action="native-item:healer-puppet"]').click();
  await page.locator('[data-action="native-equip:healer-puppet,1"]').click();
  expect(await page.evaluate(() => window.__game.model.gear.loadouts.queen)).toEqual([
    'archer-puppet',
    'healer-puppet',
  ]);
  const before = await page.evaluate(() => window.__game.model.gear.levels['archer-puppet']);
  await page.locator('.equipment-catalog [data-action="native-item:archer-puppet"]').click();
  await page.locator(`[data-action="native-upgrade:archer-puppet,${before}"]`).click();
  expect(await page.evaluate(() => window.__game.model.gear.levels['archer-puppet'])).toBe(
    before + 1,
  );
  // With no ore the forge offers a gem shortfall instead of failing silently.
  await page.evaluate(() => {
    window.__game.model.state.ores = { shiny: 0, glowy: 0, starry: 0 };
  });
  await page.locator(`[data-action="native-upgrade:archer-puppet,${before + 1}"]`).click();
  await expect(page.locator('[data-action="native-ore-buy"]')).toBeVisible();
  const gems = await page.evaluate(() => window.__game.model.state.gems);
  await page.locator('[data-action="native-ore-buy"]').click();
  expect(await page.evaluate(() => window.__game.model.state.gems)).toBeLessThan(gems);
  await page.locator('.equipment-catalog [data-action="native-item:frozen-arrow"]').click();
  await page.locator('[data-action="epic-buy:frozen-arrow"]').click();
  expect(await page.evaluate(() => window.__game.model.gear.levels['frozen-arrow'])).toBe(1);
  // The original King view is untouched.
  await page.locator('[data-action="blacksmith-hero:legacy"]').click();
  await expect(page.locator('.blacksmith-body')).toContainText('BARBARIAN KING');
  expect(errors).toEqual([]);
});

test('each lineup hero deploys and activates from its own card', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await boot(page);
  await develop(page);
  await heroes(page);
  await page.locator('[data-action="practice"]').click();
  await expect(page.getByRole('button', { name: 'Barbarian King, Deploy King' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Archer Queen, Deploy Queen' })).toBeEnabled();
  // The Queen fights under her own card, independent of the King.
  await page.getByRole('button', { name: 'Archer Queen, Deploy Queen' }).click();
  let deployed = false;
  for (const [x, y] of [480, 400, 320, 240, 560].flatMap((yy) =>
    [720, 560, 880, 400, 1040, 240, 1200].map((xx) => [xx, yy]),
  )) {
    if (
      await page.evaluate(
        ([px, py]) => document.elementFromPoint(px, py)?.tagName === 'CANVAS',
        [x, y],
      )
    ) {
      await page.mouse.click(x, y);
      await page.waitForTimeout(60);
      deployed = await page.evaluate(
        () =>
          window.__game.model.battle.nativeHeroes.find((h: any) => h.kind === 'queen').unitId !==
          null,
      );
      if (deployed) break;
    }
  }
  expect(deployed).toBe(true);
  await page.getByRole('button', { name: 'Archer Queen, Activate ability' }).click();
  expect(
    await page.evaluate(
      () =>
        window.__game.model.battle.nativeHeroes.find((h: any) => h.kind === 'queen').abilityUsed,
    ),
  ).toBe(true);
  // H cycles without errors while other heroes still await orders.
  await page.keyboard.press('h');
  await page.waitForTimeout(300);
  expect(errors).toEqual([]);
});
