import { useDevelopedVillage } from './developed-village';
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await useDevelopedVillage(page);
  await page.locator('[data-action="skip-tutorial"]').click();
  await page.evaluate(() => {
    const { model: m, scene } = window.__game;
    scene.paused = true;
    m.startBattle(0, true);
    const hall = m.battle.buildings.find((b) => b.kind === 'townhall');
    m.battle.buildings = [hall];
    for (const kind of ['archer', 'balloon']) {
      m.activeTroop = kind;
      m.deploy(1, 13);
      const u = m.battle.units.at(-1);
      u.x = hall.x - 2;
      u.y = hall.y + 2;
      u.target = hall.id;
      u.attacking = false;
      u.path = [{ x: u.x - 2, y: u.y }];
    }
    m.battle.elapsed = 1.1;
    scene.sync();
    scene.drawOverlay(1000);
  });
});

test('ground troops turn along their route and turn back toward the target to attack', async ({
  page,
}) => {
  const result = await page.evaluate(() => {
    const { model: m, scene } = window.__game;
    const u = m.battle.units[0],
      im = scene.unitSprites.get(u.id);
    const walking = im.flipX;
    u.attacking = true;
    scene.drawOverlay(1000);
    return { walking, attacking: im.flipX };
  });
  expect(result).toEqual({ walking: false, attacking: true });
});

test('walk cycles and Balloon sway stay fixed without battle time and advance with it', async ({
  page,
}) => {
  const result = await page.evaluate(() => {
    const { model: m, scene } = window.__game;
    const poses = () =>
      [...scene.unitSprites.values()].map((im) => ({
        x: im.x,
        y: im.y,
        frame: im.frame.name,
        angle: im.angle,
      }));
    const before = poses();
    scene.drawOverlay(100000);
    const paused = poses();
    m.battle.elapsed += 0.2;
    scene.drawOverlay(100000);
    return { before, paused, after: poses() };
  });
  expect(result.paused).toEqual(result.before);
  expect(result.after).not.toEqual(result.before);
});

test('reduced motion fixes walking frames and suppresses body bobbing', async ({ page }) => {
  const result = await page.evaluate(() => {
    const { model: m, scene } = window.__game;
    m.state.settings.reducedMotion = true;
    scene.drawOverlay(1000);
    const poses = () =>
      [...scene.unitSprites.values()].map((im) => ({
        y: im.y,
        frame: im.frame.name,
        angle: im.angle,
      }));
    const before = poses();
    m.battle.elapsed += 0.2;
    scene.drawOverlay(1200);
    return { before, after: poses() };
  });
  expect(result.after).toEqual(result.before);
  expect(result.after.every((p) => p.frame === 0 && p.angle === 0)).toBe(true);
});
