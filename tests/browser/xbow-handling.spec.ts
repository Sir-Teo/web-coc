import { test, expect, type Page } from '@playwright/test';

test.use({ hasTouch: true });
const audit = (page: Page) => page.evaluate(() => window.__xbowHandlingAudit);

async function setup(page: Page) {
  await page.goto('/?lazyart');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  await page.evaluate(async () => {
    const { makeBuilding } = await import('/src/game/model.ts');
    const { model, scene, audio } = window.__game;
    model.state.obstacles = [];
    model.state.buildings = [
      makeBuilding(1, 'townhall', 20, 20, 9),
      makeBuilding(2, 'builder', 26, 26),
      makeBuilding(3, 'xbow', 10, 10, 3),
      makeBuilding(4, 'goldstorage', 13, 10),
    ];
    model.state.nextId = 5;
    model.selected = 3;
    model.changed();
    scene.sync();
    scene.cameras.main.centerOn(850, 425);
    audio.unlock();
    const record = (window.__xbowHandlingAudit = { events: [], samples: [], tones: [] });
    const play = audio.play.bind(audio);
    audio.play = (kind) => {
      record.tones.push(kind);
      return play(kind);
    };
    const effect = model.onEffect;
    model.onEffect = (fx) => {
      if (fx.type.startsWith('xbow-')) record.events.push(structuredClone(fx));
      effect(fx);
    };
    const sync = audio.samples.sync.bind(audio.samples),
      seen = new Set();
    audio.samples.sync = (...args) => {
      sync(...args);
      for (const [key, voice] of audio.samples.active) {
        if (!key.startsWith('xbow:') || !key.includes(':home-') || seen.has(voice.source)) continue;
        seen.add(voice.source);
        const sample = [...audio.samples.buffers].find(
          ([, buffer]) => buffer === voice.source.buffer,
        )?.[0];
        record.samples.push({
          key,
          sample,
          pitch: voice.source.playbackRate.value,
          gain: voice.gain.gain.value,
        });
      }
    };
  });
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          ['xbow-bow_pickup', 'xbow-bow_place', 'xbow-bow_target'].every((sample) =>
            window.__game.audio.samples.has(sample),
          ),
        ),
      { timeout: 20000 },
    )
    .toBe(true);
}

for (const width of [1440, 390])
  test(`X-Bow move and mode controls use the native samples at ${width}px`, async ({
    page,
    browserName,
  }) => {
    await page.setViewportSize({ width, height: width === 1440 ? 960 : 844 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await setup(page);
    const resources = await page.evaluate(() => [
      window.__game.model.state.gold,
      window.__game.model.state.elixir,
    ]);
    await page.locator('[data-action="move:3"]').tap();
    await expect.poll(async () => (await audit(page)).samples.length).toBe(1);
    const blocked = await page.evaluate(() => window.__game.scene.screenFor(13, 11));
    await page.touchscreen.tap(blocked.x, blocked.y);
    await expect(page.locator('#toast')).toContainText('Choose a clear space');
    expect((await audit(page)).events.map((event) => event.type)).toEqual(['xbow-pickup']);
    const drop = await page.evaluate(() => window.__game.scene.screenFor(6.2, 10.2));
    await page.touchscreen.tap(drop.x, drop.y);
    await expect.poll(async () => (await audit(page)).samples.length).toBe(2);
    await page.locator('[data-action="xbow-mode"]').tap();
    await expect.poll(async () => (await audit(page)).samples.length).toBe(3);
    const result = await audit(page);
    expect(result.tones).not.toContain('build');
    expect(result.events.map((event) => event.type)).toEqual([
      'xbow-pickup',
      'xbow-place',
      'xbow-mode',
    ]);
    expect(result.samples.map((sample) => sample.sample)).toEqual([
      'xbow-bow_pickup',
      'xbow-bow_place',
      'xbow-bow_target',
    ]);
    for (const [index, sample] of result.samples.entries()) {
      expect(sample.pitch).toBeGreaterThanOrEqual(1.1);
      expect(sample.pitch).toBeLessThanOrEqual(1.2);
      expect(sample.gain).toBeCloseTo(index === 2 ? 0.084 : 0.096, 7);
    }
    expect(
      await page.evaluate(() => [window.__game.model.state.gold, window.__game.model.state.elixir]),
    ).toEqual(resources);
    await page.screenshot({
      path: `output/playtest/xbow-home-controls-${width}-${browserName}.png`,
    });
    await page.reload();
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    expect(
      await page.evaluate(() =>
        window.__game.model.state.buildings.find((building) => building.id === 3),
      ),
    ).toMatchObject({ x: 6, y: 10, xbowMode: 'both' });
    expect(errors).toEqual([]);
  });

test('X-Bow cancellation, mute and a battle transition do not replay home sounds', async ({
  page,
}) => {
  await setup(page);
  await page.locator('[data-action="move:3"]').tap();
  await expect.poll(async () => (await audit(page)).samples.length).toBe(1);
  await page.locator('[data-action="cancel"]').tap();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          [...window.__game.audio.samples.active.keys()].filter(
            (key) => key.startsWith('xbow:') && key.includes(':home-'),
          ).length,
      ),
    )
    .toBe(0);
  expect((await audit(page)).events.map((event) => event.type)).toEqual([
    'xbow-pickup',
    'xbow-cancel',
  ]);
  await page.evaluate(() => {
    window.__game.audio.enabled = false;
    window.__game.model.selected = 3;
    window.__game.model.changed();
  });
  await page.locator('[data-action="xbow-mode"]').tap();
  const duration = await page.evaluate(
    () => window.__game.audio.samples.buffers.get('xbow-bow_target').duration,
  );
  await page.waitForTimeout(Math.ceil(duration * 1000) + 100);
  expect((await audit(page)).samples).toHaveLength(1);
  await page.evaluate(() => {
    window.__game.audio.enabled = true;
    window.__game.audio.unlock();
  });
  await page.locator('[data-action="xbow-mode"]').tap();
  await expect.poll(async () => (await audit(page)).samples.length).toBe(2);
  await page.evaluate(() => window.__game.model.startBattle(0, true));
  await expect
    .poll(() => page.evaluate(() => window.__game.scene.xbowPresentation.homeEvents.length))
    .toBe(0);
  await page.evaluate(() => window.__game.model.returnHome());
  await page.waitForTimeout(200);
  expect((await audit(page)).samples).toHaveLength(2);
});
