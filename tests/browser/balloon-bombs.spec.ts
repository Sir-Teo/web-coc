import { useDevelopedVillage } from './developed-village';
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await useDevelopedVillage(page);
  await page.locator('#loading').waitFor({ state: 'detached' });
  await page.locator('[data-action="skip-tutorial"]').click();
});

test('bombs fall toward the approached edge from every side of a Town Hall', async ({ page }) => {
  const shots = await page.evaluate(() => {
    const { model: m, scene } = window.__game;
    scene.paused = true;
    m.state.army.balloon = 4;
    m.state.army.swordsman = 0;
    m.startBattle(0, true);
    const hall = m.battle.buildings.find((b) => b.kind === 'townhall');
    hall.x = 10;
    hall.y = 10;
    m.battle.buildings = [hall];
    for (const [x, y] of [
      [9.5, 11],
      [14.5, 11],
      [11, 9.5],
      [11, 14.5],
    ]) {
      m.activeTroop = 'balloon';
      m.deploy(1, 13);
      const u = m.battle.units.at(-1);
      u.x = x;
      u.y = y;
      u.target = hall.id;
    }
    scene.sync();
    scene.drawOverlay(0);
    m.step(0.05);
    return m.battle.projectiles.map((p) => ({
      point: { x: p.x, y: p.y },
      anchors: scene.projectileAnchors({
        type: 'projectile',
        weapon: p.weapon,
        x: p.fromX,
        y: p.fromY,
        toX: p.x,
        toY: p.y,
        sourceId: p.sourceId,
        targetId: p.targetId,
        targetBuilding: true,
        fromAir: true,
      }),
    }));
  });
  expect(shots).toHaveLength(4);
  expect(shots.map((p) => p.point)).toEqual([
    { x: 10, y: 11 },
    { x: 14, y: 11 },
    { x: 11, y: 10 },
    { x: 11, y: 14 },
  ]);
  for (const shot of shots) expect(shot.anchors.to.y).toBeGreaterThan(shot.anchors.from.y);
});

test('a real bomb draws its ground blast below the Balloon and damages nearby building edges', async ({
  page,
}) => {
  const result = await page.evaluate(() => {
    const { model: m, scene } = window.__game;
    scene.paused = true;
    m.startBattle(0, true);
    const hall = m.battle.buildings.find((b) => b.kind === 'townhall');
    const hut = m.battle.buildings.find((b) => b.kind === 'builder');
    hall.x = 10;
    hall.y = 10;
    hut.x = 8;
    hut.y = 12;
    m.battle.buildings = [hall, hut];
    m.activeTroop = 'balloon';
    m.deploy(1, 13);
    const u = m.battle.units[0];
    u.x = 9.5;
    u.y = 11;
    u.target = hall.id;
    scene.sync();
    scene.drawOverlay(0);
    m.step(0.05);
    const power = m.battle.projectiles[0].damage;
    const before = hut.hp;
    m.step(0.34);
    scene.drawOverlay(0);
    const blast = scene.children.list.find((g) => g.getData?.('blastRadius'));
    // Hold a native impact frame for visual review, including pending tweens.
    scene.tweens.timeScale = 0;
    scene.ambientUnits.forEach((im) => im.setVisible(false));
    return {
      before,
      after: hut.hp,
      power,
      radius: blast?.getData('blastRadius'),
      depth: blast?.depth,
      airDepth: scene.unitSprites.get(u.id).depth,
    };
  });
  expect(result.after).toBe(result.before - result.power);
  expect(result.radius).toBe(1.2);
  expect(result.depth).toBeLessThan(result.airDepth);
  await page.waitForTimeout(100);
  await page.screenshot({ path: 'output/playtest/balloon-ground-blast.png' });
});

test('Balloon information explains splash and fits a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.train-add').click();
  await page.getByRole('button', { name: 'About Balloon', exact: true }).click();
  await expect(page.locator('.troop-stats')).toContainText('Attack splash');
  await expect(page.locator('.troop-stats')).toContainText('1.2 tiles');
  await expect(page.locator('.troop-tactic')).toContainText('Bombs damage nearby buildings');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.waitForTimeout(350);
  await page.screenshot({ path: 'output/playtest/balloon-info-phone.png' });
});
