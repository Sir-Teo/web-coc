import { test, expect } from '@playwright/test';
test.use({ hasTouch: true });
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.ready);
  await page.locator('#loading').waitFor({ state: 'detached' });
  await page.locator('[data-action="skip-tutorial"]').click();
});
test('shop gates Skeleton Traps at TH8 and loads both modes and all poses', async ({ page }) => {
  await page.locator('.shop-btn').tap();
  await page.locator('[data-action="tab:Traps"]').tap();
  await expect(page.locator('[data-action="build:skeletontrap"]')).toBeDisabled();
  await expect(page.locator('.shop-tile').filter({ hasText: 'Skeleton Trap' })).toContainText(
    'Town Hall 8',
  );
  expect(
    await page.evaluate(() =>
      [
        'skeletontrap-native-1-ground',
        'skeletontrap-native-1-air',
        'skeletontrap-native-1-spent',
        'skeleton-ground',
        'skeleton-air',
      ].every((k) => window.__game.scene.textures.exists(k)),
    ),
  ).toBe(true);
});
for (const width of [1440, 390, 320])
  test(`mode switching, Info, layout restore and reload at ${width}px`, async ({
    page,
    browserName,
  }) => {
    await page.setViewportSize({ width, height: width === 1440 ? 960 : 844 });
    await page.evaluate(async () => {
      const { makeBuilding } = await import('/src/game/model.ts');
      const { model: m, scene } = window.__game;
      m.state.obstacles = [];
      m.state.buildings = [
        makeBuilding(1, 'townhall', 20, 20, 8),
        makeBuilding(2, 'builder', 26, 26),
        makeBuilding(3, 'skeletontrap', 10, 8),
      ];
      m.state.nextId = 4;
      m.selected = 3;
      m.changed();
      scene.sync();
      scene.cameras.main.centerOn(960, 416);
    });
    await page.getByRole('button', { name: 'Switch Skeleton Trap to air mode', exact: true }).tap();
    const mode = page.getByRole('button', {
      name: 'Switch Skeleton Trap to ground mode',
      exact: true,
    });
    await expect(mode).toBeVisible();
    const box = await mode.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    await page.evaluate(() => {
      const m = window.__game.model;
      m.saveLayout(0);
      m.toggleSkeletonMode();
      m.loadLayout(0);
    });
    await page.locator('[data-action="info"]').tap();
    await expect(page.locator('.info-hero')).toContainText('Air mode');
    for (const value of ['Skeletons', '30', '25', '17.5', '0.7s', '5 tiles', '0.6s', '0.15s'])
      await expect(page.locator('.info-table')).toContainText(value);
    await expect(page.locator('.info-cost')).toContainText('250,000');
    await expect(page.locator('.info-cost')).toContainText('5h');
    await expect(page.locator('#toast')).not.toHaveClass(/show/);
    await page.screenshot({ path: `output/playtest/skeleton-info-${width}-${browserName}.png` });
    await page.getByRole('button', { name: 'Close dialog', exact: true }).tap();
    await page.waitForTimeout(1100);
    await page.reload();
    await page.waitForFunction(() => window.__game?.scene.ready);
    expect(
      await page.evaluate(() => {
        const { model: m, scene } = window.__game;
        scene.drawOverlay();
        return [
          m.state.buildings.find((b) => b.id === 3).skeletonMode,
          scene.sprites.get(3).texture.key,
        ];
      }),
    ).toEqual(['air', 'skeletontrap-native-1']);
  });
