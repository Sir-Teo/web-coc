import { useDevelopedVillage } from './developed-village';
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.ready);
  await useDevelopedVillage(page);
  await page.locator('[data-action="skip-tutorial"]').click();
  await page.evaluate(() => {
    const m = window.__game.model;
    m.townhall.level = 8;
    m.state.elixir = 3000000;
    m.state.buildings.find((b) => b.kind === 'spellfactory').level = 2;
    m.state.spells = { heal: 2, rage: 0, lightning: 0 };
    m.changed();
  });
  for (const kind of ['barracks', 'spellfactory']) {
    const id = await page.evaluate((kind) => {
      const m = window.__game.model;
      m.selected = m.state.buildings.find((b) => b.kind === kind).id;
      m.changed();
      return m.selected;
    }, kind);
    await page.locator(`[data-action="upgrade:${id}"]`).click();
  }
  expect(await page.evaluate(() => window.__game.model.busy)).toBe(2);
  await page.keyboard.press('Escape');
});

test('upgrading facilities keep phone army editing and saved presets available', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.train-add').click();
  await page.locator('[data-action="clear-army"]').click();
  await expect(page.locator('.drawer-foot')).toContainText('Free & instant during upgrades');
  await page.locator('[data-action="train-five:giant"]').click();
  await page.locator('[data-action="brew:heal"]').click();
  await page.locator('[data-action="brew:heal"]').click();
  await expect(page.locator('[data-action="brew:lightning"]')).toBeDisabled();
  await page.locator('[data-action="army-presets"]').click();
  await page.locator('#preset-name-0').fill('Ready during upgrades');
  await page.locator('[data-action="preset-save:0"]').click();
  await page.reload();
  await page.waitForFunction(() => window.__game?.scene.ready);
  await page.locator('.train-add').click();
  await page.locator('[data-action="clear-army"]').click();
  await page.locator('[data-action="army-presets"]').click();
  await page.locator('[data-action="preset-load:0"]').click();
  expect(
    await page.evaluate(() => {
      const m = window.__game.model;
      return {
        giants: m.state.army.giant,
        spells: m.state.spells,
        housing: m.spellCapacity,
        busy: m.busy,
      };
    }),
  ).toEqual({ giants: 5, spells: { heal: 2, rage: 0, lightning: 0 }, housing: 4, busy: 2 });
  await page.keyboard.press('Escape');
  await page.locator('.train-add').click();
  await expect(page.locator('.drawer-sheet')).toBeVisible();
  await expect(page.locator('.drawer-foot')).toContainText('Free & instant during upgrades');
  await expect(page.locator('.drawer-foot')).toBeInViewport({ ratio: 1 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.screenshot({ path: `output/playtest/army-during-upgrades-phone-${test.info().project.name}.png` });
});

test('repeat campaign attacks replenish the whole army while both facilities upgrade', async ({
  page,
}) => {
  const original = await page.evaluate(() => {
    const m = window.__game.model;
    const original = {
      army: structuredClone(m.state.army),
      spells: structuredClone(m.state.spells),
    };
    m.startBattle(0);
    m.activeTroop = 'giant';
    m.deploy(4, 11);
    m.finishBattle();
    return original;
  });
  await page.locator('[data-action="raid-again"]').click();
  await expect(page.locator('.prep-banner')).toBeVisible();
  expect(
    await page.evaluate(() => ({
      army: window.__game.model.battle.remaining,
      spells: window.__game.model.battle.spells,
    })),
  ).toEqual(original);
  expect(await page.evaluate(() => window.__game.model.busy)).toBe(2);
  expect(await page.evaluate(() => window.__game.model.state.raidLog.length)).toBe(1);
});
