import { test, expect, type Page } from '@playwright/test';

test.use({ hasTouch: true });
const paint = (page: Page) =>
  page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
const audit = (page: Page) => page.evaluate(() => window.__sweeperHandlingAudit);

async function setup(page: Page) {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('#loading').waitFor({ state: 'detached' });
  await page.locator('[data-action="skip-tutorial"]').click();
  await page.evaluate(async () => {
    const { makeBuilding } = await import('/src/game/model.ts');
    const { model: m, scene, audio } = window.__game;
    m.state.obstacles = [];
    m.state.buildings = [
      makeBuilding(1, 'townhall', 20, 20, 8),
      makeBuilding(2, 'builder', 26, 26),
      makeBuilding(3, 'airsweeper', 10, 10, 2),
      makeBuilding(4, 'goldstorage', 13, 10),
    ];
    m.state.nextId = 5;
    m.state.gold = 1000000;
    m.selected = 3;
    m.changed();
    scene.sync();
    scene.cameras.main.centerOn(850, 425);
    audio.unlock();
    const record = (window.__sweeperHandlingAudit = { events: [], samples: [], tones: [] });
    m.onEffect = (fx) => {
      if (fx.type.startsWith('airsweeper-')) record.events.push(structuredClone(fx));
      scene.effect(fx);
    };
    const play = audio.play.bind(audio);
    audio.play = (kind) => {
      record.tones.push(kind);
      play(kind);
    };
    const sync = audio.samples.sync.bind(audio.samples);
    const seen = new Set();
    audio.samples.sync = (...args) => {
      sync(...args);
      for (const [key, value] of audio.samples.active) {
        if (!key.includes(':home-') || seen.has(value.source)) continue;
        seen.add(value.source);
        const sample = [...audio.samples.buffers].find(([, b]) => b === value.source.buffer)?.[0];
        record.samples.push({
          key,
          sample,
          rate: value.source.playbackRate.value,
          gain: value.gain.gain.value,
        });
      }
    };
  });
  await expect
    .poll(() =>
      page.evaluate(() =>
        ['airsweeper-air_cannon_pickup_03', 'airsweeper-air_cannon_place_02'].every((key) =>
          window.__game.audio.samples.buffers.has(key),
        ),
      ),
    )
    .toBe(true);
}

