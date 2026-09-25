import { test, expect, type Page } from '@playwright/test';

test.use({ hasTouch: true });
const paint = (page: Page) =>
  page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
const audit = (page: Page) => page.evaluate(() => window.__teslaHandlingAudit);

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
      makeBuilding(3, 'tesla', 10, 10, 6),
      makeBuilding(4, 'goldstorage', 12, 10),
    ];
    m.state.nextId = 5;
    m.state.gold = 1000000;
    m.selected = 3;
    m.changed();
    scene.sync();
    scene.cameras.main.centerOn(850, 425);
    audio.unlock();
    const record = (window.__teslaHandlingAudit = { events: [], samples: [], tones: [] });
    m.onEffect = (fx) => {
      if (fx.type.startsWith('tesla-')) record.events.push(structuredClone(fx));
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
        if (!key.startsWith('tesla:home:') || seen.has(value.source)) continue;
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
        ['tesla-tesla_pickup_11', 'tesla-tesla_drop_09'].every((key) =>
          window.__game.audio.samples.buffers.has(key),
        ),
      ),
    )
    .toBe(true);
}

for (const width of [1440, 390])
  test(`native Tesla move, blocked drop and placement use one original sound at ${width}px`, async ({
    page,
    browserName,
  }) => {
    await page.setViewportSize({ width, height: width === 1440 ? 960 : 844 });
    await setup(page);
    await page.locator('[data-action="move:3"]').tap();
    await expect.poll(async () => (await audit(page)).samples.length).toBe(1);
    const blocked = await page.evaluate(() => window.__game.scene.screenFor(13, 11));
    await page.touchscreen.tap(blocked.x, blocked.y);
    await expect(page.locator('#toast')).toContainText('Choose a clear space');
    expect((await audit(page)).events.map((e) => e.type)).toEqual(['tesla-pickup']);
    expect(await page.evaluate(() => window.__game.model.moving)).toBe(3);
    const drop = await page.evaluate(() => window.__game.scene.screenFor(6.2, 10.2));
    await page.touchscreen.tap(drop.x, drop.y);
    await expect.poll(async () => (await audit(page)).samples.length).toBe(2);
    await expect(page.locator('#toast')).toHaveText('');
    const state = await audit(page);
    expect(state.events).toEqual([
      { type: 'tesla-pickup', sourceId: 3, x: 11, y: 11 },
      { type: 'tesla-place', sourceId: 3, x: 7, y: 11 },
    ]);
    expect(state.samples.map((s) => s.sample)).toEqual([
      'tesla-tesla_pickup_11',
      'tesla-tesla_drop_09',
    ]);
    for (const sound of state.samples) {
      expect(sound.rate).toBe(1);
      expect(sound.gain).toBeCloseTo(0.096, 8);
    }
    expect(state.tones).not.toContain('build');
    const grass = await page.evaluate(() => {
      const { scene } = window.__game;
      scene.paused = true;
      const event = scene.teslaPresentation.homeEffects.at(-1);
      scene.renderClock = (event.at + 0.14) * 1000;
      scene.drawOverlay();
      return [...scene.teslaPresentation.grass.values()].flatMap((v) =>
        v.objects.map((o) => ({
          x: o.x,
          y: o.y,
          depth: o.depth,
          kind: o.getData('nativeTeslaGrass').kind,
        })),
      );
    });
    expect(grass.filter((g) => g.kind === 'place')).toHaveLength(3);
    await paint(page);
    await page.screenshot({ path: `output/playtest/tesla-place-${width}-${browserName}.png` });
    await page.evaluate(() => {
      const { scene } = window.__game;
      scene.renderClock += 2000;
      scene.drawOverlay();
    });
    expect(await page.evaluate(() => window.__game.scene.teslaPresentation.grass.size)).toBe(0);
  });

test('dragging a new Tesla from the shop plays only the native drop and creates source grass', async ({
  page,
}) => {
  await setup(page);
  await page.locator('.shop-btn').click();
  await page.locator('[data-action="tab:Defenses"]').click();
  const tile = page.locator('[data-action="build:tesla"]');
  await expect(tile).toBeEnabled();
  const handle = page.locator('[data-drag="tesla"] .shop-tile-art');
  const drop = await page.evaluate(() => window.__game.scene.screenFor(6.2, 10.2));
  await handle.hover();
  await page.mouse.down();
  await expect.poll(() => page.evaluate(() => window.__game.model.placement)).toBe('tesla');
  await page.mouse.move(drop.x, drop.y, { steps: 10 });
  await page.mouse.up();
  await expect.poll(async () => (await audit(page)).samples.length).toBe(1);
  const state = await audit(page);
  expect(state.events).toEqual([{ type: 'tesla-place', sourceId: 5, x: 7, y: 11 }]);
  expect(state.samples[0].sample).toBe('tesla-tesla_drop_09');
  expect(state.tones).not.toContain('build');
  expect(
    await page.evaluate(() => window.__game.model.state.buildings.find((b) => b.id === 5)),
  ).toMatchObject({ kind: 'tesla', x: 6, y: 10, constructing: true });
});

