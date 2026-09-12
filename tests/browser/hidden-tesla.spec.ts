import { test, expect, type Page } from '@playwright/test';

const paint = (page: Page) =>
  page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
test.use({ hasTouch: true });
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.ready);
  await page.locator('#loading').waitFor({ state: 'detached' });
  await page.locator('[data-action="skip-tutorial"]').click();
});

test('Tesla shop gate and all 17 native level textures load', async ({ page }) => {
  await page.locator('.shop-btn').tap();
  await page.locator('[data-action="tab:Defenses"]').tap();
  await expect(page.locator('[data-action="build:tesla"]')).toBeDisabled();
  await expect(page.locator('.shop-tile').filter({ hasText: 'Hidden Tesla' })).toContainText(
    'Town Hall 7',
  );
  expect(
    await page.evaluate(() =>
      Array.from({ length: 17 }, (_, i) => (i === 0 ? 'tesla' : `tesla-${i + 1}`)).every((k) =>
        window.__game.scene.textures.exists(k),
      ),
    ),
  ).toBe(true);
});

for (const width of [1440, 390, 320])
  test(`inspect Tesla progression and reload level six at ${width}px`, async ({
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
        makeBuilding(3, 'tesla', 10, 8, 6),
      ];
      m.state.nextId = 4;
      m.selected = 3;
      m.changed();
      scene.sync();
      scene.cameras.main.centerOn(960, 432);
    });
    await page.locator('[data-action="info"]').tap();
    await expect(page.locator('.info-table')).toContainText('75');
    await expect(page.locator('.info-table')).toContainText('7 tiles');
    await expect(page.locator('.info-table')).toContainText('0.6s');
    await expect(page.locator('.info-table')).toContainText('6 tiles');
    await expect(page.locator('.info-table')).toContainText('51% destruction');
    await expect(page.locator('.info-table')).toBeVisible();
    await page.waitForTimeout(250);
    await paint(page);
    await page.screenshot({ path: `output/playtest/tesla-info-${width}-${browserName}.png` });
    await page.getByRole('button', { name: 'Close dialog', exact: true }).tap();
    await page.waitForTimeout(1100);
    await page.reload();
    await page.waitForFunction(() => window.__game?.scene.ready);
    expect(
      await page.evaluate(() => {
        const { model: m, scene } = window.__game;
        return [
          m.state.buildings.find((b) => b.id === 3).level,
          scene.sprites.get(3).texture.key,
          scene.sprites.get(3).visible,
        ];
      }),
    ).toEqual([6, 'tesla-6', true]);
  });

