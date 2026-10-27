import { expect, test, type Page } from '@playwright/test';
import { garrisonBowlerImpactRecording } from '../fixtures/garrison-bowler-impacts';
import { garrisonSoundCues } from '../../src/game/garrison-sounds';

async function open(page: Page, data: unknown) {
  await page.goto('/?lazyart');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  await page.evaluate(async (data) => {
    const { model, scene, audio } = window.__game;
    const { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
    scene.paused = true;
    audio.enabled = true;
    audio.unlock();
    await audio.context.resume();
    if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data)))))
      throw Error('Garrison audio replay rejected');
    model.replay.paused = true;
    model.changed();
    scene.sync();
    scene.drawOverlay(0);
  }, data);
}

async function seek(page: Page, at: number, id: number) {
  return page.evaluate(
    async ({ at, id }) => {
      const { model, scene } = window.__game;
      model.seekReplay(at);
      while (model.replay.seeking) model.step(0.05);
      model.changed();
      scene.sync();
      const d = model.battle.defenders.find((d) => d.id === id),
        { iso } = await import('/src/game/scene.ts'),
        p = iso(d.x, d.y);
      scene.cameras.main.useBounds = false;
      scene.cameras.main.setZoom(innerWidth < 500 ? 1.35 : 1.7).centerOn(p.x, p.y - 40);
      const battle = JSON.stringify(model.battle);
      scene.drawOverlay(0);
      const { garrisonSoundCues } = await import('/src/game/garrison-sounds.ts');
      return {
        battle,
        cues: garrisonSoundCues(model.battle),
        readOnly: battle === JSON.stringify(model.battle),
      };
    },
    { at, id },
  );
}

for (const { version, width, mode } of [
  { version: 160, width: 390, mode: 'freeze' },
  { version: 160, width: 1440, mode: 'lightning' },
  { version: 159, width: 1440, mode: 'none' },
  { version: 159, width: 390, mode: 'freeze' },
] as const)
  test(`garrison boulder impact audio at ${width}px, version=${version}, ${mode}`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: width === 390 ? 844 : 960 });
    const r = garrisonBowlerImpactRecording(version, mode),
      errors: string[] = [],
      requests: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('request', (r) => requests.push(r.url()));
    await open(page, r.data);
    if (version === 160)
      await expect
        .poll(
          () =>
            page.evaluate(
              () =>
                window.__game.audio.samples.has('troop-rock_troll_hit_02.ogg') &&
                window.__game.audio.samples.has('troop-rock_troll_explo_01.ogg'),
            ),
          { timeout: 30000 },
        )
        .toBe(true);
    for (const snapshot of r.snapshots) {
      const state = await seek(page, snapshot.at, r.id);
      expect(JSON.parse(state.battle)).toEqual(snapshot.battle);
      expect(state.cues).toEqual(garrisonSoundCues(snapshot.battle));
      expect(state.readOnly).toBe(true);
    }
    for (const phase of [
      { at: r.hit, key: `garrison:${r.id}:bounce:0`, volume: 0.5 },
      { at: r.shatter, key: `garrison:${r.id}:projectile-hit:0`, volume: 0.4 },
    ]) {
      const state = await seek(page, phase.at, r.id),
        expected = state.cues.find((c) => c.key === phase.key),
        playing = await page.evaluate(async (key) => {
          const { model, scene, audio } = window.__game,
            { iso } = await import('/src/game/scene.ts'),
            calls: { source: AudioBufferSourceNode; offset: number }[] = [],
            start = AudioBufferSourceNode.prototype.start;
          AudioBufferSourceNode.prototype.start = function (when, offset, duration) {
            calls.push({ source: this, offset: offset ?? 0 });
            return duration === undefined
              ? start.call(this, when, offset)
              : start.call(this, when, offset, duration);
          };
          audio.samples.stop();
          try {
            scene.santaPresentation.render(model.battle, false, true, 2, iso, scene.lastCues);
            const cue = scene.lastCues.find((c) => c.key === key),
              node = cue && audio.samples.active.get(key),
              result = {
                cue,
                gain: node?.gain.gain.value ?? null,
                rate: node?.source.playbackRate.value ?? null,
                offset: calls.find((c) => c.source === node?.source)?.offset ?? null,
              };
            scene.santaPresentation.render(model.battle, false, false, 2, iso, scene.lastCues);
            return {
              ...result,
              stopped: audio.samples.active.size === 0,
              battle: JSON.stringify(model.battle),
            };
          } finally {
            AudioBufferSourceNode.prototype.start = start;
          }
        }, phase.key);
      expect(playing.cue).toEqual(expected);
      if (version === 160) {
        expect(expected).toBeDefined();
        expect(playing.gain).toBeCloseTo(phase.volume * 0.12, 7);
        expect(playing.rate).toBeCloseTo(expected!.pitch * 2, 6);
        expect(playing.offset).toBeCloseTo((phase.at - expected!.at) * expected!.pitch, 7);
      } else expect(playing.gain).toBeNull();
      expect(playing.stopped).toBe(true);
      expect(playing.battle).toBe(state.battle);
    }
    if (version === 159)
      expect(requests.some((p) => p.includes('/rock_troll_hit_02.ogg'))).toBe(false);
    const tail = await seek(page, r.tail, r.id);
    await seek(page, r.first, r.id);
    expect(await seek(page, r.tail, r.id)).toEqual(tail);
    await page.evaluate(() => window.__game.model.toggleReducedMotion());
    expect(await page.evaluate(() => JSON.stringify(window.__game.model.battle))).toBe(tail.battle);
    expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
    expect(errors).toEqual([]);
  });

test('defending bounce sample recovers a 503 while playback remains paused', async ({ page }) => {
  test.setTimeout(90000);
  let blocked = true,
    attempts = 0;
  await page.route('**/assets/audio/troops-native/rock_troll_hit_02.ogg', async (route) => {
    attempts++;
    if (blocked)
      await route.fulfill({ status: 503, body: 'temporary defending bounce sample failure' });
    else await route.continue();
  });
  const failure = page.waitForResponse(
      (r) => r.url().includes('/rock_troll_hit_02.ogg') && r.status() === 503,
    ),
    r = garrisonBowlerImpactRecording();
  await open(page, r.data);
  await failure;
  expect(attempts).toBe(1);
  const before = await seek(page, r.hit, r.id);
  await page.evaluate(() => {
    window.__game.model.replay.paused = true;
    window.__game.scene.paused = false;
  });
  blocked = false;
  await page.evaluate(() => dispatchEvent(new Event('online')));
  await expect
    .poll(
      () => page.evaluate(() => window.__game.audio.samples.has('troop-rock_troll_hit_02.ogg')),
      { timeout: 5000 },
    )
    .toBe(true);
  expect(attempts).toBe(2);
  expect(await page.evaluate(() => JSON.stringify(window.__game.model.battle))).toBe(before.battle);
  expect(await page.evaluate(() => window.__game.audio.samples.active.size)).toBe(0);
});
