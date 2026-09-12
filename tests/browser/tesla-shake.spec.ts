import { test, expect, type Page } from '@playwright/test';

const paint = (page: Page) =>
  page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.ready);
  await page.locator('#loading').waitFor({ state: 'detached' });
  await page.locator('[data-action="skip-tutorial"]').click();
  await page.evaluate(async () => {
    const { makeBuilding } = await import('/src/game/model.ts');
    const { model: m, scene } = window.__game;
    scene.paused = true;
    m.state.obstacles = [];
    m.state.buildings = [
      makeBuilding(1, 'townhall', 20, 20, 8),
      makeBuilding(3, 'tesla', 6, 10, 17),
    ];
    m.state.nextId = 4;
    m.state.army.dragon = 3;
    m.startBattle(0, true);
    m.activeTroop = 'dragon';
    m.deploy(1, 11);
    for (let i = 0; i < 3; i++) m.step(0.05);
    scene.sync();
    scene.drawOverlay();
    scene.setZoom(1);
    scene.cameras.main.centerOn(768, 400);
  });
});

for (const width of [1440, 390])
  test(`Tesla shake freezes, scales and keeps pointer projection aligned at ${width}px`, async ({
    page,
    browserName,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewportSize({ width, height: width === 1440 ? 960 : 844 });
    await page.waitForFunction(
      (width) => window.__game.scene.cameras.main.width === Math.floor(width * devicePixelRatio),
      width,
    );
    const sample = () =>
      page.evaluate(async () => {
        const { model: m, scene } = window.__game;
        const { iso } = await import('/src/game/scene.ts');
        const c = scene.cameras.main;
        const p = scene.screenFor(7, 11);
        const rect = scene.scale.canvasBounds;
        const roundtrip = c.getWorldPoint(
          (p.x - rect.left) * scene.scale.displayScale.x,
          (p.y - rect.top) * scene.scale.displayScale.y,
        );
        const withShake = [...c.matrixCombined.matrix];
        m.state.settings.reducedMotion = true;
        const still = scene.screenFor(7, 11);
        m.state.settings.reducedMotion = false;
        c.preRender();
        return {
          elapsed: m.battle.elapsed,
          withShake,
          scroll: [c.scrollX, c.scrollY],
          delta: [p.x - still.x, p.y - still.y],
          zoom: scene.viewZoom,
          roundtrip: [roundtrip.x, roundtrip.y],
          expected: [iso(7, 11).x, iso(7, 11).y],
        };
      });
    const first = await sample();
    expect(Math.hypot(...first.delta)).toBeGreaterThan(0.1);
    expect(first.roundtrip[0]).toBeCloseTo(first.expected[0], 4);
    expect(first.roundtrip[1]).toBeCloseTo(first.expected[1], 4);
    await page.waitForTimeout(350);
    expect(await sample()).toEqual(first);
    await paint(page);
    await page.screenshot({ path: `output/playtest/tesla-shake-${width}-${browserName}.png` });
    await page.evaluate(() => {
      const { model: m, scene } = window.__game;
      scene.sys.pause();
      scene.drawOverlay(99999);
      m.damage(
        m.battle.buildings.find((b) => b.kind === 'tesla'),
        9999,
      );
      scene.cameras.main.shakeEffect.reset(); // Remove the unrelated destruction shake.
      scene.sync();
      scene.drawOverlay();
    });
    expect(await sample()).toEqual(first);
    await page.evaluate(() => {
      const s = window.__game.scene;
      s.setZoom(s.viewZoom * 1.3);
    });
    const zoomed = await sample();
    expect(zoomed.delta[0] / first.delta[0]).toBeCloseTo(zoomed.zoom / first.zoom, 3);
    expect(zoomed.delta[1] / first.delta[1]).toBeCloseTo(zoomed.zoom / first.zoom, 3);
    expect(zoomed.roundtrip[0]).toBeCloseTo(zoomed.expected[0], 4);
    expect(zoomed.roundtrip[1]).toBeCloseTo(zoomed.expected[1], 4);
    const rest = await page.evaluate(() => {
      const { model: m, scene } = window.__game;
      m.step(0.1);
      scene.drawOverlay();
      const p = scene.screenFor(7, 11);
      m.state.settings.reducedMotion = true;
      return { p, still: scene.screenFor(7, 11), elapsed: m.battle.elapsed };
    });
    expect(rest.elapsed).toBeCloseTo(0.25);
    expect(rest.p).toEqual(rest.still);
    expect(errors).toEqual([]);
  });

test('Tesla camera motion reconstructs through replay speeds, seek, exit and shutdown', async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { model: m, scene } = window.__game;
    const { CameraShakeLayer } = await import('/src/game/camera-shake-layer.ts');
    const c = scene.cameras.main;
    const sample = () => {
      scene.drawOverlay();
      c.preRender();
      return [...c.matrixCombined.matrix];
    };
    const live = sample();
    for (let i = 0; i < 30; i++) m.step(0.05);
    m.finishBattle();
    const final = structuredClone(m.battle);
    m.returnHome();
    const home = JSON.stringify(m.state);
    m.startReplay(m.state.raidLog[0].id);
    const seek = (at) => {
      m.seekReplay(at);
      for (let i = 0; i < 100 && m.replay.seeking; i++) m.step(0.05);
      scene.sync();
      scene.setZoom(1);
      c.centerOn(768, 400);
      return sample();
    };
    const replay = seek(0.15);
    const start = seek(0);
    const repeated = seek(0.15);
    m.toggleReplay();
    const paused = sample();
    m.step(1);
    const afterPause = sample();
    const speeds = [1, 2, 4].map((speed) => {
      seek(0.05);
      if (m.replay.paused) m.toggleReplay();
      m.setReplaySpeed(speed);
      m.step(0.1 / speed);
      return { speed, elapsed: m.battle.elapsed, matrix: sample() };
    });
    const finished = seek(9999);
    const finalEqual = JSON.stringify(m.battle) === JSON.stringify(final);
    m.returnHome();
    scene.sync();
    scene.setZoom(1);
    c.centerOn(768, 400);
    const exited = sample();
    const isolated = JSON.stringify(m.state) === home;
    const original = c.shakeEffect.preRender;
    // A second independent layer composes without consuming or replacing Phaser's effect.
    const layer = new CameraShakeLayer(c, () => ({ x: 3, y: -2 }));
    const added = sample();
    layer.destroy();
    layer.destroy();
    const removed = sample();
    const restored = c.shakeEffect.preRender === original;
    scene.sys.shutdown();
    return {
      live,
      replay,
      start,
      repeated,
      paused,
      afterPause,
      speeds,
      finished,
      exited,
      finalEqual,
      isolated,
      added,
      removed,
      restored,
      shutdownRestored: c.shakeEffect.preRender !== original,
    };
  });
  expect(result.replay).toEqual(result.live);
  expect(result.repeated).toEqual(result.live);
  expect(result.paused).toEqual(result.live);
  expect(result.afterPause).toEqual(result.live);
  expect(result.start).not.toEqual(result.live);
  for (const speed of result.speeds) {
    expect(speed.elapsed).toBeCloseTo(0.15);
    expect(speed.matrix).toEqual(result.live);
  }
  expect(result.finished).toEqual(result.start);
  expect(result.exited).toEqual(result.start);
  expect(result.finalEqual).toBe(true);
  expect(result.isolated).toBe(true);
  expect(result.added).not.toEqual(result.exited);
  expect(result.removed).toEqual(result.exited);
  expect(result.restored).toBe(true);
  expect(result.shutdownRestored).toBe(true);
});
