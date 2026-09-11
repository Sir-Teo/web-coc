import { useDevelopedVillage } from './developed-village';
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.ready);
  await useDevelopedVillage(page);
  await page.locator('#loading').waitFor({ state: 'detached' });
  await page.locator('[data-action="skip-tutorial"]').click();
});

test('camp occupants match army edits, including one Giant rather than five housing spaces', async ({
  page,
}) => {
  await page.locator('.train-add').click();
  await page.locator('[data-action="clear-army"]').click();
  await expect.poll(() => page.evaluate(() => window.__game.scene.ambientUnits.length)).toBe(0);
  await page.locator('[data-action="train:giant"]').click();
  await expect
    .poll(() =>
      page.evaluate(() => window.__game.scene.ambientUnits.map((im) => im.getData('kind'))),
    )
    .toEqual(['giant']);
  for (const kind of ['goblin', 'wallbreaker', 'balloon'])
    await page.locator(`[data-action="train:${kind}"]`).click();
  await expect
    .poll(() =>
      page.evaluate(() => window.__game.scene.ambientUnits.map((im) => im.getData('kind')).sort()),
    )
    .toEqual(['balloon', 'giant', 'goblin', 'wallbreaker']);
  const result = await page.evaluate(() => {
    const { model, scene } = window.__game;
    const balloon = scene.ambientUnits.find((im) => im.getData('kind') === 'balloon');
    return {
      armySize: model.armySize,
      individualCount: scene.ambientUnits.length,
      balloonDepth: balloon.depth,
      shadowCommands: scene.campShadows.commandBuffer.length,
      textures: scene.ambientUnits.map((im) => im.texture.key),
    };
  });
  expect(result.armySize).toBe(13);
  expect(result.individualCount).toBe(4);
  expect(result.balloonDepth).toBe(6500);
  expect(result.shadowCommands).toBeGreaterThan(10);
  expect(result.textures).toEqual(expect.arrayContaining(['goblin-walk', 'wallbreaker-walk']));
  await page.locator('[data-action="clear-army"]').click();
  await expect
    .poll(() =>
      page.evaluate(() => ({
        count: window.__game.scene.ambientUnits.length,
        views: window.__game.scene.campViews.size,
      })),
    )
    .toEqual({ count: 0, views: 0 });
});

test('reduced motion freezes the current camp positions and battle transitions restore the roster', async ({
  page,
}) => {
  await page.evaluate(() => {
    const { model, scene } = window.__game;
    model.state.settings.reducedMotion = true;
    model.changed();
    scene.sync();
  });
  const read = () =>
    page.evaluate(() =>
      window.__game.scene.ambientUnits.map((im) => ({
        id: im.getData('campActor'),
        x: im.x,
        y: im.y,
        frame: im.frame.name,
        visible: im.visible,
      })),
    );
  const before = await read();
  expect(before.length).toBeGreaterThan(8);
  await page.waitForTimeout(500);
  expect(await read()).toEqual(before);
  await page.evaluate(() => {
    const { model, scene } = window.__game;
    model.startBattle(0, true);
    scene.sync();
  });
  expect((await read()).every((im) => !im.visible)).toBe(true);
  await page.evaluate(() => {
    const { model, scene } = window.__game;
    model.finishBattle();
    model.returnHome();
    scene.sync();
  });
  expect(await read()).toEqual(before);
});

test('all four completed camps host troops, moved camps reanchor, and construction stays empty', async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { makeBuilding } = await import('/src/game/model.ts');
    const { model, scene } = window.__game;
    model.state.settings.reducedMotion = true;
    const camps = [
      makeBuilding(8001, 'camp', 3, 3, 8),
      makeBuilding(8002, 'camp', 20, 3, 8),
      makeBuilding(8003, 'camp', 3, 20, 8),
      makeBuilding(8004, 'camp', 20, 20, 8),
    ];
    model.state.buildings = camps;
    model.state.army = {
      swordsman: 660,
      archer: 0,
      giant: 0,
      wizard: 0,
      balloon: 0,
      goblin: 0,
      wallbreaker: 0,
    };
    scene.sync();
    const count = scene.ambientUnits.length;
    const occupied = [...new Set(scene.ambientUnits.map((im) => im.getData('campId')))];
    model.state.army.swordsman = 4;
    scene.sync();
    const before = scene.ambientUnits[0].x;
    camps[0].x += 6;
    scene.sync();
    const after = scene.ambientUnits[0].x;
    camps[0].constructing = true;
    scene.sync();
    return {
      count,
      occupied,
      before,
      after,
      remaining: scene.ambientUnits.length,
      campIds: scene.ambientUnits.map((im) => im.getData('campId')),
      views: scene.campViews.size,
    };
  });
  expect(result.count).toBe(660);
  expect(result.occupied).toEqual([8001, 8002, 8003, 8004]);
  expect(result.after).not.toBe(result.before);
  expect(result.remaining).toBe(4);
  expect(result.views).toBe(4);
  expect(result.campIds).not.toContain(8001);
});

test('mixed camp occupants remain visible on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    const { model, scene } = window.__game;
    model.state.settings.reducedMotion = true;
    model.state.army = {
      swordsman: 2,
      archer: 2,
      giant: 1,
      wizard: 1,
      balloon: 1,
      goblin: 2,
      wallbreaker: 1,
    };
    model.changed();
    scene.sync();
    const camp = model.state.buildings.find((b) => b.kind === 'camp');
    scene.cameras.main.setZoom(scene.baseZoom * 1.5);
    scene.cameras.main.centerOn(896 + (camp.x - camp.y) * 32, 112 + (camp.x + camp.y + 4) * 16);
  });
  await page.waitForTimeout(250);
  await page.screenshot({ path: 'output/playtest/camp-roster-phone.png' });
  expect(
    await page.evaluate(() => window.__game.scene.ambientUnits.filter((im) => im.visible).length),
  ).toBe(10);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});
