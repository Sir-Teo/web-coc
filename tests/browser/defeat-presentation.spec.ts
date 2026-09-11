import { useDevelopedVillage } from './developed-village';
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.ready);
  await useDevelopedVillage(page);
  await page.locator('#loading').waitFor({ state: 'detached' });
  await page.locator('[data-action="skip-tutorial"]').click();
  await page.evaluate(() => {
    const { model: m, scene } = window.__game;
    scene.paused = true;
    m.startBattle(0, true);
    m.battle.buildings = m.battle.buildings.filter((b) => b.kind === 'townhall');
    for (const kind of ['archer', 'balloon', 'wallbreaker']) {
      m.activeTroop = kind;
      m.deploy(1, 13);
      const u = m.battle.units.at(-1);
      u.x = 6 + m.battle.units.length * 2;
      u.y = 16;
      u.hp = 0;
      if (kind === 'wallbreaker') u.ejected = u.spent = true;
    }
    m.step(0.05);
    scene.sync();
    scene.drawOverlay(0);
    scene.ambientUnits.forEach((im) => im.setVisible(false));
  });
});

test('casualties freeze with battle time and finish only when the simulation advances', async ({
  page,
}) => {
  const read = () =>
    page.evaluate(() =>
      [...window.__game.scene.unitSprites.values()].map((im) => ({
        x: im.x,
        y: im.y,
        alpha: im.alpha,
        angle: im.angle,
        visible: im.visible,
      })),
    );
  const initial = await read();
  await page.waitForTimeout(800);
  expect(await read()).toEqual(initial);
  await page.evaluate(() => {
    const { model, scene } = window.__game;
    model.step(0.2);
    scene.drawOverlay(5000);
  });
  const moving = await read();
  expect(moving[0].alpha).toBeCloseTo(0.5);
  expect(moving[1].y).toBeGreaterThan(initial[1].y);
  expect(moving[2].y).toBeLessThan(initial[2].y);
  await page.waitForTimeout(250);
  expect(await read()).toEqual(moving);
  await page.screenshot({ path: 'output/playtest/defeat-poses.png' });
  await page.evaluate(() => {
    const { model, scene } = window.__game;
    model.step(0.5);
    scene.drawOverlay(5000);
  });
  expect((await read()).every((p) => !p.visible && p.alpha === 0)).toBe(true);
});

test('rendering a reconstructed late timeline does not restart old deaths', async ({ page }) => {
  const result = await page.evaluate(() => {
    const { model, scene } = window.__game;
    model.step(3);
    // A seek replaces the battle and creates its sprites from reconstructed units.
    model.battle = structuredClone(model.battle);
    scene.sync();
    scene.drawOverlay(0);
    return [...scene.unitSprites.values()].map((im) => ({ visible: im.visible, alpha: im.alpha }));
  });
  expect(result.every((p) => !p.visible && p.alpha === 0)).toBe(true);
});

test('reduced motion and a completed battle leave no frozen casualty sprites', async ({ page }) => {
  const result = await page.evaluate(() => {
    const { model, scene } = window.__game;
    model.state.settings.reducedMotion = true;
    scene.drawOverlay(0);
    const reduced = [...scene.unitSprites.values()].every((im) => !im.visible);
    model.state.settings.reducedMotion = false;
    model.finishBattle();
    scene.drawOverlay(0);
    return { reduced, finished: [...scene.unitSprites.values()].every((im) => !im.visible) };
  });
  expect(result).toEqual({ reduced: true, finished: true });
});
