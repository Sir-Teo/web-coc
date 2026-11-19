import { useDevelopedVillage } from './developed-village';
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await useDevelopedVillage(page);
  await page.locator('[data-action="skip-tutorial"]').click();
});

test('army editing is immediate, free, and respects weighted spell housing', async ({ page }) => {
  const elixir = await page.evaluate(() => window.__game.model.state.elixir);
  await page.locator('.train-add').click();
  await page.locator('[data-action="clear-army"]').click();
  await page.locator('[data-action="train:giant"]').click();
  await page.locator('[data-action="train:archer"]').click();
  await page.locator('[data-action="remove-troop:archer"]').click();
  await expect(page.locator('[data-action="remove-troop:archer"]')).toBeDisabled();
  await page.locator('[data-action="brew:rage"]').click();
  await page.locator('[data-action="brew:rage"]').click();
  await page.locator('[data-action="brew:lightning"]').click();
  await expect(page.locator('[data-action="brew:heal"]')).toBeDisabled();
  await page.locator('[data-action="brew:lightning"]').click();
  await expect(page.locator('[data-action="brew:lightning"]')).toBeDisabled();
  await page.locator('[data-action="remove-spell:rage"]').click();
  await page.locator('[data-action="brew:heal"]').click();
  expect(
    await page.evaluate(() => {
      const m = window.__game.model;
      return {
        elixir: m.state.elixir,
        giant: m.state.army.giant,
        archer: m.state.army.archer,
        housing: m.spellHousing,
        spells: Object.fromEntries(Object.entries(m.state.spells).filter(([, n]) => n)),
        queue: m.state.queue.length,
      };
    }),
  ).toEqual({
    elixir,
    giant: 1,
    archer: 0,
    housing: 6,
    spells: { rage: 1, heal: 1, lightning: 2 },
    queue: 0,
  });
});

test('named quick armies save, safely render names, and restore after reload', async ({ page }) => {
  const original = await page.evaluate(() => ({
    army: window.__game.model.state.army,
    spells: window.__game.model.state.spells,
  }));
  await page.locator('.train-add').click();
  await page.locator('[data-action="army-presets"]').click();
  const name = '<img src=x onerror=alert(1)>';
  await page.locator('#preset-name-0').fill(name);
  await page.locator('[data-action="preset-save:0"]').click();
  await expect(page.locator('#preset-name-0')).toHaveValue(name);
  await expect(page.locator('.preset-body img[src="x"]')).toHaveCount(0);
  await page.locator('#preset-name-0').fill('Giants & friends');
  await page.locator('[data-action="preset-save:0"]').click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: 'output/playtest/quick-armies-desktop.png' });
  await page.reload();
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('.train-add').click();
  await page.locator('[data-action="clear-army"]').click();
  await page.locator('[data-action="army-presets"]').click();
  await expect(page.locator('#preset-name-0')).toHaveValue('Giants & friends');
  await page.locator('[data-action="preset-load:0"]').click();
  expect(
    await page.evaluate(() => ({
      army: window.__game.model.state.army,
      spells: window.__game.model.state.spells,
    })),
  ).toEqual(original);
});

test('undoing a Quick army overwrite restores its name before saving again', async ({ page }) => {
  await page.locator('.train-add').click();
  await page.locator('[data-action="army-presets"]').click();
  const name = page.locator('#preset-name-0');
  const otherName = page.locator('#preset-name-1');
  await otherName.fill('Unsaved second army');
  await name.fill('First army');
  await page.locator('[data-action="preset-save:0"]').click();
  await expect(otherName).toHaveValue('Unsaved second army');
  await name.fill('Replacement army');
  await page.locator('[data-action="preset-save:0"]').click();
  await page.locator('[data-action="preset-undo:0"]').click();
  await expect(name).toHaveValue('First army');
  await expect(otherName).toHaveValue('Unsaved second army');
  await page.locator('[data-action="preset-save:0"]').click();
  expect(await page.evaluate(() => window.__game.model.state.armyPresets[0].name)).toBe(
    'First army',
  );
});

