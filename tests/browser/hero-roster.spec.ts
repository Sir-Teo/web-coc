import { test, expect, type Page } from '@playwright/test';

async function boot(page: Page) {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
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

test('Hero Hall confirms a cancellation and refunds the selected upgrade', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await boot(page);
  await develop(page);
  await heroes(page);
  const card = page.locator('[data-hero="warden"]');
  const before = await page.evaluate(() => {
    const m = window.__game.model;
    return { elixir: m.state.elixir, busy: m.busy, level: m.heroProgress('warden').level };
  });

  await card.locator('[data-action="hero-upgrade:warden"]').click();
  await card.getByRole('button', { name: 'Cancel upgrade' }).click();
  await expect(card).toContainText('recover 500,000 elixir');
  await card.getByRole('button', { name: 'Keep upgrading' }).click();
  await expect(card.locator('[data-hero-timer="warden"]')).toBeVisible();
  await card.getByRole('button', { name: 'Cancel upgrade' }).click();
  await page.screenshot({ path: 'output/playtest/hero-upgrade-cancel.png' });
  await card.getByRole('button', { name: 'Confirm cancellation' }).click();
  await expect(card.locator('[data-hero-timer="warden"]')).toHaveCount(0);

  const after = await page.evaluate(() => {
    const m = window.__game.model;
    return { elixir: m.state.elixir, busy: m.busy, level: m.heroProgress('warden').level };
  });
  expect(after).toEqual({ ...before, elixir: before.elixir - 500_000 });
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

test.describe('phone attack preparation', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('Warden mode persists from preparation to a phone-sized attack', async ({ page }) => {
    await boot(page);
    await develop(page);
    await heroes(page);
    const warden = page.locator('[data-hero="warden"]');
    await warden.locator('[data-action="hero-lineup:warden"]').tap();
    const mode = warden.locator('[data-action="warden-mode"]');
    await expect(mode).toHaveText('Ground mode');
    await mode.tap();
    await expect(mode).toHaveText('Air mode');
    await page.screenshot({ path: 'output/playtest/warden-air-preparation-phone.png' });
    await page.reload();
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await heroes(page);
    await expect(mode).toHaveText('Air mode');
    await page.locator('.modal [data-action="close"]').tap();
    const closeDrawer = page.locator('[data-action="close-drawer"]');
    if (await closeDrawer.isVisible()) await closeDrawer.tap();
    await page.locator('.attack-btn').tap();
    await page.locator('[data-action="attack:0"]').tap();
    await expect(page.locator('[data-action="hero-select:warden"]')).toBeVisible();
    const deployed = await page.evaluate(() => {
      const { model } = window.__game;
      if (!model.deployNativeHero('warden', 2, 13)) throw Error('Warden deployment failed');
      const unit = model.battle!.units[0];
      return { kind: unit.kind, range: model.unitStats(unit).range };
    });
    expect(deployed).toEqual({ kind: 'grandwardenair', range: 6.5 });
    await page.screenshot({ path: 'output/playtest/warden-air-battle-phone.png' });
  });

  test('an assigned pet sits out an attack during research and returns after completion', async ({
    page,
  }) => {
    await boot(page);
    await develop(page);
    await heroes(page);
    await page.locator('[data-action="pets"]').first().tap();
    await page.locator('[data-action="pet-assign:lassi,king"]').tap();
    await expect(page.locator('[data-pet="diggy"]')).toContainText('Requires Pet House 6');
    await expect(page.locator('[data-action="pet-research:diggy"]')).toHaveCount(0);
    const quote = await page.evaluate(async () => {
      const { petLevelCap, petUpgradeQuote } = await import('/src/game/native-hero-data.ts');
      const { model: m } = window.__game;
      m.state.pets!.levels.lassi = petLevelCap('lassi', m.petHouse!.level);
      m.changed();
      return petUpgradeQuote('lassi', 1)!;
    });
    expect(quote.resource).toBe('dark');
    const research = page.locator('[data-action="pet-research:lassi"]');
    await expect(page.locator('[data-pet="lassi"]')).toContainText('Upgrade the Pet House');
    await expect(research).toHaveCount(0);
    const dark = await page.evaluate((cost) => {
      const { model: m } = window.__game;
      const dark = m.state.dark;
      m.state.pets!.levels.lassi = 1;
      m.state.dark = cost - 1;
      m.changed();
      return dark;
    }, quote.cost);
    await expect(research).toBeDisabled();
    await page.evaluate((dark) => {
      const { model: m } = window.__game;
      m.state.dark = dark;
      m.changed();
    }, dark);
    await expect(research).toBeEnabled();
    await expect(research).toHaveAccessibleName(
      `Research to level 2 for ${quote.cost.toLocaleString()} Dark Elixir`,
    );
    const balance = () =>
      page.evaluate(() => {
        const { model: m } = window.__game;
        return { dark: m.state.dark, elixir: m.state.elixir, gems: m.state.gems, busy: m.busy };
      });
    const before = await balance();
    await research.tap();
    await expect(page.locator('[data-pet-timer]')).toBeVisible();
    const pending = await page.evaluate(() => window.__game.model.petProgress.research!);
    expect(pending.end - pending.start).toBe(quote.seconds * 1000);
    const charged = { ...before, dark: before.dark - quote.cost };
    expect(await balance()).toEqual(charged);
    await page.reload();
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    expect(await balance()).toEqual(charged);
    expect(await page.evaluate(() => window.__game.model.petProgress.research)).toEqual(pending);
    await heroes(page);
    await page.locator('[data-action="pets"]').first().tap();
    await expect(page.locator('[data-action="pet-research:owl"]')).toHaveCount(0);
    await page.screenshot({ path: 'output/playtest/upgrading-pet-phone.png' });
    await page.locator('.modal [data-action="close"]').tap();
    const closeArmy = page.locator('[data-action="close-drawer"]');
    if (await closeArmy.isVisible()) await closeArmy.tap();

    const attack = async () => {
      await page.locator('.attack-btn').tap();
      await page.locator('[data-action="attack:0"]').tap();
      await expect(page.locator('.prep-banner')).toBeVisible();
      return page.evaluate(() => window.__game.model.battleHero('king')!.pet ?? null);
    };
    expect(await attack()).toBeNull();
    await page.locator('[data-action="home"]').tap();
    expect(await page.evaluate(() => window.__game.model.petProgress.assigned.king)).toBe('lassi');

    await heroes(page);
    await page.locator('[data-action="pets"]').first().tap();
    await page.locator('[data-action="pet-finish"]').tap();
    await page.locator('.modal [data-action="close"]').tap();
    if (await closeArmy.isVisible()) await closeArmy.tap();
    expect(await attack()).toEqual({ kind: 'lassi', level: 2 });
  });
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
  // The King's tab edits the same gear the King's battles carry.
  await page.locator('[data-action="blacksmith-hero:king"]').click();
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

test.describe('phone pet upgrade items', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  for (const item of ['pet-potion', 'book-of-heroes'] as const) {
    test(`${item} completes assigned pet research once across reload`, async ({ page }) => {
      await boot(page);
      await develop(page);
      const before = await page.evaluate((item) => {
        const { model } = window.__game;
        model.addMagicItem(item);
        return { dark: model.state.dark, gems: model.state.gems };
      }, item);
      const pets = async () => {
        await heroes(page);
        await page.locator('[data-action="pets"]').first().tap();
      };
      const reload = async () => {
        await page.reload();
        await page.waitForFunction(() => window.__game?.scene.artSettled);
      };
      const state = () =>
        page.evaluate((item) => {
          const { model: m } = window.__game;
          return {
            count: m.magicItemCount(item),
            level: m.petProgress.levels.lassi,
            assigned: m.petProgress.assigned.king,
            research: m.petProgress.research,
            dark: m.state.dark,
            gems: m.state.gems,
          };
        }, item);

      await pets();
      await page.locator('[data-action="pet-assign:lassi,king"]').tap();
      await page.locator('[data-action="pet-research:lassi"]').tap();
      await expect(page.locator('[data-pet-timer]')).toBeVisible();
      const charged = { dark: before.dark - 20_000, gems: before.gems };
      const researching = await state();
      expect(researching).toMatchObject({ ...charged, count: 1, level: 1, assigned: 'lassi' });
      expect(researching.research?.kind).toBe('lassi');
      await reload();
      expect(await state()).toEqual(researching);
      if (item === 'book-of-heroes') {
        await pets();
        await page.locator('[data-pet="lassi"] [data-action="book-pet"]').tap();
        await expect(page.locator('[data-pet-timer]')).toHaveCount(0);
      } else {
        await page.evaluate(() => {
          const { model } = window.__game;
          model.selected = model.townhall!.id;
          model.changed();
        });
        await page.locator('.building-context [data-action="magic-items"]').tap();
        const use = page.locator('[data-action="item-potion:pet-potion"]');
        await use.tap();
        await expect(use).toHaveCount(0);
        await reload();
        const accelerated = await page.evaluate(() => {
          const { model: m } = window.__game;
          const boost = m.state.boosts!.pets!;
          const before = m.petProgress.research!.end;
          const now = boost.applied + 600_000;
          m.tick(now);
          const after = m.petProgress.research!.end;
          m.tick(now);
          return { before, after, repeated: m.petProgress.research!.end };
        });
        expect(accelerated.after).toBe(accelerated.before - 23 * 600_000);
        expect(accelerated.repeated).toBe(accelerated.after);
        await reload();
        expect((await state()).research?.end).toBe(accelerated.after);
        await page.evaluate(() => {
          const { model: m } = window.__game;
          m.tick(m.state.boosts!.pets!.end);
        });
      }
      const finished = { ...charged, count: 0, level: 2, assigned: 'lassi', research: undefined };
      expect(await state()).toEqual(finished);
      await reload();
      expect(await state()).toEqual(finished);
      await page.locator('.attack-btn').tap();
      await page.locator('[data-action="attack:0"]').tap();
      await expect(page.locator('.prep-banner')).toBeVisible();
      expect(await page.evaluate(() => window.__game.model.battleHero('king')!.pet)).toEqual({
        kind: 'lassi',
        level: 2,
      });
    });
  }
});

test.describe('phone Hero Hall lineup', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('closing Heroes after a swap restores its Village or Army launcher', async ({ page }) => {
    await boot(page);
    const point = await page.evaluate(async () => {
      const { makeBuilding } = await import('/src/game/model.ts');
      const { model, scene } = window.__game;
      model.townhall.level = 9;
      model.state.obstacles = [];
      model.state.buildings.push(makeBuilding(model.state.nextId++, 'herohall', 16, 20, 3));
      model.state.heroes = { queen: { level: 1 }, prince: { level: 1 } };
      model.tick(Date.now() + 1000);
      if (!model.setHeroLineup(['king', 'queen'])) throw Error('Lineup setup failed');
      scene.sync();
      return scene.screenFor(17.5, 21.5);
    });
    await page.touchscreen.tap(point.x, point.y);
    const context = page.locator('.building-context');
    await expect(context.getByRole('heading')).toHaveText('Hero Hall');
    const villageHeroes = context.getByRole('button', { name: 'Heroes', exact: true });
    const close = page.getByRole('button', { name: 'Close dialog', exact: true });
    await villageHeroes.tap();
    await page.locator('[data-action="hero-lineup:prince"]').tap();
    await expect(page.locator('[data-hero="prince"]')).toContainText('In battle lineup');
    await close.tap();
    await expect(villageHeroes).toBeFocused();

    await context.getByRole('button', { name: 'Close building', exact: true }).tap();
    await page.locator('.train-add').tap();
    const armyHeroes = page.locator('.modern-army-actions').getByRole('button', {
      name: 'Heroes',
      exact: true,
    });
    await armyHeroes.tap();
    await page.locator('[data-action="hero-lineup:queen"]').tap();
    await expect(page.locator('[data-hero="queen"]')).toContainText('In battle lineup');
    await close.tap();
    await expect(armyHeroes).toBeFocused();
  });

  test('an upgrade completed while away restores the selected hero to the next raid', async ({
    page,
  }, info) => {
    const now = Date.now();
    await page.clock.setFixedTime(now);
    await boot(page);
    await develop(page);
    const before = await page.evaluate(() => {
      const { model: m } = window.__game;
      const lineup = ['prince', 'king', 'queen'] as const;
      if (!m.setHeroLineup([...lineup])) throw Error('Lineup setup failed');
      return { lineup, level: m.heroProgress('king')!.level };
    });
    await heroes(page);
    await page.locator('[data-action="hero-upgrade:king"]').tap();
    const read = () =>
      page.evaluate(() => {
        const { model: m } = window.__game;
        const king = m.heroProgress('king')!;
        return { lineup: m.heroLineup, level: king.level, end: king.upgradeEnd };
      });
    const researching = await read();
    expect(researching).toMatchObject(before);
    expect(researching.end).toBeGreaterThan(now);

    // Load a new document after the deadline. The original document never ticks past it.
    await page.reload();
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    expect(await read()).toEqual(researching);
    await expect(
      page.locator('.army-tray').getByRole('button', {
        name: `Barbarian King, level ${before.level}, upgrading`,
        exact: true,
      }),
    ).toBeVisible();
    await page.goto('about:blank');
    await page.clock.setFixedTime(researching.end! + 1);
    await page.goto('/');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    const completed = { ...before, level: before.level + 1, end: undefined };
    expect(await read()).toEqual(completed);
    await expect(
      page.locator('.army-tray').getByRole('button', {
        name: `Barbarian King, level ${completed.level}`,
        exact: true,
      }),
    ).toBeVisible();
    await heroes(page);
    await expect(page.locator('[data-hero="king"]')).toContainText('In battle lineup');
    await expect(page.locator('[data-hero="king"]')).toContainText('SLOT 2 OF 3');
    await page.screenshot({ path: info.outputPath('hero-hall-after-offline-upgrade.png') });

    await page.reload();
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    expect(await read()).toEqual(completed);
    await page.locator('.attack-btn').tap();
    await page.locator('[data-action="attack:0"]').tap();
    await expect(page.locator('.prep-banner')).toBeVisible();
    const roster = await page.evaluate(() => window.__game.model.battle!.nativeHeroes!);
    expect(roster.map((hero) => hero.kind)).toEqual(before.lineup);
    expect(roster.find((hero) => hero.kind === 'king')!.level).toBe(completed.level);
    await page.screenshot({ path: info.outputPath('raid-after-offline-upgrade.png') });
  });

  test('swapping in a ready hero fills an unavailable battle slot first', async ({ page }) => {
    await boot(page);
    await develop(page);
    await page.evaluate(() => {
      const { model: m } = window.__game;
      m.heroHall!.level = 9;
      m.tick(m.clock);
      if (!m.setHeroLineup(['king', 'queen', 'prince', 'warden']))
        throw Error('Lineup setup failed');
      const king = m.heroProgress('king')!;
      king.upgradeStart = m.clock;
      king.upgradeEnd = m.clock + 3_600_000;
      m.changed();
    });
    await heroes(page);
    const swap = page.locator('[data-action="hero-lineup:champion"]');
    await expect(swap).toHaveText('Swap in for Barbarian King');
    await swap.tap();
    const lineup = ['champion', 'queen', 'prince', 'warden'];
    expect(await page.evaluate(() => window.__game.model.heroLineup)).toEqual(lineup);
    await page.reload();
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('.attack-btn').tap();
    await page.locator('[data-action="attack:0"]').tap();
    await expect(page.locator('.prep-banner')).toBeVisible();
    expect(
      await page.evaluate(() => window.__game.model.battle!.nativeHeroes!.map((hero) => hero.kind)),
    ).toEqual(lineup);
  });
});

test.describe('phone Quick Army hero readiness', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('loading a preset keeps an upgrading hero and pet assigned for the next raid', async ({
    page,
  }, info) => {
    await page.clock.setFixedTime(Date.now());
    await boot(page);
    await develop(page);
    await page.evaluate(async () => {
      const { emptyArmy } = await import('/src/game/army.ts');
      const m = window.__game.model;
      m.state.army = { ...emptyArmy(), swordsman: 2 };
      if (!m.setHeroLineup(['king', 'queen', 'prince']) || !m.assignPet('king', 'lassi'))
        throw Error('Preset fixture lineup failed');
    });
    const presets = async () => {
      await page.locator('.train-add').tap();
      await page.locator('[data-action="army-presets"]').tap();
    };
    await presets();
    await page.locator('[data-action="preset-save:0"]').tap();
    await page.locator('.modal [data-action="close"]').tap();
    await page.locator('[data-action="heroes"]').tap();
    await page.locator('[data-action="hero-upgrade:king"]').tap();
    const research = await page.evaluate(() => {
      const m = window.__game.model;
      if (!m.setHeroLineup(['queen', 'king', 'prince']) || !m.assignPet('queen', 'lassi'))
        throw Error('Could not change the active lineup');
      const { level, upgradeEnd } = m.heroProgress('king')!;
      return { level, upgradeEnd, saved: JSON.stringify(m.state.armyPresets?.[0]) };
    });
    expect(research.upgradeEnd).toBeDefined();
    await page.locator('.modal [data-action="close"]').tap();
    await page.locator('[data-action="army-presets"]').tap();
    const card = page.locator('.preset-card').first();
    await expect(card).toContainText('Barbarian King is unavailable while upgrading');
    await expect(card).toContainText('L.A.S.S.I');
    await card.locator('[data-action="preset-load:0"]').tap();
    await page.screenshot({ path: info.outputPath('preset-upgrading-hero.png') });

    const read = () =>
      page.evaluate(() => {
        const m = window.__game.model;
        const { level, upgradeEnd } = m.heroProgress('king')!;
        return {
          level,
          upgradeEnd,
          lineup: m.heroLineup,
          assigned: m.petProgress.assigned,
          saved: JSON.stringify(m.state.armyPresets?.[0]),
          ready: m.armyReady,
        };
      });
    const upgrading = {
      ...research,
      lineup: ['king', 'queen', 'prince'],
      assigned: { king: 'lassi' },
      ready: true,
    };
    expect(await read()).toEqual(upgrading);
    const raid = async () => {
      await page.locator('.attack-btn').tap();
      await page.locator('[data-action="attack:0"]').tap();
      await expect(page.locator('.prep-banner')).toBeVisible();
    };
    await page.reload();
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    expect(await read()).toEqual(upgrading);
    await raid();
    const roster = () => page.evaluate(() => window.__game.model.battle!.nativeHeroes!);
    expect((await roster()).map((hero) => hero.kind)).toEqual(['queen', 'prince']);
    expect((await roster())[0].pet).toBeUndefined();
    await page.locator('.end-battle[data-action="home"]').tap();

    await page.goto('about:blank');
    await page.clock.setFixedTime(research.upgradeEnd! + 1);
    await page.goto('/');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    expect(await read()).toEqual({
      ...upgrading,
      level: research.level + 1,
      upgradeEnd: undefined,
    });
    await raid();
    expect(await roster()).toMatchObject([
      { kind: 'king', level: research.level + 1, pet: { kind: 'lassi', level: 1 } },
      { kind: 'queen' },
      { kind: 'prince' },
    ]);
    await page.waitForFunction(() => !window.__game.scene.battleArtPending());
    await page.locator('[data-action="hero-select:king"]').tap();
    const spot = await page.evaluate(() => {
      const { model, scene, game } = window.__game;
      for (let x = 1.5; x < 44; x++)
        for (let y = 1.5; y < 44; y++) {
          if (model.deployBlocked(x, y)) continue;
          const point = scene.screenFor(x, y);
          if (
            point.y > innerHeight * 0.3 &&
            point.y < innerHeight * 0.6 &&
            document.elementFromPoint(point.x, point.y) === game.canvas
          )
            return point;
        }
      throw Error('No open grass visible for hero deployment');
    });
    await page.touchscreen.tap(spot.x, spot.y);
    const deployed = await page.evaluate(() => {
      const { model } = window.__game;
      const king = model.battleHero('king')!;
      return [king.unitId, king.petId].map(
        (id) => model.battle!.units.find((unit) => unit.id === id)?.level,
      );
    });
    expect(deployed).toEqual([research.level + 1, 1]);

    await page.locator('[data-action="surrender"]').tap();
    await page.locator('[data-action="end"]').tap();
    await page.locator('.result-modal [data-action="home"]').tap();
    await page.reload();
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="battle-log"]').tap();
    await page.getByRole('button', { name: 'Watch replay' }).tap();
    await expect(page.getByRole('slider', { name: 'Replay position' })).toBeVisible();
    expect(await roster()).toMatchObject([
      { kind: 'king', level: research.level + 1, pet: { kind: 'lassi', level: 1 } },
      { kind: 'queen' },
      { kind: 'prince' },
    ]);
  });
});