test('touch placement is instant, caps at two, and level 2 takes five hours', async ({ page }) => {
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
    m.state.gold = 300000;
    m.changed();
    scene.sync();
    scene.cameras.main.centerOn(960, 416);
  });
  await page.locator('.shop-btn').tap();
  await page.locator('[data-action="tab:Traps"]').tap();
  await page.locator('[data-action="build:skeletontrap"]').tap();
  await page.waitForFunction(() => !!window.__game.scene.ghost);
  expect(await page.evaluate(() => window.__game.scene.ghost.texture.key)).toBe(
    'skeletontrap-native-1',
  );
  const p = await page.evaluate(() => window.__game.scene.screenFor(11, 9));
  await page.touchscreen.tap(p.x, p.y);
  expect(
    await page.evaluate(() => {
      const m = window.__game.model,
        t = m.state.buildings.find((b) => b.kind === 'skeletontrap');
      return [!!t.constructing, !!t.upgradeEnd, m.busy, m.countOf('skeletontrap'), m.state.gold];
    }),
  ).toEqual([false, false, 0, 1, 294000]);
  expect(
    await page.evaluate(() => {
      const m = window.__game.model,
        t = m.state.buildings.find((b) => b.kind === 'skeletontrap');
      m.upgrade(t.id);
      const duration = (t.upgradeEnd - t.upgradeStart) / 1000;
      m.tick(t.upgradeEnd + 1);
      m.beginBuild('skeletontrap');
      m.place(13, 9);
      m.beginBuild('skeletontrap');
      return [duration, t.level, m.countOf('skeletontrap'), m.placement];
    }),
  ).toEqual([18000, 2, 2, null]);
});
test('coffins release ground and air defenders with six poses, body hits and stable battle-time presentation', async ({
  page,
  browserName,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const opening = await page.evaluate(async () => {
    const { makeBuilding } = await import('/src/game/model.ts');
    const { model: m, scene } = window.__game;
    m.state.obstacles = [];
    m.state.buildings = [
      makeBuilding(1, 'townhall', 30, 30, 8),
      makeBuilding(2, 'skeletontrap', 10, 10, 2),
      { ...makeBuilding(3, 'skeletontrap', 13, 10, 2), skeletonMode: 'air' },
    ];
    m.state.nextId = 4;
    m.startBattle(0, true);
    m.battle.started = true;
    scene.scene.pause();
    for (const [kind, x] of [
      ['giant', 10.7],
      ['balloon', 13.7],
    ])
      m.battle.units.push({
        id: 990 + m.battle.units.length,
        kind,
        x,
        y: 10.5,
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
    scene.cameras.main.centerOn(960, 444);
    m.step(0.05);
    scene.drawOverlay();
    const before = m.battle.defenders?.length ?? 0;
    m.step(0.3);
    scene.drawOverlay();
    return { before, coffins: [scene.sprites.get(2).visible, scene.sprites.get(3).visible] };
  });
  expect(opening).toEqual({ before: 0, coffins: [true, true] });
  await page.screenshot({ path: `output/playtest/skeleton-coffins-${browserName}.png` });
  const spawn = await page.evaluate(() => {
    const { model: m, scene } = window.__game;
    m.step(0.3);
    scene.drawOverlay();
    return [
      m.battle.defenders.length,
      scene.sprites.get(2).texture.key,
      scene.sprites.get(3).texture.key,
    ];
  });
  expect(spawn).toEqual([2, 'skeletontrap-native-1', 'skeletontrap-native-1']);
  const result = await page.evaluate(async () => {
    const { projectileEffect, launchProjectile } = await import('/src/game/projectiles.ts');
    const { model: m, scene } = window.__game;
    m.step(0.3);
    scene.drawOverlay();
    const count = m.battle.defenders.length;
    for (let i = 0; i < 20; i++) m.step(0.05);
    scene.drawOverlay();
    const d = m.battle.defenders.find((d) => d.mode === 'ground'),
      air = m.battle.defenders.find((d) => d.mode === 'air');
    const originalElapsed = m.battle.elapsed,
      frames = [];
    d.hp = 30;
    d.target = 990;
    d.attacking = false;
    d.spawnedAt = -10;
    for (const t of [1.1, 1.21, 1.32, 1.43]) {
      m.battle.elapsed = t;
      scene.drawOverlay();
      frames.push(scene.defenderSprites.get(d.id).frame.name);
    }
    d.attacking = true;
    for (const c of [0.69, 0.1]) {
      d.cooldown = c;
      scene.drawOverlay();
      frames.push(scene.defenderSprites.get(d.id).frame.name);
    }
    m.battle.elapsed = originalElapsed;
    scene.drawOverlay();
    const a = scene.defenderSprites.get(air.id),
      g = scene.defenderSprites.get(d.id),
      pose = [a.x, a.y, a.frame.name, g.x, g.y, g.frame.name];
    scene.drawOverlay(99999);
    const shot = launchProjectile(
      m.battle,
      {
        weapon: 'arrow',
        sourceId: 990,
        targetId: air.id,
        targetBuilding: false,
        targetDefender: true,
        fromX: 10.7,
        fromY: 10.5,
        x: air.x,
        y: air.y,
        toAir: true,
        damage: 10,
      },
      () => {},
    );
    const anchor = scene.projectileAnchors(projectileEffect(shot, 'projectile')).to;
    return {
      count,
      frames,
      hit: m.battle.units.every((u) => u.hp < 5000),
      stable:
        JSON.stringify(pose) === JSON.stringify([a.x, a.y, a.frame.name, g.x, g.y, g.frame.name]),
      groundDepth: g.depth,
      airDepth: a.depth,
      markerDepth: scene.defenderMarkers.depth,
      anchorBelowBalloonTop: anchor.y > a.y - a.displayHeight * 0.8,
      hidden: !scene.sprites.get(2).visible && !scene.sprites.get(3).visible,
    };
  });
  expect(result.count).toBe(6);
  expect(new Set(result.frames).size).toBe(6);
  expect(result.hit).toBe(true);
  expect(result.stable).toBe(true);
  expect(result.airDepth).toBe(7500);
  expect(result.markerDepth).toBeGreaterThan(result.airDepth);
  expect(result.groundDepth).toBeLessThan(7500);
  expect(result.anchorBelowBalloonTop).toBe(true);
  expect(result.hidden).toBe(true);
  await page.screenshot({ path: `output/playtest/skeleton-defenders-${browserName}.png` });
  expect(errors).toEqual([]);
});
test('replay seeking rebuilds defenders without duplicates and clears them at home', async ({
  page,
  browserName,
}) => {
  const result = await page.evaluate(async () => {
    const { makeBuilding } = await import('/src/game/model.ts');
    const { TROOP_KEYS } = await import('/src/game/data.ts');
    const { makeReplayFile } = await import('/src/game/replay-file.ts');
    const { model: m, scene } = window.__game;
    m.state.obstacles = [];
    m.state.buildings = [
      makeBuilding(1, 'townhall', 30, 30, 8),
      makeBuilding(2, 'skeletontrap', 6, 10, 2),
      { ...makeBuilding(3, 'skeletontrap', 7, 10, 2), skeletonMode: 'air' },
    ];
    m.state.nextId = 4;
    m.state.army = Object.fromEntries(
      TROOP_KEYS.map((k) => [
        k,
        k === 'dragon' ? 3 : k === 'pekka' ? 2 : k === 'giant' ? 2 : k === 'archer' ? 8 : 0,
      ]),
    );
    m.startBattle(0, true);
    scene.scene.pause();
    for (const kind of ['giant', 'pekka', 'dragon', 'archer']) {
      m.activeTroop = kind;
      while (m.battle.remaining[kind]) m.deploy(1, 11);
    }
    for (let i = 0; i < 500; i++) m.step(0.05);
    m.finishBattle();
    const record = m.state.raidLog[0],
      final = JSON.stringify([m.battle.buildings, m.battle.defenders]);
    record.replay = JSON.parse(JSON.stringify(makeReplayFile(record.replay))).replay;
    m.returnHome();
    m.startReplay(record.id);
    const seek = (t) => {
      m.seekReplay(t);
      for (let i = 0; i < 100 && m.replay.seeking; i++) m.step(0.05);
      scene.sync();
      scene.drawOverlay();
      return [
        m.battle.defenders?.length ?? 0,
        scene.defenderSprites.size,
        scene.children.list.filter((o) => o.getData?.('defender') !== undefined).length,
      ];
    };
    const start = seek(0),
      middle = seek(5);
    m.state.settings.reducedMotion = true;
    scene.drawOverlay();
    const reduced = [...scene.defenderSprites.values()]
      .filter((s) => s.visible)
      .every((s) => s.frame.name === 1);
    const back = seek(0),
      again = seek(5);
    if (m.replay.paused) m.toggleReplay();
    for (let i = 0; i < 1000 && !m.replay.complete; i++) m.step(0.1);
    const equal = JSON.stringify([m.battle.buildings, m.battle.defenders]) === final;
    seek(5);
    return { start, middle, back, again, reduced, equal };
  });
  expect(result.start).toEqual([0, 0, 0]);
  expect(result.middle).toEqual([6, 6, 6]);
  expect(result.back).toEqual([0, 0, 0]);
  expect(result.again).toEqual([6, 6, 6]);
  expect(result.reduced).toBe(true);
  expect(result.equal).toBe(true);
  await page.screenshot({ path: `output/playtest/skeleton-replay-${browserName}.png` });
  expect(
    await page.evaluate(() => {
      const { model: m, scene } = window.__game;
      m.returnHome();
      scene.sync();
      scene.drawOverlay();
      return scene.defenderSprites.size;
    }),
  ).toBe(0);
});