test('practice uses real pointer deployment, preserves the army, and resets on repeat', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const before = await page.evaluate(() => {
    const s = window.__game.model.state;
    return { army: s.army, spells: s.spells, gold: s.gold, elixir: s.elixir, stars: s.stars };
  });
  await page.locator('.train-add').click();
  await page.locator('[data-action="practice"]').click();
  await expect(page.locator('.battle-enemy')).toContainText('PRACTICE ATTACK');
  await page.locator('[data-action="troop:giant"]').click();
  const p = await page.evaluate(() => window.__game.scene.screenFor(1.2, 13));
  await page.mouse.click(p.x, p.y);
  await expect.poll(() => page.evaluate(() => window.__game.model.battle.units.length)).toBe(1);
  await page.locator('[data-action="spell:rage"]').click();
  await page.mouse.click(p.x + 30, p.y + 20);
  await expect.poll(() => page.evaluate(() => window.__game.model.battle.spells.rage)).toBe(0);
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'output/playtest/practice-desktop.png' });
  await page.locator('[data-action="surrender"]').click();
  await page.locator('[data-action="end"]').click();
  await expect(page.locator('#result-title')).toHaveText('Practice complete');
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'output/playtest/practice-result-desktop.png' });
  expect(
    await page.evaluate(() => {
      const s = window.__game.model.state;
      return { army: s.army, spells: s.spells, gold: s.gold, elixir: s.elixir, stars: s.stars };
    }),
  ).toEqual(before);
  await page.locator('[data-action="raid-again"]').click();
  await expect(page.locator('.prep-banner')).toBeVisible();
  expect(
    await page.evaluate(() => {
      const b = window.__game.model.battle;
      return {
        units: b.units.length,
        fullHealth: b.buildings.every((b) => b.hp === b.maxHp),
        spells: b.spells,
        army: b.remaining,
      };
    }),
  ).toEqual({ units: 0, fullHealth: true, spells: before.spells, army: before.army });
  await page.locator('[data-action="home"]').click();
  await page.locator('[data-action="battle-log"]').click();
  await expect(page.locator('.raid-record')).toHaveCount(1);
  await expect(page.locator('.raid-record')).toContainText('no army losses or rewards');
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'output/playtest/battle-log-desktop.png' });
  await page.reload();
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="battle-log"]').click();
  await expect(page.locator('.raid-record')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('mobile presets and practice results remain usable without overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.army-label button').click();
  await page.locator('[data-action="army-presets"]').click();
  await page.locator('#preset-name-0').fill('Village defense');
  await page.locator('[data-action="preset-save:0"]').click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'output/playtest/quick-armies-mobile.png' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  // Closing the window returns to the army drawer it was opened from; close that too.
  await page.locator('[data-action="close"]').click();
  await page.locator('[data-action="close-drawer"]').click();
  await page.locator('[data-action="battle-log"]').click();
  await expect(page.locator('.empty-log')).toBeVisible();
  await page.locator('[data-action="practice"]').click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'output/playtest/practice-mobile.png' });
  const enemy = await page.locator('.battle-enemy').boundingBox();
  const timer = await page.locator('.battle-clock').boundingBox();
  expect(timer!.y).toBeGreaterThanOrEqual(enemy!.y + enemy!.height);
  await page.evaluate(() => window.__game.model.finishBattle());
  await expect(page.locator('#result-title')).toHaveText('Practice complete');
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'output/playtest/practice-result-mobile.png' });
  await expect(page.locator('[data-action="raid-again"]')).toBeInViewport();
  await expect(page.locator('.result-modal [data-action="home"]')).toBeInViewport();
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'output/playtest/practice-result-landscape.png' });
  await expect(page.locator('[data-action="raid-again"]')).toBeInViewport();
  await expect(page.locator('.result-modal [data-action="home"]')).toBeInViewport();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.result-modal [data-action="home"]').click();
  await page.locator('[data-action="battle-log"]').click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'output/playtest/battle-log-mobile.png' });
  await expect(page.locator('.raid-record')).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test('campaign results prepare the last army and start a fresh repeat attack', async ({ page }) => {
  const original = await page.evaluate(() => ({
    army: window.__game.model.state.army,
    spells: window.__game.model.state.spells,
  }));
  await page.locator('.attack-btn').click();
  await page.locator('[data-action="attack:0"]').click();
  await page.waitForFunction(() => !window.__game.scene.battleArtPending());
  await page.locator('[data-action="troop:giant"]').click();
  const p = await page.evaluate(() => {
    const { model, scene } = window.__game;
    for (let y = 1.5; y < 27; y++)
      for (let x = 1.5; x < 27; x++) {
        const screen = scene.screenFor(x, y);
        if (
          !model.deployBlocked(x, y) &&
          screen.x > 35 &&
          screen.x < innerWidth - 35 &&
          screen.y > innerHeight * 0.35 &&
          screen.y < innerHeight * 0.7
        )
          return { x, y, screen };
      }
    throw Error('No visible deployment ground');
  });
  await page.mouse.click(p.screen.x, p.screen.y);
  await expect.poll(() => page.evaluate(() => window.__game.model.battle.units.length)).toBe(1);
  await page.locator('[data-action="spell:heal"]').click();
  await page.mouse.click(p.screen.x + 30, p.screen.y + 20);
  await expect.poll(() => page.evaluate(() => window.__game.model.battle.spells.heal)).toBe(0);
  await page.locator('[data-action="surrender"]').click();
  await page.locator('[data-action="end"]').click();
  await expect(page.locator('#result-title')).toBeVisible();
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'output/playtest/campaign-result-landscape.png' });
  await page.locator('[data-action="raid-again"]').click();
  await expect(page.locator('.prep-banner')).toBeVisible();
  expect(
    await page.evaluate(() => ({
      army: window.__game.model.battle.remaining,
      spells: window.__game.model.battle.spells,
    })),
  ).toEqual(original);
  expect(
    await page.evaluate(() => ({
      units: window.__game.model.battle.units.length,
      raids: window.__game.model.state.stats.raids,
      logs: window.__game.model.state.raidLog.length,
    })),
  ).toEqual({ units: 0, raids: 1, logs: 1 });
  // An unfinished facility must not silently send an incomplete army into another raid.
  await page.evaluate(({ x, y }) => {
    const m = window.__game.model;
    for (const b of m.state.buildings.filter((b) => b.kind === 'barracks')) {
      b.constructing = true;
      b.upgradeStart = m.clock;
      b.upgradeEnd = m.clock + 600000;
    }
    m.activeTroop = 'giant';
    if (!m.deploy(x, y)) throw Error('Repeat deployment failed');
    m.finishBattle();
  }, p);
  await page.locator('[data-action="raid-again"]').click();
  await expect(page.locator('.drawer-sheet')).toBeVisible();
  expect(await page.evaluate(() => window.__game.model.battle)).toBeNull();
  await expect(page.locator('[data-action="train:giant"]')).toBeDisabled();
});