for (const kind of ['giant', 'dragon'] as const)
  test(`concealment, emergence and electrical hit on ${kind}`, async ({ page, browserName }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.evaluate(async (kind) => {
      const { makeBuilding } = await import('/src/game/model.ts');
      const { model: m, scene } = window.__game;
      m.state.obstacles = [];
      m.state.buildings = [
        makeBuilding(1, 'townhall', 20, 20, 8),
        makeBuilding(2, 'builder', 26, 26),
        makeBuilding(3, 'tesla', 6, 10, 6),
      ];
      m.state.nextId = 4;
      m.state.army[kind] = 3;
      m.startBattle(0, true);
      scene.scene.pause();
      scene.sync();
      scene.drawOverlay();
      scene.cameras.main.centerOn(768, 400);
      m.activeTroop = kind;
    }, kind);
    const hidden = await page.evaluate(() => {
      const { model: m, scene } = window.__game;
      return {
        visible: scene.sprites.get(3).visible,
        blocked: m.deployBlocked(7, 11),
        pick: scene.pickBuilding(768, 400, { x: 7, y: 11 })?.id ?? null,
        text: JSON.parse(window.render_game_to_text()).buildings.some((b) => b.type === 'tesla'),
        signature: scene.boundary.signature,
        native: scene.teslaPresentation.towers.size,
      };
    });
    expect(hidden.native).toBe(0);
    expect(hidden.visible).toBe(false);
    expect(hidden.blocked).toBe(false);
    expect(hidden.pick).toBe(null);
    expect(hidden.text).toBe(false);
    await paint(page);
    await page.screenshot({ path: `output/playtest/tesla-hidden-${kind}-${browserName}.png` });
    const rise = await page.evaluate(() => {
      const { model: m, scene } = window.__game;
      m.deploy(1, 11);
      m.step(0.05);
      scene.sync();
      scene.drawOverlay();
      for (let i = 0; i < 4; i++) m.step(0.05);
      scene.drawOverlay();
      return {
        native: scene.teslaPresentation.towers.get(3).objects.length,
        dust: scene.teslaPresentation.reveals.get(3).meshes.size,
        alpha: scene.sprites.get(3).alpha,
        visible: scene.sprites.get(3).visible,
        cropped: scene.sprites.get(3).isCropped,
        blocked: m.deployBlocked(7, 11),
        signature: scene.boundary.signature,
      };
    });
    expect(rise.visible).toBe(true);
    expect(rise.cropped).toBe(false);
    expect(rise.alpha).toBe(0);
    expect(rise.native).toBeGreaterThan(0);
    expect(rise.dust).toBeGreaterThan(0);
    expect(rise.blocked).toBe(true);
    expect(rise.signature).not.toBe(hidden.signature);
    await paint(page);
    await page.screenshot({ path: `output/playtest/tesla-rise-${kind}-${browserName}.png` });
    const hit = await page.evaluate(() => {
      const { model: m, scene } = window.__game;
      for (let i = 0; i < 12; i++) m.step(0.05);
      scene.sync();
      scene.drawOverlay();
      const zap = scene.children.list.find((o) => o.getData?.('teslaZap'))?.getData('teslaZap');
      return {
        zap,
        cropped: scene.sprites.get(3).isCropped,
        hp: m.battle.units[0].hp,
        maxHp: m.battle.units[0].maxHp,
        projectiles: m.battle.projectiles ?? [],
      };
    });
    expect(hit.zap).toBeDefined();
    expect(hit.zap.from.y).toBeLessThan(320);
    expect(hit.cropped).toBe(false);
    expect(hit.hp).toBeLessThan(hit.maxHp);
    expect(hit.projectiles).toHaveLength(0);
    await paint(page);
    await page.screenshot({ path: `output/playtest/tesla-zap-${kind}-${browserName}.png` });
    await page.evaluate(() => {
      const { model: m, scene } = window.__game;
      for (let i = 0; i < 80; i++) m.step(0.05);
      m.finishBattle();
      m.returnHome();
      m.startReplay(m.state.raidLog[0].id);
      m.seekReplay(0);
      for (let i = 0; i < 50 && m.replay.seeking; i++) m.step(0.05);
      scene.sync();
      scene.drawOverlay();
    });
    expect(
      await page.evaluate(() => [
        window.__game.scene.sprites.get(3).visible,
        window.__game.scene.teslaPresentation.towers.size,
        window.__game.scene.teslaPresentation.reveals.size,
      ]),
    ).toEqual([false, 0, 0]);
    expect(
      await page.evaluate(
        () => window.__game.scene.children.list.filter((o) => o.getData?.('teslaZap')).length,
      ),
    ).toBe(0);
    await page.evaluate(() => {
      const { model: m, scene } = window.__game;
      m.seekReplay(1);
      for (let i = 0; i < 50 && m.replay.seeking; i++) m.step(0.05);
      scene.sync();
      scene.drawOverlay();
    });
    expect(
      await page.evaluate(() => [
        window.__game.scene.sprites.get(3).visible,
        window.__game.scene.sprites.get(3).isCropped,
      ]),
    ).toEqual([true, false]);
    expect(errors).toEqual([]);
  });

test('Tesla destroyed while emerging switches to its native damaged export at its ground position', async ({
  page,
  browserName,
}) => {
  const result = await page.evaluate(async () => {
    const { makeBuilding } = await import('/src/game/model.ts');
    const { model: m, scene } = window.__game;
    m.state.obstacles = [];
    m.state.buildings = [makeBuilding(1, 'townhall', 20, 20), makeBuilding(2, 'tesla', 6, 10)];
    m.state.nextId = 3;
    m.startBattle(0, true);
    scene.sync();
    scene.scene.pause();
    m.deploy(1, 11);
    m.step(0.05);
    scene.sync();
    for (let i = 0; i < 4; i++) m.step(0.05);
    scene.drawOverlay();
    const tower = m.battle.buildings.find((v) => v.kind === 'tesla'),
      im = scene.sprites.get(tower.id);
    scene.cameras.main.centerOn(768, 400);
    const before = scene.teslaPresentation.towers
      .get(tower.id)
      .objects[0]?.getData('nativeTesla').state;
    m.damage(tower, 9999);
    // Exercise the per-frame destruction path, without a full scene sync.
    scene.renderRuin(tower, im);
    scene.drawOverlay();
    const view = scene.teslaPresentation.towers.get(tower.id);
    return {
      before,
      ruin: view.objects[0].getData('nativeTesla').state,
      native: view.objects.length,
      afterCrop: im.isCropped,
      alpha: im.alpha,
      x: im.x,
      y: im.y,
    };
  });
  expect(result).toMatchObject({
    before: 'reveal',
    ruin: 'ruin',
    afterCrop: false,
    alpha: 0,
    x: 768,
    y: 400,
  });
  expect(result.native).toBeGreaterThan(0);
  await paint(page);
  await page.screenshot({ path: `output/playtest/tesla-ruin-${browserName}.png` });
});

