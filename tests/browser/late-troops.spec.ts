import { test, expect } from '@playwright/test';
import { useDevelopedVillage } from './developed-village';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('#loading').waitFor({ state: 'detached' });
  await useDevelopedVillage(page);
  await page.locator('[data-action="skip-tutorial"]').click();
  await page.evaluate(() => {
    const m = window.__game.model;
    m.townhall.level = 8;
    m.state.buildings.find((b) => b.kind === 'barracks').level = 10;
    m.state.buildings.find((b) => b.kind === 'laboratory').level = 6;
    m.state.elixir = 2500000;
    m.clearArmy();
    m.changed();
  });
});

for (const [width, height] of [
  [1440, 960],
  [390, 844],
  [844, 390],
  [568, 320],
]) {
  test(`late troops can be trained, inspected, researched and selected at ${width}×${height}`, async ({
    page,
    browserName,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewportSize({ width, height });
    await page.locator('.train-add').click();
    for (const kind of ['healer', 'dragon', 'pekka']) {
      const train = page.locator(`[data-action="train:${kind}"]`);
      await train.scrollIntoViewIfNeeded();
      await expect(train).toBeEnabled();
      await train.click();
      expect(await page.evaluate((kind) => window.__game.model.state.army[kind], kind)).toBe(1);
    }
    await page.locator('[data-action="troop-info:healer"]').click();
    await expect(page.locator('.troop-stats')).toContainText('Healing per second36');
    await expect(page.locator('.troop-stats')).toContainText('Hero healing per second19.8');
    await expect(page.locator('.troop-stats')).toContainText('Healing range4.5 tiles');
    await page.locator('.modal').evaluate(async (el) => {
      await Promise.all(el.getAnimations().map((a) => a.finished));
    });
    await page.screenshot({ path: `output/playtest/healer-info-${width}-${browserName}.png` });
    await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
    await page.locator('[data-action="research"]').click();
    for (const [kind, stats, cost] of [
      ['healer', /Health 500 → 700.*Healing\/s 36 → 48/, '450,000'],
      ['dragon', /Health 1900 → 2100.*Damage 175 → 200/, '1,000,000'],
      ['pekka', /Health 3000 → 3500.*Damage 468 → 522/, '600,000'],
    ] as const) {
      const card = page.locator(`[data-research-kind="${kind}"]`);
      await card.scrollIntoViewIfNeeded();
      await expect(card.locator('.role-tag')).toContainText('LEVEL 1 OF 3');
      await expect(card.locator('.research-stats')).toHaveText(stats);
      await expect(card.locator('button')).toContainText(cost);
      await expect(card.locator('button')).toBeEnabled();
    }
    await page.locator('[data-action="research-start:healer"]').click();
    expect(await page.evaluate(() => window.__game.model.state.research.kind)).toBe('healer');
    await page.locator('[data-action="research-finish"]').click();
    await expect(page.locator('[data-research-kind="healer"] .research-stats')).toHaveText(
      /Healing\/s 48 → 60/,
    );
    await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
    await page.locator('[data-action="close-drawer"]').click();
    const badgesClearCounts = () => page.locator('.troop-card:has(.air-tag)').evaluateAll((cards) =>
      cards.every((card) => card.querySelector('.air-tag')!.getBoundingClientRect().top >=
        card.querySelector('.troop-count')!.getBoundingClientRect().bottom));
    expect(await badgesClearCounts()).toBe(true);
    await page.locator('.attack-btn').click();
    await page.locator('[data-action="attack:0"]').click();
    for (const [kind, key] of [
      ['healer', 'q'],
      ['dragon', 'w'],
      ['pekka', 'e'],
    ]) {
      await page.keyboard.press(key);
      const card = page.locator(`[data-action="troop:${kind}"]`);
      await expect(card).toHaveClass(/selected/);
      await expect(card).toBeInViewport({ ratio: 1 });
      await expect(card.locator('kbd')).toHaveText(key.toUpperCase());
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    expect(await badgesClearCounts()).toBe(true);
    expect(errors).toEqual([]);
    await page.screenshot({ path: `output/playtest/late-troops-tray-${width}-${browserName}.png` });
  });
}

test('air animation, friendly healing and Dragon breath share the battle clock and clean up on return', async ({
  page,
  browserName,
}) => {
  const result = await page.evaluate(async () => {
    const { model: m, scene } = window.__game;
    const { makeBuilding } = await import('/src/game/model.ts');
    const { iso } = await import('/src/game/scene.ts');
    scene.paused = true;
    m.state.army = { ...m.state.army, giant: 1, healer: 1, dragon: 1, pekka: 1, swordsman: 1 };
    m.startBattle(0, true);
    const b = m.battle;
    b.buildings = [makeBuilding(9000, 'townhall', 10, 10), makeBuilding(9001, 'builder', 30, 30)];
    for (const kind of ['giant', 'healer', 'dragon', 'pekka']) {
      m.activeTroop = kind;
      m.deploy(1, 13);
    }
    const [giant, healer, dragon, pekka] = b.units;
    Object.assign(giant, { x: 9.6, y: 11, hp: 100, cooldown: 100, target: 9000 });
    Object.assign(healer, { x: 6, y: 11, cooldown: 0 });
    Object.assign(dragon, { x: 10, y: 8, cooldown: 0, target: 9000 });
    Object.assign(pekka, { x: 9.5, y: 13.4, cooldown: 100, target: 9000 });
    scene.sync();
    scene.drawOverlay(0);
    m.step(0.05);
    scene.drawOverlay(0);
    const at = iso(10, 11);
    scene.setZoom(1.4);
    scene.cameras.main.centerOn(at.x, at.y - 50);
    const breath = scene.children.list.find((g) => g.getData?.('dragonBreath'));
    const shot = b.projectiles.find((p) => p.weapon === 'healing');
    const sprites = [healer, dragon, pekka].map((u) => {
      const im = scene.unitSprites.get(u.id);
      return {
        kind: u.kind,
        texture: im.texture.key,
        width: im.displayWidth,
        height: im.displayHeight,
        frames: scene.textures.get(`${u.kind}-walk`).frameTotal,
      };
    });
    const fireAnchors = scene.projectileAnchors({ type: 'breath', x: dragon.x, y: dragon.y,
      toX: 10, toY: 10, sourceId: dragon.id, targetId: 9000, targetBuilding: true, fromAir: true });
    const healingAnchors = scene.projectileAnchors({ type: 'projectile', weapon: 'healing',
      x: healer.x, y: healer.y, toX: giant.x, toY: giant.y, sourceId: healer.id,
      targetId: giant.id, targetBuilding: false, fromAir: true });
    return { sprites, shot: shot?.weapon, breath: !!breath, health: giant.hp,
      fireLift: iso(dragon.x, dragon.y).y - fireAnchors.from.y,
      healingLift: iso(healer.x, healer.y).y - healingAnchors.from.y };
  });
  expect(result.breath).toBe(true);
  expect(result.shot).toBe('healing');
  expect(result.health).toBe(100);
  expect(result.fireLift).toBeCloseTo(46 + 102.4 * 0.27);
  expect(result.healingLift).toBeCloseTo(46 + 67.2 * 0.37);
  for (const s of result.sprites) {
    expect(s.texture).toBe(`${s.kind}-walk`);
    expect(s.frames).toBe(5); // Four cells and Phaser's base frame.
    expect(s.width).toBe(s.height);
  }
  const before = await page.evaluate(() => {
    const s = window.__game.scene;
    return [...s.combatEffects.objects].map((g) => ({ x: g.x, y: g.y, alpha: g.alpha }));
  });
  await page.waitForTimeout(400);
  expect(
    await page.evaluate(() =>
      [...window.__game.scene.combatEffects.objects].map((g) => ({
        x: g.x,
        y: g.y,
        alpha: g.alpha,
      })),
    ),
  ).toEqual(before);
  await page.screenshot({ path: `output/playtest/late-troops-battle-${browserName}.png` });
  const after = await page.evaluate(() => {
    const { model: m, scene } = window.__game;
    m.step(0.31);
    scene.drawOverlay(0);
    const health = m.battle.units[0].hp;
    const impact = scene.children.list.some((g) => g.getData?.('impact') === 'healing');
    const healer = m.battle.units[1],
      im = scene.unitSprites.get(healer.id);
    const frames = [];
    for (let i = 0; i < 4; i++) {
      m.battle.elapsed = 1 + i * 0.18;
      scene.drawOverlay(0);
      frames.push(im.frame.name);
    }
    m.state.settings.reducedMotion = true;
    scene.drawOverlay(0);
    const reducedFrame = im.frame.name;
    m.returnHome();
    scene.sync();
    return { health, impact, frames, reducedFrame, effects: scene.combatEffects.objects.size };
  });
  expect(after.health).toBeCloseTo(125.2);
  expect(after.impact).toBe(true);
  expect(new Set(after.frames).size).toBe(4);
  expect(after.reducedFrame).toBe(1);
  expect(after.effects).toBe(0);
});