test('edit drag emits one pickup/drop pair, preserves undo and handles pointer cancellation', async ({
  page,
}) => {
  await setup(page);
  await page.locator('[data-action="edit"]').click();
  const points = await page.evaluate(() => {
    const { scene } = window.__game;
    const from = scene.screenFor(11, 11);
    from.y -= 45 * scene.viewZoom;
    return { from, to: scene.screenFor(7, 11) };
  });
  await page.mouse.move(points.from.x, points.from.y);
  await page.mouse.down();
  await page.mouse.move(points.to.x, points.to.y, { steps: 12 });
  expect((await audit(page)).events.map((e) => e.type)).toEqual(['tesla-pickup']);
  await page.mouse.up();
  await expect.poll(async () => (await audit(page)).samples.length).toBe(2);
  expect((await audit(page)).events.map((e) => e.type)).toEqual(['tesla-pickup', 'tesla-place']);
  await page.locator('[data-action="undo"]').click();
  expect(
    await page.evaluate(() => window.__game.model.state.buildings.find((b) => b.id === 3)),
  ).toMatchObject({ x: 10, y: 10 });
  await expect(page.locator('[data-action="undo"]')).toBeDisabled();
  await page.locator('[data-action="redo"]').click();
  expect(
    await page.evaluate(() => window.__game.model.state.buildings.find((b) => b.id === 3)),
  ).toMatchObject({ x: 6, y: 10 });
  const next = await page.evaluate(() => {
    const { scene } = window.__game;
    const from = scene.screenFor(7, 11);
    from.y -= 45 * scene.viewZoom;
    return { from, to: scene.screenFor(9, 11) };
  });
  await page.mouse.move(next.from.x, next.from.y);
  await page.mouse.down();
  await page.mouse.move(next.to.x, next.to.y, { steps: 8 });
  await page
    .locator('canvas')
    .dispatchEvent('pointercancel', { pointerId: 1, pointerType: 'mouse', bubbles: true });
  await page.mouse.up();
  await expect
    .poll(() => page.evaluate(() => window.__game.scene.teslaPresentation.grass.size))
    .toBe(0);
  expect((await audit(page)).events.map((e) => e.type)).toEqual([
    'tesla-pickup',
    'tesla-place',
    'tesla-pickup',
    'tesla-cancel',
  ]);
  expect(await page.evaluate(() => window.__game.audio.samples.active.size)).toBe(0);
});

test('home Tesla effects respect reduced motion, mute, cancellation and battle transitions', async ({
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
      grass: scene.teslaPresentation.grass.size,
      sounds: audio.samples.active.size,
    };
    audio.enabled = false;
    draw();
    const muted = audio.samples.active.size;
    audio.enabled = true;
    m.cancel();
    draw();
    const cancelled = {
      events: scene.teslaPresentation.homeEffects.length,
      sounds: audio.samples.active.size,
    };
    m.state.settings.reducedMotion = false;
    m.move(3);
    scene.renderClock += 140;
    draw();
    const active = scene.teslaPresentation.grass.size;
    scene.sys.pause();
    const paused = audio.samples.active.size;
    scene.sys.resume();
    m.startBattle(0, true);
    scene.sync();
    draw();
    const battle = {
      home: scene.teslaPresentation.homeEffects.length,
      grass: scene.teslaPresentation.grass.size,
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

test('cancelling a shop drag does not purchase or place a Tesla', async ({ page }) => {
  await setup(page);
  await page.locator('.shop-btn').click();
  await page.locator('[data-action="tab:Defenses"]').click();
  const handle = page.locator('[data-drag="tesla"] .shop-tile-art');
  const drop = await page.evaluate(() => window.__game.scene.screenFor(6.2, 10.2));
  await handle.hover();
  await page.mouse.down();
  await expect.poll(() => page.evaluate(() => window.__game.model.placement)).toBe('tesla');
  await page.mouse.move(drop.x, drop.y, { steps: 10 });
  await page.evaluate(
    ({ x, y }) =>
      window.dispatchEvent(
        new PointerEvent('pointercancel', {
          pointerId: 1,
          pointerType: 'mouse',
          isPrimary: true,
          clientX: x,
          clientY: y,
        }),
      ),
    drop,
  );
  await page.mouse.up();
  await paint(page);
  const result = await page.evaluate(() => ({
    gold: window.__game.model.state.gold,
    towers: window.__game.model.state.buildings.filter((b) => b.kind === 'tesla').length,
    placement: window.__game.model.placement,
    ghost: !!window.__game.scene.ghost,
  }));
  expect(result).toEqual({ gold: 1000000, towers: 1, placement: null, ghost: false });
  expect((await audit(page)).events).toEqual([]);
  expect((await audit(page)).samples).toEqual([]);
});
