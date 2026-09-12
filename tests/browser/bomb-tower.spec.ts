import { test, expect } from '@playwright/test';
test.use({ hasTouch: true });
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.ready);
  await page.locator('#loading').waitFor({ state: 'detached' });
  await page.locator('[data-action="skip-tutorial"]').click();
});
test('Bomb Tower shop gate and all thirteen native portraits load', async ({ page }) => {
  await page.locator('.shop-btn').tap();
  await page.locator('[data-action="tab:Defenses"]').tap();
  await expect(page.locator('[data-action="build:bombtower"]')).toBeDisabled();
  await expect(page.locator('.shop-tile').filter({ hasText: 'Bomb Tower' })).toContainText(
    'Town Hall 8',
  );
  expect(
    await page.evaluate(() =>
      Array.from({ length: 13 }, (_, i) => (i === 0 ? 'bombtower' : `bombtower-${i + 1}`)).every(
        (k) => window.__game.scene.textures.exists(k),
      ),
    ),
  ).toBe(true);
});
for (const width of [1440, 390, 320])
  test(`inspect both Bomb Tower levels and reload at ${width}px`, async ({ page, browserName }) => {
    await page.setViewportSize({ width, height: width === 1440 ? 960 : 844 });
    await page.evaluate(async () => {
      const { makeBuilding } = await import('/src/game/model.ts');
      const { model: m, scene } = window.__game;
      m.state.obstacles = [];
      m.state.buildings = [
        makeBuilding(1, 'townhall', 20, 20, 8),
        makeBuilding(2, 'builder', 26, 26),
        makeBuilding(3, 'bombtower', 10, 8),
      ];
      m.state.nextId = 4;
      m.selected = 3;
      m.changed();
      scene.sync();
      scene.drawOverlay();
      scene.cameras.main.centerOn(960, 432);
    });
    await page.locator('[data-action="info"]').tap();
    const table = page.locator('.info-table');
    for (const value of ['650', '700', '26.4', '30.8', '150', '180', '2.75 tiles', '1.1s', '1s'])
      await expect(table).toContainText(value);
    await page.waitForTimeout(250);
    await page.screenshot({ path: `output/playtest/bombtower-info-${width}-${browserName}.png` });
    await page.getByRole('button', { name: 'Close dialog', exact: true }).tap();
    await page.evaluate(() => {
      const m = window.__game.model,
        t = m.state.buildings.find((b) => b.id === 3);
      t.level = 2;
      t.hp = t.maxHp = 700;
      m.changed();
    });
    await page.waitForTimeout(1100);
    await page.reload();
    await page.waitForFunction(() => window.__game?.scene.ready);
    expect(
      await page.evaluate(() => {
        const { model: m, scene } = window.__game;
        scene.drawOverlay();
        const base = scene.sprites.get(3),
          actor = scene.bombTowerPresentation.defenders.get(3)?.objects[0];
        return [
          m.state.buildings.find((b) => b.id === 3).level,
          base.texture.key,
          base.alpha,
          actor?.getData('nativeBomber').action,
          scene.bombTowerPresentation.defenders.get(3)?.objects.length > 0,
        ];
      }),
    ).toEqual([2, 'bombtower-2', 0, 'idle', true]);
  });