test('touch construction, upgrade visibility and reduced-motion reveal', async ({
  page,
  browserName,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(async () => {
    const { makeBuilding } = await import('/src/game/model.ts');
    const { model: m, scene } = window.__game;
    m.state.obstacles = [];
    m.state.buildings = [
      makeBuilding(1, 'townhall', 20, 20, 7),
      makeBuilding(2, 'builder', 26, 26),
    ];
    m.state.nextId = 3;
    m.state.gold = 500000;
    m.changed();
    scene.sync();
    scene.cameras.main.centerOn(960, 432);
  });
  await page.locator('.shop-btn').tap();
  await page.locator('[data-action="tab:Defenses"]').tap();
  await page.locator('[data-action="build:tesla"]').tap();
  const point = await page.evaluate(() => window.__game.scene.screenFor(11, 9));
  await page.touchscreen.tap(point.x, point.y);
  const construction = await page.evaluate(() => {
    const { model: m, scene } = window.__game;
    const tower = m.state.buildings.find((b) => b.kind === 'tesla');
    const result = [tower.constructing, (tower.upgradeEnd - tower.upgradeStart) / 1000, m.busy];
    m.startBattle(0, true);
    scene.sync();
    scene.drawOverlay();
    result.push(scene.sprites.get(tower.id).visible);
    result.push(
      scene.teslaPresentation.towers.get(tower.id).objects[0].getData('nativeTesla').state,
    );
    return result;
  });
  expect(construction).toEqual([true, 7200, 1, true, 'constructing']);
  const reveal = await page.evaluate(() => {
    const { model: m, scene } = window.__game;
    m.returnHome();
    const tower = m.state.buildings.find((b) => b.kind === 'tesla');
    m.tick(tower.upgradeEnd + 1);
    m.state.settings.reducedMotion = true;
    m.startBattle(0, true);
    scene.scene.pause();
    scene.sync();
    m.battle.units.push({
      id: 999,
      kind: 'dragon',
      x: tower.x + 1,
      y: tower.y + 1,
      hp: 5000,
      maxHp: 5000,
      cooldown: 99,
      target: null,
      path: [],
      pathAt: 0,
      attacking: false,
    });
    m.battle.started = true;
    m.step(0.05);
    scene.sync();
    scene.drawOverlay();
    const view = scene.teslaPresentation.towers.get(tower.id);
    return [
      scene.sprites.get(tower.id).visible,
      scene.sprites.get(tower.id).isCropped,
      view.objects.length > 0,
      view.groups.size,
      scene.teslaPresentation.reveals.size,
    ];
  });
  expect(reveal).toEqual([true, false, true, 0, 0]);
  const upgrade = await page.evaluate(() => {
    const { model: m, scene } = window.__game;
    m.returnHome();
    const tower = m.state.buildings.find((b) => b.kind === 'tesla');
    m.state.gold = 500000;
    m.state.settings.reducedMotion = false;
    m.upgrade(tower.id);
    m.startBattle(0, true);
    scene.sync();
    scene.drawOverlay();
    scene.cameras.main.centerOn(960, 432);
    const view = scene.teslaPresentation.towers.get(tower.id);
    return {
      state: view.objects[0].getData('nativeTesla').state,
      roots: new Set([...view.meshes.keys()].map((key) => key.split('/')[0])).size,
      alpha: scene.sprites.get(tower.id).alpha,
      groups: view.groups.size,
    };
  });
  expect(upgrade).toEqual({ state: 'upgrading', roots: 2, alpha: 0, groups: 0 });
  await paint(page);
  await page.screenshot({ path: `output/playtest/tesla-upgrading-${browserName}.png` });
});

for (const level of [7, 17])
  test(`native level ${level} electrical groups and reveal audio survive replay seeking`, async ({
    page,
    browserName,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const result = await page.evaluate(async (level) => {
      const { makeBuilding } = await import('/src/game/model.ts');
      const { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
      const { model: m, scene, audio } = window.__game;
      // Supported-entity fixture, independent of the TH8 home purchase ceiling.
      m.state.obstacles = [];
      m.state.buildings = [
        makeBuilding(1, 'townhall', 20, 20, 8),
        makeBuilding(3, 'tesla', 6, 10, level),
      ];
      m.state.nextId = 4;
      m.state.army.dragon = 3;
      m.startBattle(0, true);
      scene.scene.pause();
      scene.sync();
      scene.cameras.main.centerOn(768, 400);
      m.activeTroop = 'dragon';
      m.deploy(1, 11);
      for (let i = 0; i < 100; i++) m.step(0.05);
      m.finishBattle();
      const final = structuredClone(m.battle);
      const replay = parseReplayFile(JSON.stringify(makeReplayFile(m.state.raidLog[0].replay)));
      m.returnHome();
      const home = JSON.stringify(m.state);
      if (!m.openReplay(replay)) throw Error('Native Tesla replay rejected');
      const view = () => {
        const tower = scene.teslaPresentation.towers.get(3);
        const snapshot = (v) => ({
          meshes: [...v.meshes].map(([key, mesh]) => [
            key,
            mesh.texture.key,
            mesh.x,
            mesh.y,
            mesh.alpha,
            [...mesh.vertices],
          ]),
          groups: [...v.groups].map(([key, g]) => [
            key,
            g.image.width,
            g.image.height,
            g.image.scaleX,
            snapshot(g.content),
          ]),
        });
        return {
          elapsed: m.battle.elapsed,
          reveal: m.battle.revealedTeslas,
          native: tower ? snapshot(tower) : null,
          dust: scene.teslaPresentation.reveals.size,
        };
      };
      const seek = (t) => {
        m.seekReplay(t);
        for (let i = 0; i < 100 && m.replay.seeking; i++) m.step(0.05);
        scene.sync();
        scene.drawOverlay();
        return view();
      };
      const start = seek(0),
        dust = seek(0.25),
        raised = seek(0.85),
        quiet = seek(2.5),
        repeated = seek(0.85);
      scene.drawOverlay(5000);
      const paused = view();
      m.state.settings.reducedMotion = true;
      scene.drawOverlay();
      const reduced = view();
      m.state.settings.reducedMotion = false;
      seek(1e6);
      const end = structuredClone(m.battle);
      const back = seek(0);
      seek(0.85);
      audio.unlock();
      return {
        start,
        dust,
        raised,
        quiet,
        repeated,
        paused,
        reduced,
        back,
        final,
        end,
        isolated: JSON.stringify(m.state) === home,
      };
    }, level);
    expect(result.start.native).toBeNull();
    expect(result.dust.dust).toBe(1);
    expect(result.raised.native.groups.length).toBeGreaterThan(0);
    expect(result.raised.dust).toBe(0);
    expect(result.quiet.native.meshes.length).toBeGreaterThan(0);
    expect(result.quiet.native.groups).toHaveLength(0);
    expect(result.repeated).toEqual(result.raised);
    expect(result.paused).toEqual(result.raised);
    expect(result.reduced.native.groups).toHaveLength(0);
    expect(result.back).toEqual(result.start);
    expect(result.end).toEqual(result.final);
    expect(result.isolated).toBe(true);
    await paint(page);
    await page.screenshot({ path: `output/playtest/tesla-native-${level}-${browserName}.png` });
    await expect
      .poll(() => page.evaluate(() => window.__game.audio.samples.buffers.has('tesla-appear')))
      .toBe(true);
    const sounds = await page.evaluate(async () => {
      const { model: m, scene, audio } = window.__game;
      const { iso } = await import('/src/game/scene.ts');
      await audio.context.resume();
      m.seekReplay(0.25);
      for (let i = 0; i < 100 && m.replay.seeking; i++) m.step(0.05);
      scene.sync();
      const cues = scene.teslaPresentation.render(
        m.battle.buildings.filter((b) => m.visibleBuilding(b)),
        m.battle,
        m.battle.elapsed,
        false,
        iso,
      );
      scene.sys.resume();
      scene.santaPresentation.render(m.battle, false, true, 2, iso, cues);
      const active = [...audio.samples.active].map(([key, value]) => ({
        key,
        rate: value.source.playbackRate.value,
        gain: value.gain.gain.value,
      }));
      scene.santaPresentation.render(m.battle, false, false, 2, iso, cues);
      scene.sys.pause();
      return { cues, active, stopped: audio.samples.active.size === 0 };
    });
    expect(sounds.cues).toEqual([
      { key: 'tesla:3:appear', sample: 'tesla-appear', at: 0.05, volume: 0.7, pitch: 1 },
    ]);
    expect(sounds.active).toHaveLength(1);
    expect(sounds.active[0]).toMatchObject({ key: 'tesla:3:appear', rate: 2 });
    expect(sounds.active[0].gain).toBeCloseTo(0.084, 6);
    expect(sounds.stopped).toBe(true);
    expect(errors).toEqual([]);
  });
