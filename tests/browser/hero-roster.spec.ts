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

test('every deployed hero bakes its own atlas, never the King', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('response', (r) => {
    if (r.status() >= 400 && r.url().includes('/assets/')) errors.push(r.url());
  });
  await boot(page);
  await develop(page);
  await heroes(page);
  await page.locator('[data-action="practice"]').click();
  // Atlases prefetch while scouting, before anything deploys.
  await expect
    .poll(() => page.evaluate(() => (window as any).__game.scene.heroNativePresentation.packs.size))
    .toBeGreaterThan(0);
  for (const kind of ['king', 'queen', 'prince']) {
    await page.locator(`[data-action="hero-select:${kind}"]`).click();
    await page.evaluate((kind) => {
      const m = (window as any).__game.model;
      outer: for (let y = 2; y < 46; y += 1)
        for (let x = 2; x < 46; x += 1) {
          if (!m.deployBlocked(x, y)) {
            m.deploy(x, y);
            break outer;
          }
        }
    }, kind);
  }
  await page.waitForTimeout(3000);
  const seen = await page.evaluate(() => {
    const { scene, model: m } = window.__game;
    const baked: Record<string, string> = {};
    for (const o of scene.children.list) {
      const id = o.getData?.('nativeHero');
      if (id !== undefined && o.visible) baked[id] = o.texture.key;
    }
    const units = m.battle.units
      .filter((u: any) => u.hero)
      .map((u: any) => ({ id: u.id, hero: u.hero }));
    const fallbacks = units.map((u: any) => {
      const s = scene.unitSprites.get(u.id);
      return { hero: u.hero, tex: s?.texture.key, visible: s?.visible };
    });
    return { baked, units, fallbacks };
  });
  for (const u of seen.units) {
    const tex = (seen.baked as Record<string, string>)[u.id];
    expect(tex, `${u.hero} baked texture`).toMatch(new RegExp(`^baked:heroes-native/${u.hero}/`));
  }
  // Baked sprites take over; every fallback keeps its own face anyway.
  for (const f of seen.fallbacks as { hero: string; tex: string }[]) {
    expect(f.tex, `${f.hero} fallback`).not.toBe('king-front-left');
  }
  expect(errors).toEqual([]);
});

for (const lineup of [
  ['king', 'queen', 'prince'],
  ['warden', 'champion', 'duke'],
])
  test(`complete hero lineup: ${lineup.join(', ')}`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (e) => {
      if (e.type() === 'error') errors.push(e.text());
    });
    page.on('response', (r) => {
      if (r.status() >= 400 && r.url().includes('/assets/')) errors.push(r.url());
    });
    await boot(page);
    await page.evaluate(async (lineup) => {
      const { makeBuilding } = await import('/src/game/model.ts');
      const { HERO_KINDS, heroDefaultItems } = await import('/src/game/native-hero-data.ts');
      const { emptyArmy } = await import('/src/game/army.ts');
      const m = window.__game.model;
      m.state.obstacles = [];
      m.state.buildings = [
        makeBuilding(1, 'townhall', 22, 22, 18),
        makeBuilding(2, 'herohall', 15, 15, 12),
      ];
      m.state.king = { level: 20 };
      m.state.heroes = Object.fromEntries(
        HERO_KINDS.filter((k) => k !== 'king').map((k) => [k, { level: 20 }]),
      );
      m.state.heroLineup = lineup;
      m.state.gear = {
        levels: Object.fromEntries(HERO_KINDS.flatMap(heroDefaultItems).map((s) => [s, 1])),
        loadouts: Object.fromEntries(HERO_KINDS.map((k) => [k, heroDefaultItems(k)])),
      };
      m.state.army = { ...emptyArmy(), giant: 1 };
      m.state.nextId = 5000;
      m.startBattle(0, true);
      m.battle.defenders = [];
      m.changed();
    }, lineup);
    for (const [i, kind] of lineup.entries()) {
      await page.locator(`[data-action="hero-select:${kind}"]`).click();
      expect(await page.evaluate((i) => window.__game.model.deploy(10 + i * 2, 8), i)).toBe(true);
    }
    await expect
      .poll(
        () =>
          page.evaluate((lineup) => {
            const { scene, model: m } = window.__game;
            return lineup.every((kind) => {
              const hero = m.battle.nativeHeroes.find((h) => h.kind === kind);
              return scene.children.list.some(
                (o) =>
                  o.getData?.('nativeHero') === hero.unitId &&
                  o.visible &&
                  o.texture.key.startsWith(`baked:heroes-native/${kind}/`) &&
                  o.texture.source[0].image.src.includes('/assets/characters/'),
              );
            });
          }, lineup),
        { timeout: 15000 },
      )
      .toBe(true);
    for (const kind of lineup) {
      await page.locator(`[data-action="hero-select:${kind}"]`).click();
      expect(
        await page.evaluate((kind) => window.__game.model.battleHero(kind).abilityUsed, kind),
      ).toBe(true);
    }
    await page.screenshot({ path: `output/playtest/heroes-${lineup[0]}-desktop.png` });
    await page.setViewportSize({ width: 390, height: 844 });
    for (const kind of lineup)
      await expect(page.locator(`[data-action="hero-select:${kind}"]`)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: `output/playtest/heroes-${lineup[0]}-mobile.png` });
    await page.evaluate(() => {
      window.__game.model.state.settings.reducedMotion = true;
      window.__game.model.changed();
    });
    await expect
      .poll(() =>
        page.evaluate((lineup) => {
          const { scene, model: m } = window.__game;
          return lineup.every((kind) => {
            const hero = m.battle.nativeHeroes.find((h) => h.kind === kind);
            return scene.children.list.some(
              (o) => o.getData?.('nativeHero') === hero.unitId && o.frame.cutX === 0,
            );
          });
        }, lineup),
      )
      .toBe(true);
    expect(errors).toEqual([]);
  });
