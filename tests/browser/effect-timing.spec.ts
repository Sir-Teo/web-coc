import { useDevelopedVillage } from './developed-village';
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await useDevelopedVillage(page);
  await page.locator('[data-action="skip-tutorial"]').click();
  await page.evaluate(() => {
    const { model, scene } = window.__game;
    scene.paused = true;
    model.startBattle(0, true);
    model.battle.started = true;
    scene.sync();
  });
});

test('weapon flashes, spell rings, debris and smoke freeze and expire on battle time', async ({
  page,
}) => {
  await page.evaluate(() => {
    const scene = window.__game.scene;
    scene.effect({ type: 'impact', weapon: 'arrow', x: 10, y: 10, toX: 12, toY: 12 });
    scene.effect({ type: 'impact', weapon: 'bomb', radius: 1.2, x: 10, y: 10, toX: 12, toY: 12 });
    scene.effect({ type: 'spell', spell: 'lightning', x: 10, y: 10 });
    scene.effect({ type: 'destroy', x: 10, y: 10 });
    scene.effect({ type: 'spring', x: 10, y: 10 });
  });
  const read = () =>
    page.evaluate(() =>
      [...window.__game.scene.effectTimeline.entries].map(({ config }) => {
        const im = config.targets;
        return { x: im.x, y: im.y, alpha: im.alpha, scaleX: im.scaleX, scaleY: im.scaleY };
      }),
    );
  const before = await read();
  expect(before.length).toBeGreaterThan(20);
  await page.waitForTimeout(1100);
  expect(await read()).toEqual(before);
  await page.evaluate(() => {
    const { model, scene } = window.__game;
    model.step(0.05);
    scene.drawOverlay(9000);
  });
  expect(await read()).not.toEqual(before);
  await page.evaluate(() => {
    const { model, scene } = window.__game;
    model.step(2);
    scene.drawOverlay(9000);
  });
  expect(await read()).toHaveLength(0);
  expect(await page.evaluate(() => window.__game.scene.combatEffects.objects.size)).toBe(0);
});

test('spell auras hold their pulse while paused and become static with reduced motion', async ({
  page,
}) => {
  const result = await page.evaluate(() => {
    const { model, scene } = window.__game;
    model.battle.auras = [{ kind: 'rage', x: 10, y: 10, start: 0, end: 18, pulses: 0 }];
    scene.drawOverlay(0);
    const before = JSON.stringify(scene.overlay.commandBuffer);
    scene.drawOverlay(9999);
    const paused = JSON.stringify(scene.overlay.commandBuffer);
    model.battle.elapsed = 0.2;
    scene.drawOverlay(9999);
    const advanced = JSON.stringify(scene.overlay.commandBuffer);
    model.state.settings.reducedMotion = true;
    scene.drawOverlay(0);
    const reduced = JSON.stringify(scene.overlay.commandBuffer);
    model.battle.elapsed = 0.4;
    scene.drawOverlay(9999);
    return {
      before,
      paused,
      advanced,
      reduced,
      reducedLater: JSON.stringify(scene.overlay.commandBuffer),
    };
  });
  expect(result.paused).toBe(result.before);
  expect(result.advanced).not.toBe(result.before);
  expect(result.reducedLater).toBe(result.reduced);
});

test('reduced feedback fades in place and returning home cancels pending battle effects', async ({
  page,
}) => {
  const result = await page.evaluate(() => {
    const { model, scene } = window.__game;
    model.state.settings.reducedMotion = true;
    scene.sync();
    scene.effect({ type: 'destroy', x: 10, y: 10 });
    const entries = [...scene.effectTimeline.entries];
    const smoke = entries[0].config.targets;
    const before = { x: smoke.x, y: smoke.y, scaleX: smoke.scaleX, scaleY: smoke.scaleY };
    model.step(0.2);
    scene.drawOverlay(0);
    const after = { x: smoke.x, y: smoke.y, scaleX: smoke.scaleX, scaleY: smoke.scaleY };
    const alpha = smoke.alpha;
    model.returnHome();
    scene.sync();
    return {
      count: entries.length,
      before,
      after,
      alpha,
      active: smoke.active,
      pending: scene.effectTimeline.entries.size,
    };
  });
  expect(result.count).toBe(1);
  expect(result.after).toEqual(result.before);
  expect(result.alpha).toBeLessThan(1);
  expect(result.alpha).toBeGreaterThan(0);
  expect(result.active).toBe(false);
  expect(result.pending).toBe(0);
});