test('the Army drawer reads each housing capacity a bounded number of times per render', async ({
  page,
}) => {
  await page.locator('.train-add').click();
  const result = await page.evaluate(() => {
    const { model, hud, scene } = window.__game;
    scene.paused = true;
    const reads = { capacity: 0, spellCapacity: 0 };
    const prototype = Object.getPrototypeOf(model);
    for (const name of ['capacity', 'spellCapacity'] as const) {
      const get = Object.getOwnPropertyDescriptor(prototype, name)!.get!;
      Object.defineProperty(model, name, {
        configurable: true,
        get() {
          reads[name]++;
          return get.call(model);
        },
      });
    }
    try {
      hud.render();
      const first = { ...reads, cards: document.querySelectorAll('.army-tile').length };
      const selector = '[data-action="train-fill:archer"]';
      const fill = document.querySelector(selector)!;
      const label = fill.getAttribute('aria-label');
      model.train('swordsman');
      hud.render();
      return {
        ...first,
        keptFill: document.querySelector(selector) === fill,
        changedLabel: fill.getAttribute('aria-label') !== label,
      };
    } finally {
      Reflect.deleteProperty(model, 'capacity');
      Reflect.deleteProperty(model, 'spellCapacity');
    }
  });
  expect(result.cards).toBeGreaterThan(50);
  expect(result.capacity).toBeLessThanOrEqual(5);
  expect(result.spellCapacity).toBeLessThanOrEqual(5);
  expect(result.keptFill).toBe(true);
  expect(result.changedLabel).toBe(true);
});

