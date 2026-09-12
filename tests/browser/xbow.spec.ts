import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.ready);
  await page.locator('#loading').waitFor({ state: 'detached' });
  await page.locator('[data-action="skip-tutorial"]').click();
});

test('native X-Bow previews load and the shop preserves the Town Hall 9 gate', async ({ page }) => {
  await page.locator('.shop-btn').click();
  await page.locator('[data-action="tab:Defenses"]').click();
  await expect(page.locator('[data-action="build:xbow"]')).toBeDisabled();
  await expect(page.locator('.shop-tile').filter({ hasText: 'X-Bow' })).toContainText(
    'Town Hall 9',
  );
  expect(
    await page.evaluate(() =>
      Array.from({ length: 13 }, (_, i) => i + 1).every((level) =>
        ['ground', 'both'].every((mode) =>
          window.__game.scene.textures.exists(`xbow-${level}-${mode}`),
        ),
      ),
    ),
  ).toBe(true);
});

for (const width of [1440, 390])
  test(`X-Bow mode, range and registered meshes survive a village reload at ${width}px`, async ({
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
        makeBuilding(3, 'xbow', 10, 10, 3),
      ];
      m.state.nextId = 4;
      m.selected = 3;
      m.changed();
      scene.sync();
      scene.cameras.main.centerOn(896, 430);
    });
    await page.getByRole('button', { name: 'Switch X-Bow to ground and air mode' }).click();
    await page.locator('[data-action="info"]').click();
    await expect(page.locator('.info-table')).toContainText('11.5 tiles');
    await expect(page.locator('.info-table')).toContainText('10.24');
    await expect(page.locator('.info-table')).toContainText('0.128s');
    await expect(page.locator('.info-table')).toContainText('1,500 bolts');
    await expect(page.locator('.info-table')).toContainText('Ground & air');
    await expect(page.locator('.info-hero img')).toHaveAttribute(
      'src',
      '/assets/buildings/xbow-native/preview-3-both.png',
    );
    await page.waitForTimeout(250);
    await page.screenshot({ path: `output/playtest/xbow-info-${width}-${browserName}.png` });
    await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
    await page.waitForTimeout(1100);
    await page.reload();
    await page.waitForFunction(() => window.__game?.scene.ready);
    expect(
      await page.evaluate(() => {
        const { model: m, scene } = window.__game;
        const tower = m.state.buildings.find((b) => b.id === 3),
          image = scene.sprites.get(3);
        scene.drawOverlay(0);
        return {
          mode: tower.xbowMode,
          texture: image.texture.key,
          alpha: image.alpha,
          width: image.displayWidth,
          originY: image.originY,
          meshes: scene.xbowPresentation.towers.get(3).meshes.size,
          picked: scene.pickBuilding(image.x, image.y - 30, { x: 11.5, y: 11.5 })?.id,
        };
      }),
    ).toMatchObject({
      mode: 'both',
      texture: 'xbow-3-both',
      alpha: 0,
      width: 240,
      originY: 110 / 170,
      picked: 3,
      meshes: 4,
    });
  });

