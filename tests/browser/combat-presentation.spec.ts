import { useDevelopedVillage } from './developed-village';
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.ready);
  await useDevelopedVillage(page);
  await page.locator('[data-action="skip-tutorial"]').click();
});

test('destroyed stone, timber and walls become grounded rubble with intact aspect ratios', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.evaluate(() => {
    const { model, scene } = window.__game;
    model.state.settings.reducedMotion = true;
    model.startBattle(0);
    for (const kind of ['townhall', 'barracks', 'wall']) {
      const building = model.battle.buildings.find((b) => b.kind === kind);
      model.damage(building, building.maxHp);
    }
    scene.sync();
  });
  const ruins = await page.evaluate(() => {
    const { model, scene } = window.__game;
    return ['townhall', 'barracks', 'wall'].map((kind) => {
      const b = model.battle.buildings.find((b) => b.kind === kind);
      const sprite = scene.sprites.get(b.id);
      return {
        kind,
        hp: b.hp,
        texture: sprite.texture.key,
        alpha: sprite.alpha,
        actualRatio: sprite.displayWidth / sprite.displayHeight,
        sourceRatio: sprite.width / sprite.height,
        depth: sprite.depth,
        ground: sprite.y,
      };
    });
  });
  for (const ruin of ruins) {
    expect(ruin.hp).toBe(0);
    expect(ruin.texture).toBe(ruin.kind === 'barracks' ? 'ruins-wood' : 'ruins-stone');
    expect(ruin.alpha).toBe(1);
    expect(ruin.actualRatio).toBeCloseTo(ruin.sourceRatio, 5);
    expect(ruin.depth).toBeLessThan(ruin.ground);
  }
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'output/playtest/ruins-desktop.png' });
  expect(errors).toEqual([]);
});

test('returning from a destroyed practice village restores every home building', async ({
  page,
}) => {
  const result = await page.evaluate(() => {
    const { model, scene } = window.__game;
    const before = model.state.buildings.map((b) => [b.id, b.hp]);
    const presentation = () =>
      model.state.buildings.map((b) => {
        const s = scene.sprites.get(b.id)!;
        return [b.id, s.texture.key, s.originX, s.originY, s.displayWidth, s.displayHeight];
      });
    const beforeArt = presentation();
    model.startBattle(0, true);
    for (const b of model.battle.buildings) model.damage(b, b.maxHp);
    scene.sync();
    const rubble = [...scene.sprites.values()].filter((s) =>
      s.texture.key.startsWith('ruins-'),
    ).length;
    model.finishBattle();
    model.returnHome();
    scene.sync();
    return {
      before,
      after: model.state.buildings.map((b) => [b.id, b.hp]),
      rubble,
      remainingRuins: [...scene.sprites.values()].filter((s) => s.texture.key.startsWith('ruins-'))
        .length,
      beforeArt,
      afterArt: presentation(),
      scars: scene.ruinStamped.size,
      scarLayerShown: !!scene.ruinDecals?.visible,
    };
  });
  expect(result.rubble).toBeGreaterThan(30);
  expect(result.after).toEqual(result.before);
  expect(result.remainingRuins).toBe(0);
  expect(result.afterArt).toEqual(result.beforeArt);
  // The ruin ground layer is emptied and hidden at home.
  expect(result.scars).toBe(0);
  expect(result.scarLayerShown).toBe(false);
});

test('real troop attacks draw distinct weapons and a scene transition cancels their impacts', async ({
  page,
}) => {
  const result = await page.evaluate(() => {
    const { model, scene } = window.__game;
    model.startBattle(0);
    scene.sync();
    for (const kind of ['archer', 'wizard', 'balloon']) {
      model.activeTroop = kind;
      model.deploy(4, 11);
    }
    const hall = model.battle.buildings.find((b) => b.kind === 'townhall');
    for (const u of model.battle.units) {
      u.x = hall.x - 0.2;
      u.y = hall.y + 1;
      u.target = hall.id;
      u.cooldown = 0;
    }
    scene.sync();
    scene.drawOverlay(0);
    model.step(0.05);
    const weapons = scene.children.list.map((g) => g.getData?.('weapon')).filter(Boolean);
    model.finishBattle();
    model.returnHome();
    scene.sync();
    return { weapons, pending: scene.combatEffects.objects.size };
  });
  expect(result.weapons).toEqual(expect.arrayContaining(['arrow', 'fireball', 'bomb']));
  expect(result.pending).toBe(0);
  await page.waitForTimeout(600);
  expect(await page.evaluate(() => window.__game.scene.combatEffects.objects.size)).toBe(0);
});

test('reduced-motion hits keep impact feedback without moving projectiles', async ({ page }) => {
  const result = await page.evaluate(() => {
    const { model, scene } = window.__game;
    model.state.settings.reducedMotion = true;
    scene.effect({
      type: 'projectile',
      weapon: 'rocket',
      x: 8,
      y: 8,
      toX: 12,
      toY: 12,
      toAir: true,
    });
    scene.effect({ type: 'hit', x: 8, y: 8, toX: 12, toY: 12 });
    return {
      projectiles: scene.children.list.filter((g) => g.getData?.('weapon')).length,
      impacts: scene.children.list.map((g) => g.getData?.('impact')).filter(Boolean),
    };
  });
  expect(result.projectiles).toBe(0);
  expect(result.impacts).toEqual(expect.arrayContaining(['rocket', 'melee']));
  await expect
    .poll(() => page.evaluate(() => window.__game.scene.combatEffects.objects.size))
    .toBe(0);
});

test('switching to reduced motion cancels a shot already in flight', async ({ page }) => {
  const state = await page.evaluate(() => {
    const { model, scene } = window.__game;
    scene.effect({
      type: 'projectile',
      weapon: 'bomb',
      x: 10,
      y: 10,
      toX: 12,
      toY: 12,
      fromAir: true,
    });
    const before = scene.combatEffects.objects.size;
    model.state.settings.reducedMotion = true;
    model.changed();
    scene.sync();
    return { before, after: scene.combatEffects.objects.size };
  });
  expect(state.before).toBeGreaterThan(0);
  expect(state.after).toBe(0);
});