test('touch placement includes the Bomber, then construction and upgrade use real timers', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(async () => {
    const { makeBuilding } = await import('/src/game/model.ts');
    const { model: m, scene } = window.__game;
    m.state.obstacles = [];
    m.state.buildings = [
      makeBuilding(1, 'townhall', 20, 20, 8),
      makeBuilding(2, 'builder', 26, 26),
    ];
    m.state.nextId = 3;
    m.state.gold = 700000;
    m.changed();
    scene.sync();
    scene.cameras.main.centerOn(960, 432);
  });
  await page.locator('.shop-btn').tap();
  await page.locator('[data-action="tab:Defenses"]').tap();
  await page.locator('[data-action="build:bombtower"]').tap();
  await page.waitForFunction(() => !!window.__game.scene.ghost);
  expect(await page.evaluate(() => window.__game.scene.ghost.texture.key)).toBe('bombtower');
  const p = await page.evaluate(() => window.__game.scene.screenFor(11, 9));
  await page.touchscreen.tap(p.x, p.y);
  expect(
    await page.evaluate(() => {
      const { model: m, scene } = window.__game,
        t = m.state.buildings.find((b) => b.kind === 'bombtower');
      scene.sync();
      scene.drawOverlay();
      return [
        t.constructing,
        (t.upgradeEnd - t.upgradeStart) / 1000,
        m.busy,
        m.countOf('bombtower'),
        scene.bombTowerPresentation.defenders.has(t.id),
      ];
    }),
  ).toEqual([true, 43200, 1, 1, false]);
  expect(
    await page.evaluate(() => {
      const { model: m, scene } = window.__game,
        t = m.state.buildings.find((b) => b.kind === 'bombtower');
      m.tick(t.upgradeEnd + 1);
      m.state.gold = 1000000;
      m.upgrade(t.id);
      const started = !!t.upgradeEnd,
        duration = (t.upgradeEnd - t.upgradeStart) / 1000;
      m.tick(t.upgradeEnd + 1);
      scene.sync();
      scene.drawOverlay();
      return [
        started,
        duration,
        t.level,
        t.hp,
        scene.sprites.get(t.id).texture.key,
        scene.bombTowerPresentation.defenders.has(t.id),
      ];
    }),
  ).toEqual([true, 64800, 2, 700, 'bombtower-2', true]);
});
test('Bomber poses, ballistic shadow and exposed fuse follow battle time through destruction', async ({
  page,
  browserName,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.evaluate(async () => {
    const { makeBuilding } = await import('/src/game/model.ts');
    const { model: m, scene } = window.__game;
    m.state.obstacles = [];
    m.state.buildings = [
      makeBuilding(1, 'townhall', 30, 30, 8),
      makeBuilding(2, 'bombtower', 6, 10, 2),
    ];
    m.state.nextId = 3;
    m.startBattle(0, true);
    m.battle.started = true;
    scene.paused = true;
    m.battle.units.push({
      id: 999,
      kind: 'giant',
      x: 12,
      y: 11.5,
      hp: 5000,
      maxHp: 5000,
      cooldown: 99,
      target: null,
      path: [],
      pathAt: 0,
      attacking: false,
      springUntil: 1000,
    });
    scene.sync();
    scene.cameras.main.centerOn(820, 410);
    m.step(0.05);
    scene.drawOverlay();
  });
  const poses = await page.evaluate(() => {
    const { model: m, scene } = window.__game,
      t = m.battle.buildings.find((b) => b.id === 2),
      frames = [];
    const at = m.battle.elapsed;
    const actorPose = () =>
      scene.bombTowerPresentation.defenders.get(2).objects[0].getData('nativeBomber');
    for (const age of [0, 3 / 24, 9 / 24, 10 / 24]) {
      m.battle.elapsed = at + age;
      scene.drawOverlay();
      const pose = actorPose();
      frames.push([pose.action, Math.floor(pose.time * 24 + 1e-9)]);
    }
    m.battle.elapsed = at;
    t.cooldown = 10;
    m.step(0.2);
    scene.drawOverlay();
    const shot = m.battle.projectiles[0],
      view = scene.bombTowerPresentation.projectiles.get(shot.id),
      g = view.objects[0];
    return {
      frames,
      flight: g.getData('nativeBombProjectile').progress,
      y: g.y,
      landing: 112 + (shot.x + shot.y) * 16,
      shadow: scene.bombTowerPresentation.shadows.has(shot.id),
    };
  });
  expect(poses.frames.slice(0, 3)).toEqual([
    ['attack', 11],
    ['attack', 14],
    ['attack', 20],
  ]);
  expect(poses.frames[3][0]).toBe('idle');
  expect(poses.shadow).toBe(true);
  expect(poses.flight).toBeGreaterThan(0);
  expect(poses.flight).toBeLessThan(1);
  expect(poses.y).toBeLessThan(poses.landing);
  await page.screenshot({ path: `output/playtest/bombtower-flight-${browserName}.png` });
  const armed = await page.evaluate(async () => {
    const { projectileEffect } = await import('/src/game/projectiles.ts');
    const { model: m, scene } = window.__game,
      t = m.battle.buildings.find((b) => b.id === 2),
      shot = m.battle.projectiles[0];
    const from = scene.projectileAnchors(projectileEffect(shot, 'projectile')).from;
    m.damage(t, 9999);
    scene.sync();
    scene.drawOverlay();
    const bomb = scene.bombTowerPresentation.bombs.get(2)?.objects[0],
      pose = [bomb.x, bomb.y, JSON.stringify(bomb.vertices)];
    scene.drawOverlay(999999);
    return {
      before: from,
      after: scene.projectileAnchors(projectileEffect(shot, 'projectile')).from,
      actor: scene.bombTowerPresentation.defenders.has(2),
      ruin: scene.bombTowerPresentation.towers.get(2).objects[0].getData('nativeBombTower').state,
      bomb: [bomb.x, bomb.y],
      depth: bomb.depth,
      poseUnchanged:
        JSON.stringify(pose) === JSON.stringify([bomb.x, bomb.y, JSON.stringify(bomb.vertices)]),
    };
  });
  expect(armed.before).toEqual(armed.after);
  expect(armed.actor).toBe(false);
  expect(armed.ruin).toBe('ruin');
  expect(armed.bomb).toEqual([768, 416]);
  expect(armed.depth).toBe(416.5);
  expect(armed.poseUnchanged).toBe(true);
  await page.screenshot({ path: `output/playtest/bombtower-fuse-${browserName}.png` });
  const blast = await page.evaluate(() => {
    const { model: m, scene } = window.__game;
    const u = m.battle.units[0];
    u.x = 7.5;
    m.step(0.999);
    scene.drawOverlay();
    const visible = scene.bombTowerPresentation.bombs.has(2);
    m.step(0.001);
    scene.drawOverlay();
    return {
      visible,
      after: scene.bombTowerPresentation.bombs.has(2),
      hp: u.hp,
      blasts: scene.children.list
        .filter((o) => o.getData?.('impact') === 'towerbomb')
        .map((o) => o.getData('blastRadius')),
    };
  });
  expect(blast.visible).toBe(true);
  expect(blast.after).toBe(false);
  expect(blast.hp).toBe(4820);
  expect(blast.blasts).toContain(2.75);
  await page.screenshot({ path: `output/playtest/bombtower-blast-${browserName}.png` });
  expect(errors).toEqual([]);
});
test('replay seeks rebuild the roof actor and pending bomb without duplicates; reduced motion keeps the fuse readable', async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { makeBuilding } = await import('/src/game/model.ts');
    const { model: m, scene } = window.__game;
    m.state.obstacles = [];
    m.state.buildings = [
      makeBuilding(1, 'townhall', 30, 30, 8),
      makeBuilding(2, 'bombtower', 6, 10, 2),
    ];
    m.state.nextId = 3;
    m.state.army.dragon = 3;
    m.state.army.giant = 2;
    m.startBattle(0, true);
    scene.paused = true;
    for (const kind of ['giant', 'dragon']) {
      m.activeTroop = kind;
      while (m.battle.remaining[kind]) m.deploy(1, 11);
    }
    for (let i = 0; i < 500; i++) m.step(0.05);
    const at = m.battle.deathBombs[2].armedAt;
    m.finishBattle();
    m.returnHome();
    m.startReplay(m.state.raidLog[0].id);
    const counts = () => [
      Number(scene.bombTowerPresentation.defenders.has(2)),
      Number(scene.bombTowerPresentation.bombs.has(2)),
    ];
    const seek = (t) => {
      m.seekReplay(t);
      for (let i = 0; i < 100 && m.replay.seeking; i++) m.step(0.05);
      scene.sync();
      scene.drawOverlay();
      return counts();
    };
    const start = seek(0),
      fuse = seek(at + 0.3);
    m.state.settings.reducedMotion = true;
    scene.sync();
    scene.drawOverlay();
    const bomb = scene.bombTowerPresentation.bombs.get(2)?.objects[0],
      tint = bomb?.alpha;
    const finished = seek(at + 1.2),
      again = seek(0);
    return { start, fuse, tint, finished, again };
  });
  expect(result).toEqual({
    start: [1, 0],
    fuse: [0, 1],
    tint: 1,
    finished: [0, 0],
    again: [1, 0],
  });
});
