import { expect, test, type Page } from '@playwright/test';

async function settings(page: Page) {
  await page.goto('/?lazyart');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  await page.locator('[data-action="settings"]').first().click();
}

test('muting effects stops native and fallback sounds while music keeps playing', async ({
  page,
}) => {
  await settings(page);
  await page.locator('.toggle[data-action="music"]').click();
  await expect.poll(() => page.evaluate(() => window.__game.audio.tracks.playing)).toBe(true);
  await page.waitForFunction(() => window.__game.audio.samples.has('village-coins_collect_01.ogg'));
  const result = await page.evaluate(() => {
    const audio = window.__game.audio;
    const ctx = audio.context;
    const create = ctx.createBufferSource.bind(ctx);
    const createOscillator = ctx.createOscillator.bind(ctx);
    const toneStops: number[][] = [];
    ctx.createOscillator = () => {
      const osc = createOscillator(),
        stop = osc.stop.bind(osc);
      osc.stop = (...args: [number?]) => {
        toneStops.push(args);
        stop(...args);
      };
      return osc;
    };
    let started = 0,
      stopped = 0;
    ctx.createBufferSource = () => {
      const source = create(),
        start = source.start.bind(source),
        stop = source.stop.bind(source);
      source.start = (when = 0, offset = 0, duration?: number) => {
        started++;
        start(when, offset, duration);
      };
      source.stop = (when = 0) => {
        stopped++;
        stop(when);
      };
      return source;
    };
    const played = audio.samples.shot('village-coins_collect_01.ogg', 0.7);
    audio.play('deploy');
    document.querySelector<HTMLButtonElement>('.toggle[data-action="sound"]').click();
    ctx.createBufferSource = create;
    ctx.createOscillator = createOscillator;
    return {
      played,
      started,
      stopped,
      sound: audio.enabled,
      music: audio.tracks.playing,
      state: ctx.state,
      toneStops,
    };
  });
  expect(result.played).toBe(true);
  expect(result.started).toBeGreaterThan(0);
  expect(result.stopped).toBe(result.started);
  expect(result.sound).toBe(false);
  expect(result.music).toBe(true);
  expect(result.state).toBe('running');
  expect(result.toneStops).toHaveLength(2);
  expect(result.toneStops[0]).toHaveLength(1);
  expect(result.toneStops[1]).toEqual([]);
});

test('a delayed battle intro stays silent after combat starts and result music stops at home', async ({
  page,
}) => {
  test.setTimeout(120000);
  await settings(page);
  await page.locator('.toggle[data-action="sound"]').click();
  await page.locator('.toggle[data-action="music"]').click();
  await expect.poll(() => page.evaluate(() => window.__game.audio.tracks.playing)).toBe(true);
  await page.keyboard.press('Escape');
  let releaseIntro: (() => Promise<void>) | undefined;
  await page.route('**/assets/audio/music/new_battle_intro_01.mp3', (route) => {
    releaseIntro = () => route.continue();
  });
  await page.evaluate(() => {
    const ctx = window.__game.audio.context;
    const probe = { started: 0, stopped: 0 };
    Object.assign(window, { __audioProbe: probe });
    const create = ctx.createBufferSource.bind(ctx);
    ctx.createBufferSource = () => {
      const source = create(),
        start = source.start.bind(source),
        stop = source.stop.bind(source);
      source.start = (when = 0, offset = 0, duration?: number) => {
        probe.started++;
        start(when, offset, duration);
      };
      source.stop = (when = 0) => {
        probe.stopped++;
        stop(when);
      };
      return source;
    };
    window.__game.model.startBattle(0, true);
  });
  await expect.poll(() => !!releaseIntro).toBe(true);
  await page.evaluate(() => {
    const m = window.__game.model;
    m.battle.started = true;
    m.changed();
  });
  await expect
    .poll(() => page.evaluate(() => window.__game.audio.tracks.current))
    .toBe('assets/audio/music/combat_music.ogg');
  await releaseIntro!();
  await page.evaluate(async () => {
    await Promise.all((window.__game.audio.tracks as any).stings.values());
  });
  expect(await page.evaluate(() => (window as any).__audioProbe.started)).toBe(0);
  await page.evaluate(() => window.__game.model.finishBattle());
  await expect.poll(() => page.evaluate(() => (window as any).__audioProbe.started)).toBe(1);
  await page.evaluate(() => window.__game.model.returnHome());
  await expect
    .poll(() => page.evaluate(() => window.__game.audio.tracks.current))
    .toBe('assets/audio/music/home_music_part_1.ogg');
  expect(await page.evaluate(() => (window as any).__audioProbe.stopped)).toBe(1);
});