test('editing a scrolled Army catalog on a phone keeps its position without forcing a scroll', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.train-add').click();
  const drawer = page.locator('.army-strip');
  await page.locator('[data-action="train:giant"]').scrollIntoViewIfNeeded();
  const result = await drawer.evaluate((element) => {
    const { model, hud } = window.__game;
    const offsets = ['scrollLeft', 'scrollTop'] as const;
    const before = offsets.map((key) => element[key]);
    let accesses = 0;
    for (const key of offsets) {
      const { get, set } = Object.getOwnPropertyDescriptor(Element.prototype, key)!;
      Object.defineProperty(element, key, {
        configurable: true,
        get() {
          accesses++;
          return get!.call(element);
        },
        set(value: number) {
          accesses++;
          set!.call(element, value);
        },
      });
    }
    try {
      model.removeTroop('swordsman');
      hud.render();
    } finally {
      for (const key of offsets) Reflect.deleteProperty(element, key);
    }
    return {
      accesses,
      sameDrawer: document.querySelector('.army-strip') === element,
      before,
      after: offsets.map((key) => element[key]),
    };
  });
  expect(result.before[0]).toBeGreaterThan(0);
  expect(result.sameDrawer).toBe(true);
  expect(result.after).toEqual(result.before);
  expect(result.accesses).toBe(0);
});

test.describe('repeat raid preparation on touch', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  for (const action of ['continue', 'cancel', 'reload'] as const) {
    const title =
      action === 'reload'
        ? 'a completed adjusted retry survives an immediate reload after returning home'
        : `a Last Army that no longer fits allows the player to ${action} from preparation`;
    test(title, async ({ page }) => {
      const completed = await page.evaluate(async () => {
        const { emptyArmy } = await import('/src/game/army.ts');
        const { freshNativeCampaign } = await import('/src/game/native-campaign.ts');
        const { model: m } = window.__game;
        m.state.army = { ...emptyArmy(), swordsman: 5 };
        (m.state.nativeCampaign ??= freshNativeCampaign()).stars[0] = 1;
        m.startCampaign(1);
        m.activeTroop = 'swordsman';
        for (const [x, y] of [
          [2, 2],
          [2, 45],
          [45, 2],
          [45, 45],
        ]) {
          if (!m.deployBlocked(x, y) && m.deploy(x, y)) break;
        }
        if (!m.battle?.started) throw Error('Required a completed raid with one deployment');
        m.finishBattle();
        Object.defineProperty(m, 'capacity', { value: 4 });
        return {
          raids: m.state.stats.raids,
          records: m.state.raidLog!.length,
          index: m.battle.index,
        };
      });
      await page.locator('[data-action="raid-again"]').tap();
      await expect(page.locator('.drawer-sheet')).toBeVisible();
      const retry = page.locator('[data-action="repeat-adjusted-attack"]');
      await expect(retry).toHaveAccessibleName(/Goblin Forest/);
      await expect(retry).toBeInViewport({ ratio: 1 });
      const read = () =>
        page.evaluate(() => {
          const { model: m } = window.__game;
          return {
            battle: m.battle ? { index: m.battle.index, started: m.battle.started } : null,
            raids: m.state.stats.raids,
            records: m.state.raidLog!.length,
            swordsman: m.state.army.swordsman,
            archer: m.state.army.archer,
          };
        });
      const expected = {
        battle: null,
        raids: completed.raids,
        records: completed.records,
        swordsman: 4,
        archer: 0,
      };
      expect(await read()).toEqual(expected);
      await page.locator('[data-action="remove-troop:swordsman"]').tap();
      await page.locator('[data-action="train:archer"]').tap();
      if (action !== 'cancel') await retry.tap();
      else {
        await page.locator('[data-action="close-drawer"]').tap();
        await page.locator('.train-add').tap();
        await expect(retry).toHaveCount(0);
      }
      expect(await read()).toEqual({
        ...expected,
        swordsman: 3,
        archer: 1,
        battle: action === 'cancel' ? null : { index: completed.index, started: false },
      });
      if (action === 'continue') {
        await page.locator('[data-action="home"]').tap();
        expect(await read()).toEqual({ ...expected, swordsman: 3, archer: 1 });
      }
      expect(await page.evaluate(() => window.__game.model.state.lastArmy!.swordsman)).toBe(5);
      if (action !== 'reload') return;

      await page.evaluate(() => {
        const { model: m } = window.__game;
        m.activeTroop = 'archer';
        for (const [x, y] of [
          [2, 2],
          [2, 45],
          [45, 2],
          [45, 45],
        ]) {
          if (!m.deployBlocked(x, y) && m.deploy(x, y)) return;
        }
        throw Error('Required one legal deployment for the adjusted retry');
      });
      await page.locator('[data-action="surrender"]').tap();
      await page.locator('[data-action="end"]').tap();
      const settled = () =>
        page.evaluate(() => {
          const { state } = window.__game.model;
          const record = state.raidLog![0];
          return {
            lastArmy: state.lastArmy,
            stats: state.stats,
            gold: state.gold,
            campaign: state.nativeCampaign,
            retry: record,
            ids: state.raidLog!.map((raid) => raid.id),
          };
        });
      const result = await settled();
      expect(result.lastArmy).toMatchObject({ swordsman: 3, archer: 1 });
      expect(result.retry.deployed.archer).toBe(1);
      expect(result.retry.replay).toBeDefined();
      expect(result.stats.raids).toBe(completed.raids + 1);
      expect(result.ids).toHaveLength(completed.records + 1);
      expect(new Set(result.ids).size).toBe(completed.records + 1);
      await page.locator('.result-modal [data-action="home"]').tap();
      await page.reload();
      await page.waitForFunction(() => window.__game?.scene.artSettled);
      expect(await settled()).toEqual(result);
      await page.locator('[data-action="battle-log"]').tap();
      await page.getByRole('button', { name: 'Watch replay' }).first().tap();
      await expect(page.getByRole('slider', { name: 'Replay position' })).toBeVisible();
      expect(await settled()).toEqual(result);
    });
  }
});

