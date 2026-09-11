import { useDevelopedVillage } from './developed-village';
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.ready);
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
        spells: m.state.spells,
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
  await page.waitForFunction(() => window.__game?.scene.ready);
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
  await page.waitForFunction(() => window.__game?.scene.ready);
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
  await page.locator('[data-action="close"]').click();
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
  await page.locator('[data-action="troop:giant"]').click();
  const p = await page.evaluate(() => window.__game.scene.screenFor(4, 11));
  await page.mouse.click(p.x, p.y);
  await page.locator('[data-action="spell:heal"]').click();
  await page.mouse.click(p.x + 30, p.y + 20);
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
  await page.evaluate(() => {
    const m = window.__game.model;
    for (const b of m.state.buildings.filter((b) => b.kind === 'barracks')) {
      b.constructing = true;
      b.upgradeStart = m.clock;
      b.upgradeEnd = m.clock + 600000;
    }
    m.activeTroop = 'giant';
    m.deploy(4, 11);
    m.finishBattle();
  });
  await page.locator('[data-action="raid-again"]').click();
  await expect(page.locator('.drawer-sheet')).toBeVisible();
  expect(await page.evaluate(() => window.__game.model.battle)).toBeNull();
  await expect(page.locator('[data-action="train:giant"]')).toBeDisabled();
});
