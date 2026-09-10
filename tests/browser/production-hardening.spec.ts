import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
test('research is usable on desktop and mobile and survives reloading', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.ready);
  await page.evaluate(() => {
    const m = window.__game.model;
    const lab = m.state.buildings.find((b) => b.kind === 'laboratory');
    m.upgrade(lab.id);
    m.finish(lab.id);
  });
  await page.locator('.train-add').click();
  await page.locator('[data-action="research"]').click();
  await expect(page.locator('#modal-title')).toHaveText('The laboratory');
  await page.locator('[data-action="research-start:giant"]').click();
  await expect(page.locator('[data-research]')).toBeVisible();
  await expect(page.locator('[data-action="research-start:archer"]')).toBeDisabled();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'output/playtest/research-desktop.png' });
  await page.waitForTimeout(1200);
  await page.reload();
  await page.waitForFunction(() => window.__game?.scene.ready);
  await page.locator('.train-add').click();
  await page.locator('[data-action="research"]').click();
  await expect(page.locator('[data-research]')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'output/playtest/research-mobile.png' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.locator('[data-action="research-finish"]').click();
  expect(await page.evaluate(() => window.__game.model.troopLevel('giant'))).toBe(2);
  await page.locator('[data-action="close"]').click();
  await expect(
    page.locator('.troop-card').filter({ hasText: 'Giant' }).locator('.troop-level'),
  ).toHaveText('★ 2');
  await page.locator('.attack-btn').click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'output/playtest/campaign-mobile.png' });
});
test('a second tab waits and receives the latest village after the owner closes', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.ready);
  const second = await context.newPage();
  await second.goto('/');
  await expect(second.locator('#loading')).toHaveAttribute('data-session', 'waiting');
  expect(await second.evaluate(() => !!window.__game)).toBe(false);
  await page.locator('[data-action="collect"]').last().click();
  const gold = await page.evaluate(() => window.__game.model.state.gold);
  await page.close();
  await second.waitForFunction(() => window.__game?.scene.ready);
  expect(await second.evaluate(() => window.__game.model.state.gold)).toBe(gold);
  await expect(second.locator('.shop-btn')).toBeVisible();
  await second.reload();
  await second.waitForFunction(() => window.__game?.scene.ready);
  expect(await second.evaluate(() => window.__game.model.state.gold)).toBe(gold);
});
test('WebGL loss pauses combat and restoration keeps the village interactive', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.ready);
  await page.evaluate(() => {
    const { game, model } = window.__game;
    model.startBattle(0);
    model.activeTroop = 'giant';
    model.deploy(1, 13);
    window.__contextExtension = game.renderer.gl.getExtension('WEBGL_lose_context');
    if (!window.__contextExtension) throw Error('Context-loss extension unavailable');
    window.__contextExtension.loseContext();
  });
  await page.waitForFunction(() => window.__game.scene.paused);
  const elapsed = await page.evaluate(() => window.__game.model.battle.elapsed);
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__game.model.battle.elapsed)).toBe(elapsed);
  await page.evaluate(() => window.__contextExtension.restoreContext());
  await page.waitForFunction(() => !window.__game.scene.paused);
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__game.model.battle.elapsed)).toBeGreaterThan(elapsed);
  await page.locator('[data-action="surrender"]').click();
  await page.locator('[data-action="end"]').click();
  await page.locator('[data-action="home"]').click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'output/playtest/context-restored.png' });
  await page.locator('.shop-btn').click();
  await expect(page.locator('.drawer-sheet')).toBeVisible();
  expect(errors).toEqual([]);
});
test('twenty raid transitions release scene objects and keep saves valid', async ({ page }) => {
  test.setTimeout(60000);
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.ready);
  const counts = [];
  for (let i = 0; i < 20; i++) {
    await page.evaluate(() => {
      const { model } = window.__game;
      model.state.army = {
        swordsman: 14,
        archer: 12,
        giant: 3,
        wizard: 3,
        balloon: 0,
        goblin: 0,
        wallbreaker: 0,
      };
      model.state.spells = { rage: 0, heal: 0, lightning: 0 };
      model.startBattle(0);
      for (const kind of ['giant', 'swordsman', 'archer', 'wizard']) {
        model.activeTroop = kind;
        while (model.battle.remaining[kind] > 0) model.deploy(1, 13);
      }
      window.advanceTime(180000);
    });
    await expect(page.locator('#result-title')).toHaveText('Victory!');
    await page.locator('[data-action="home"]').click();
    await page.waitForTimeout(100);
    if (i % 5 === 4) {
      await page.waitForTimeout(1800);
      counts.push(await page.evaluate(() => window.__game.scene.children.length));
    }
  }
  expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(5);
  expect(await page.evaluate(() => window.__game.scene.unitSprites.size)).toBe(0);
  await fs.writeFile(
    'output/playtest/raid-endurance.json',
    JSON.stringify({ raids: 20, sceneObjectCounts: counts, remainingUnitSprites: 0 }, null, 2),
  );
  expect(await page.evaluate(() => window.__game.model.state.stats.raids)).toBe(20);
  await page.waitForTimeout(1200);
  await page.reload();
  await page.waitForFunction(() => window.__game?.scene.ready);
  expect(await page.evaluate(() => window.__game.model.state.stats.raids)).toBe(20);
});