test.describe('blocked Quick Army on touch', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('a blocked preset preserves the active army and can be used after the Barracks upgrade', async ({
    page,
  }, info) => {
    const fixedTime = Date.now();
    await page.clock.setFixedTime(fixedTime);
    const barracksId = await page.evaluate(async () => {
      const { emptyArmy, emptySpells } = await import('/src/game/army.ts');
      const m = window.__game.model;
      m.state.army = { ...emptyArmy(), giant: 2 };
      m.state.spells = emptySpells();
      m.changed();
      return m.state.buildings.find((building) => building.kind === 'barracks')!.id;
    });
    const open = async () => {
      await page.locator('.train-add').tap();
      await page.locator('[data-action="army-presets"]').tap();
    };
    await open();
    await page.locator('#preset-name-0').fill('Two Giants');
    await page.locator('[data-action="preset-save:0"]').tap();
    await page.evaluate(async (id) => {
      const { emptyArmy } = await import('/src/game/army.ts');
      const { TROOP_UNLOCK } = await import('/src/game/army-unlocks.ts');
      const m = window.__game.model;
      const barracks = m.state.buildings.find((building) => building.id === id)!;
      barracks.level = TROOP_UNLOCK.giant - 1;
      m.state.army = { ...emptyArmy(), swordsman: 3 };
      m.addMagicItem('book-of-building');
      m.changed();
    }, barracksId);
    const read = () =>
      page.evaluate(() => {
        const m = window.__game.model;
        return {
          army: m.state.army,
          spells: m.state.spells,
          presets: m.state.armyPresets,
          lineup: m.heroLineup,
        };
      });
    const before = await read();
    expect(before.presets?.[0]?.name).toBe('Two Giants');
    expect(before.presets?.[0]?.army.giant).toBe(2);
    const use = page.locator('[data-action="preset-load:0"]');
    await expect(use).toBeDisabled();
    await expect(page.locator('.preset-card').first()).toContainText(
      'Giant requires a completed level',
    );
    await page.screenshot({ path: info.outputPath('blocked-quick-army.png') });
    // The disabled control prevents a tap, so exercise the operation directly too.
    await page.evaluate(() => window.__game.model.loadArmyPreset(0));
    expect(await read()).toEqual(before);

    await page.reload();
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    expect(await read()).toEqual(before);
    await open();
    await expect(use).toBeDisabled();
    await page.locator('.modal [data-action="close"]').tap();
    await page.locator('[data-action="close-drawer"]').tap();
    await page.evaluate((id) => {
      const m = window.__game.model;
      m.selected = id;
      m.changed();
    }, barracksId);
    await page.locator(`[data-action="upgrade:${barracksId}"]`).tap();
    await page.locator(`[data-action="book-building:${barracksId}"]`).tap();
    await page.getByRole('button', { name: 'Close building' }).tap();
    await open();
    await expect(use).toBeEnabled();
    await use.tap();
    expect(await read()).toEqual({ ...before, army: before.presets![0]!.army });
    await page.reload();
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    expect(await read()).toEqual({ ...before, army: before.presets![0]!.army });
  });
});