for (const width of [1440, 390])
  test(`native Air Sweeper move, blocked drop and placement use one original sound at ${width}px`, async ({
    page,
    browserName,
  }) => {
    await page.setViewportSize({ width, height: width === 1440 ? 960 : 844 });
    await setup(page);
    await page.locator('[data-action="move:3"]').tap();
    await expect.poll(async () => (await audit(page)).samples.length).toBe(1);
    const preview = await page.evaluate(() => {
      const { scene } = window.__game;
      const point = (x: number, y: number) => {
        const p = scene.screenFor(x, y);
        return scene.canvasPoint(p.x, p.y);
      };
      const valid = scene.updateGhost(point(6.2, 10.2));
      const tint = scene.ghost.tintTopLeft;
      const blocked = scene.updateGhost(point(13, 11));
      return {
        valid: valid.valid,
        tint,
        blocked: blocked.valid,
        blockedTint: scene.ghost.tintTopLeft,
      };
    });
    expect(preview).toEqual({ valid: true, tint: 0xffffff, blocked: false, blockedTint: 0xff7272 });
    const blocked = await page.evaluate(() => window.__game.scene.screenFor(13, 11));
    await page.touchscreen.tap(blocked.x, blocked.y);
    await expect(page.locator('#toast')).toContainText('Choose a clear space');
    expect((await audit(page)).events.map((e) => e.type)).toEqual(['airsweeper-pickup']);
    expect(await page.evaluate(() => window.__game.model.moving)).toBe(3);
    const drop = await page.evaluate(() => window.__game.scene.screenFor(6.2, 10.2));
    await page.touchscreen.tap(drop.x, drop.y);
    await expect.poll(async () => (await audit(page)).samples.length).toBe(2);
    await expect(page.locator('#toast')).toHaveText('');
    const state = await audit(page);
    expect(state.events).toEqual([
      { type: 'airsweeper-pickup', sourceId: 3, x: 11, y: 11 },
      { type: 'airsweeper-place', sourceId: 3, x: 7, y: 11 },
    ]);
    expect(state.samples.map((s) => s.sample)).toEqual([
      'airsweeper-air_cannon_pickup_03',
      'airsweeper-air_cannon_place_02',
    ]);
    expect(state.samples[0].rate).toBeGreaterThanOrEqual(0.95);
    expect(state.samples[0].rate).toBeLessThanOrEqual(1.05);
    expect(state.samples[0].gain).toBeCloseTo(0.084, 8);
    expect(state.samples[1].rate).toBe(1);
    expect(state.samples[1].gain).toBeCloseTo(0.096, 8);
    expect(state.tones).not.toContain('build');
    const grass = await page.evaluate(() => {
      const { scene } = window.__game;
      scene.paused = true;
      const event = scene.sweeperPresentation.homeEffects.at(-1);
      scene.renderClock = (event.at + 0.14) * 1000;
      scene.drawOverlay();
      return [...scene.sweeperPresentation.effects.values()].flatMap((v) =>
        v.objects.map((o) => ({
          x: o.x,
          y: o.y,
          depth: o.depth,
          kind: o.getData('nativeSweeperEffect').key.includes(':home-place:') ? 'place' : 'pickup',
        })),
      );
    });
    expect(grass.filter((g) => g.kind === 'place').length).toBeGreaterThanOrEqual(3);
    await paint(page);
    await page.screenshot({
      path: `output/playtest/airsweeper-place-${width}-${browserName}.png`,
    });
    await page.evaluate(() => {
      const { scene } = window.__game;
      scene.renderClock += 2000;
      scene.drawOverlay();
    });
    expect(await page.evaluate(() => window.__game.scene.sweeperPresentation.effects.size)).toBe(0);
  });

test('home Air Sweeper effects respect reduced motion, mute, cancellation and battle transitions', async ({
  page,
}) => {
  await setup(page);
  const result = await page.evaluate(() => {
    const { model: m, scene, audio, game } = window.__game;
    scene.drawOverlay();
    const baseline = game.renderer.listenerCount('losewebgl');
    // Draw synchronously on a frozen home clock while allowing the sample mixer to run.
    scene.paused = true;
    const draw = () => {
      scene.paused = false;
      scene.drawOverlay();
      scene.paused = true;
    };
    m.state.settings.reducedMotion = true;
    m.move(3);
    draw();
    const reduced = {
      grass: scene.sweeperPresentation.effects.size,
      sounds: audio.samples.active.size,
    };
    audio.enabled = false;
    draw();
    const muted = audio.samples.active.size;
    audio.enabled = true;
    m.cancel();
    draw();
    const cancelled = {
      events: scene.sweeperPresentation.homeEffects.length,
      sounds: audio.samples.active.size,
    };
    m.state.settings.reducedMotion = false;
    m.move(3);
    scene.renderClock += 140;
    draw();
    const active = scene.sweeperPresentation.effects.size;
    scene.sys.pause();
    const paused = audio.samples.active.size;
    scene.sys.resume();
    m.startBattle(0, true);
    scene.sync();
    draw();
    const battle = {
      home: scene.sweeperPresentation.homeEffects.length,
      grass: scene.sweeperPresentation.effects.size,
      sounds: audio.samples.active.size,
    };
    m.finishBattle();
    m.returnHome();
    scene.sync();
    draw();
    return {
      reduced,
      muted,
      cancelled,
      active,
      paused,
      battle,
      baseline,
      listeners: game.renderer.listenerCount('losewebgl'),
    };
  });
  expect(result.reduced).toEqual({ grass: 0, sounds: 1 });
  expect(result.muted).toBe(0);
  expect(result.cancelled).toEqual({ events: 0, sounds: 0 });
  expect(result.active).toBe(3);
  expect(result.paused).toBe(0);
  expect(result.battle).toEqual({ home: 0, grass: 0, sounds: 0 });
  expect(result.listeners).toBe(result.baseline);
});
