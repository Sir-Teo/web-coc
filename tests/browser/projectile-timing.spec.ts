import { useDevelopedVillage } from './developed-village';
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.ready);
  await useDevelopedVillage(page);
  await page.locator('[data-action="skip-tutorial"]').click();
});

for (const reduced of [false, true])
  test(`arrow damage and feedback share battle time${reduced ? ' with reduced motion' : ''}`, async ({
    page,
  }) => {
    const start = await page.evaluate((reduced) => {
      const { model: m, scene } = window.__game;
      scene.paused = true;
      m.state.settings.reducedMotion = reduced;
      m.startBattle(0, true);
      const hall = m.battle.buildings.find((b) => b.kind === 'townhall');
      m.battle.buildings = [hall];
      m.activeTroop = 'archer';
      m.deploy(1, 13);
      const u = m.battle.units[0];
      u.x = hall.x - 2;
      u.y = hall.y + 1;
      u.target = hall.id;
      scene.sync();
      scene.drawOverlay(0);
      m.step(0.05);
      scene.drawOverlay(0);
      const g = scene.children.list.find((g) => g.getData?.('projectileId'));
      return { hp: hall.hp, maxHp: hall.maxHp, pose: g ? { x: g.x, y: g.y } : null };
    }, reduced);
    expect(start.hp).toBe(start.maxHp);
    expect(Boolean(start.pose)).toBe(!reduced);
    await page.waitForTimeout(450);
    const paused = await page.evaluate(() => {
      const { model, scene } = window.__game;
      const g = scene.children.list.find((g) => g.getData?.('projectileId'));
      return {
        pose: g ? { x: g.x, y: g.y } : null,
        hp: model.battle.buildings[0].hp,
        impacts: scene.children.list.filter((g) => g.getData?.('impact')).length,
      };
    });
    expect(paused.pose).toEqual(start.pose);
    expect(paused.hp).toBe(start.hp);
    expect(paused.impacts).toBe(0);
    const middle = await page.evaluate(() => {
      const { model: m, scene } = window.__game;
      const shot = m.battle.projectiles[0];
      m.step((shot.impact - m.battle.elapsed) / 2);
      scene.drawOverlay(0);
      const g = scene.children.list.find((g) => g.getData?.('projectileId'));
      return { pose: g ? { x: g.x, y: g.y } : null, hp: m.battle.buildings[0].hp };
    });
    if (!reduced) expect(middle.pose).not.toEqual(start.pose);
    expect(middle.hp).toBe(start.hp);
    const end = await page.evaluate(() => {
      const { model: m, scene } = window.__game;
      const shot = m.battle.projectiles[0];
      m.step(shot.impact - m.battle.elapsed);
      scene.drawOverlay(0);
      return {
        hp: m.battle.buildings[0].hp,
        power: shot.damage,
        flights: scene.children.list.filter((g) => g.getData?.('projectileId')).length,
        impacts: scene.children.list.map((g) => g.getData?.('impact')).filter(Boolean),
      };
    });
    expect(end.hp).toBe(start.hp - end.power);
    expect(end.flights).toBe(0);
    expect(end.impacts).toContain('arrow');
  });