test('X-Bow aiming, native flight, empty ammunition and cleanup follow battle time', async ({
  page,
  browserName,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const start = await page.evaluate(async () => {
    const { makeBuilding } = await import('/src/game/model.ts');
    const { xbowState } = await import('/src/game/xbow.ts');
    const { model: m, scene } = window.__game;
    scene.paused = true;
    m.startBattle(0, true);
    const b = m.battle,
      tower = makeBuilding(9000, 'xbow', 10, 10, 13);
    tower.xbowMode = 'both';
    b.buildings = [tower, makeBuilding(9002, 'townhall', 30, 30)];
    b.started = true;
    b.units = [
      {
        id: 9001,
        kind: 'balloon',
        x: 17.5,
        y: 17.5,
        hp: 5000,
        maxHp: 5000,
        springUntil: 10000,
        cooldown: 10000,
        target: tower.id,
        path: [],
        pathAt: 10000,
        attacking: false,
      },
    ];
    xbowState(b, tower).ammunition = 3;
    m.changed();
    scene.sync();
    scene.cameras.main.setZoom(1.4).centerOn(896, 535);
    m.step(0.05);
    scene.drawOverlay(0);
    const meshes = [...scene.xbowPresentation.towers.get(tower.id).meshes.values()];
    return {
      state: meshes[0].getData('xbow'),
      count: meshes.length,
      bolts: scene.xbowPresentation.bolts.size,
      generic: scene.children.list.filter((c) => c.getData?.('projectileId')).length,
    };
  });
  expect(start.state).toEqual({ id: 9000, direction: 45, ammunition: 2 });
  expect(start.bolts).toBe(1);
  expect(start.generic).toBe(0);
  const before = await page.evaluate(() =>
    [...window.__game.scene.xbowPresentation.bolts.values()].flatMap((v) =>
      [...v.meshes.values()].map((m) => ({ x: m.x, y: m.y, vertices: m.vertices })),
    ),
  );
  await page.waitForTimeout(200);
  expect(
    await page.evaluate(() =>
      [...window.__game.scene.xbowPresentation.bolts.values()].flatMap((v) =>
        [...v.meshes.values()].map((m) => ({ x: m.x, y: m.y, vertices: m.vertices })),
      ),
    ),
  ).toEqual(before);
  await page.evaluate(() => {
    const { model: m, scene } = window.__game;
    for (let i = 0; i < 4; i++) m.step(0.05);
    scene.drawOverlay(0);
  });
  await page.screenshot({ path: `output/playtest/xbow-battle-${browserName}.png` });
  const empty = await page.evaluate(() => {
    const { model: m, scene } = window.__game;
    for (let i = 0; i < 20; i++) m.step(0.05);
    scene.drawOverlay(0);
    const meshes = [...scene.xbowPresentation.towers.get(9000).meshes.values()];
    return {
      state: meshes[0].getData('xbow'),
      count: meshes.length,
      bolts: scene.xbowPresentation.bolts.size,
      hp: m.battle.units[0].hp,
    };
  });
  expect(empty.state).toEqual({ id: 9000, direction: 45, ammunition: 0 });
  expect(empty.count).toBeLessThan(start.count);
  expect(empty.bolts).toBe(0);
  expect(empty.hp).toBeCloseTo(5000 - 3 * 31.36, 8);
  expect(
    await page.evaluate(() => {
      const { model: m, scene } = window.__game;
      m.battle.buildings[0].hp = 0;
      m.changed();
      scene.sync();
      scene.drawOverlay(0);
      const ruined = scene.sprites.get(9000).texture.key;
      m.finishBattle();
      m.returnHome();
      scene.sync();
      scene.drawOverlay(0);
      return {
        ruined,
        towers: scene.xbowPresentation.towers.size,
        bolts: scene.xbowPresentation.bolts.size,
      };
    }),
  ).toEqual({ ruined: 'ruins-stone', towers: 0, bolts: 0 });
  expect(errors).toEqual([]);
});

test('native X-Bow replays rewind ammunition and meshes, preserve reduced motion and share battle audio', async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { makeBuilding } = await import('/src/game/model.ts');
    const { emptyArmy } = await import('/src/game/army.ts');
    const { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
    const { model: m, scene, audio } = window.__game;
    scene.paused = true;
    m.state.obstacles = [];
    m.state.buildings = [
      makeBuilding(1, 'townhall', 20, 20, 8),
      makeBuilding(2, 'builder', 26, 26),
      { ...makeBuilding(3, 'xbow', 6, 6, 3), xbowMode: 'both' },
    ];
    m.state.nextId = 4;
    m.state.army = { ...emptyArmy(), giant: 1 };
    m.startBattle(0, true);
    m.activeTroop = 'giant';
    if (!m.deploy(1, 7)) throw Error('X-Bow replay fixture deployment failed');
    for (let i = 0; i < 50; i++) m.step(0.05);
    m.finishBattle();
    const final = structuredClone(m.battle);
    const data = parseReplayFile(JSON.stringify(makeReplayFile(m.state.raidLog[0].replay)));
    m.returnHome();
    const home = JSON.stringify(m.state);
    m.openReplay(data);
    const seek = (at: number) => {
      m.seekReplay(at);
      for (let i = 0; i < 100 && m.replay.seeking; i++) m.step(0.05);
      scene.sync();
      scene.drawOverlay(0);
      return {
        state: structuredClone(m.battle.xbows ?? {}),
        towers: [...scene.xbowPresentation.towers].map(([id, v]) => [
          id,
          [...v.meshes].map(([key, mesh]) => [key, mesh.vertices, mesh.alpha]),
        ]),
        bolts: [...scene.xbowPresentation.bolts].map(([id, v]) => [
          id,
          [...v.meshes].map(([key, mesh]) => [key, mesh.vertices, mesh.x, mesh.y]),
        ]),
      };
    };
    const start = seek(0),
      middle = seek(0.45),
      back = seek(0),
      repeated = seek(0.45);
    m.state.settings.reducedMotion = true;
    scene.sync();
    scene.drawOverlay(0);
    const reduced = {
      bolts: scene.xbowPresentation.bolts.size,
      ammunition: m.battle.xbows[3].ammunition,
      towers: scene.xbowPresentation.towers.size,
    };
    m.state.settings.reducedMotion = false;
    seek(1e6);
    const end = structuredClone(m.battle);
    seek(0.45);
    audio.unlock();
    return {
      final,
      end,
      start,
      middle,
      back,
      repeated,
      reduced,
      isolated: JSON.stringify(m.state) === home,
    };
  });
  expect(result.back).toEqual(result.start);
  expect(result.repeated).toEqual(result.middle);
  expect(result.middle.bolts.length).toBeGreaterThan(0);
  expect(result.reduced).toEqual({
    bolts: 0,
    ammunition: result.middle.state['3'].ammunition,
    towers: 1,
  });
  expect(result.end).toEqual(result.final);
  expect(result.isolated).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__game.audio.samples.buffers.size)).toBe(16);
  const sounds = await page.evaluate(async () => {
    const { model: m, scene, audio } = window.__game;
    const { iso } = await import('/src/game/scene.ts');
    await audio.context.resume();
    const cues = scene.xbowPresentation.render(
      m.battle.buildings,
      m.battle,
      m.battle.elapsed,
      false,
      iso,
      46,
    );
    const santa = {
      key: 'combined:santa',
      sample: 'santa-call',
      at: m.battle.elapsed,
      volume: 0.9,
      pitch: 0.6,
    };
    scene.santaPresentation.render(m.battle, false, true, 2, iso, [...cues, santa]);
    const active = [...audio.samples.active].map(([key, value]) => ({
      key,
      rate: value.source.playbackRate.value,
    }));
    scene.santaPresentation.render(m.battle, false, false, 2, iso, [...cues, santa]);
    return { active, stopped: audio.samples.active.size === 0 };
  });
  expect(sounds.active.some((v) => v.key === 'combined:santa')).toBe(true);
  expect(
    sounds.active.some((v) => v.key.startsWith('xbow:3:shot:') && v.rate >= 2.2 && v.rate <= 2.4),
  ).toBe(true);
  expect(sounds.stopped).toBe(true);
});
