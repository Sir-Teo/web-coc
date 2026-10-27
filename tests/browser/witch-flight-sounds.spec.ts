import { expect, test, type Page } from '@playwright/test';
import { witchFlightRecording } from '../fixtures/witch-flight';
import { witchFlightSoundCues } from '../../src/game/troop-sounds';

async function open(page: Page, data: unknown) {
  await page.goto('/?lazyart');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  await page.evaluate(async (data) => {
    const { model, scene, audio } = window.__game,
      { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
    scene.paused = true;
    audio.enabled = true;
    audio.unlock();
    await audio.context.resume();
    if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data)))))
      throw Error('Witch audio replay rejected');
    model.replay.paused = true;
    scene.sync();
    scene.drawOverlay(0);
  }, data);
}
async function seek(page: Page, at: number) {
  return page.evaluate((at) => {
    const { model, scene } = window.__game;
    model.seekReplay(at);
    while (model.replay.seeking) model.step(0.05);
    model.changed();
    scene.sync();
    const battle = JSON.stringify(model.battle);
    scene.drawOverlay(0);
    return { battle, readOnly: battle === JSON.stringify(model.battle) };
  }, at);
}
for (const c of [
  { version: 168, width: 390, superTroop: false, level: 1 },
  { version: 168, width: 1440, superTroop: false, level: 8 },
  { version: 168, width: 390, superTroop: true, level: 8 },
  { version: 168, width: 1440, superTroop: true, level: 1 },
  { version: 167, width: 1440, superTroop: false, level: 1 },
  { version: 167, width: 390, superTroop: true, level: 8 },
])
  test(`${c.superTroop ? 'Super Witch' : 'Witch'} ${c.level} original launch/impact audio after seeks, v${c.version}, ${c.width}px`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width: c.width, height: c.width === 390 ? 844 : 960 });
    const r = witchFlightRecording(c.version, c.superTroop, c.level),
      keys = [`troop:${r.id}:attack:${r.shot.launched}`, `troop:${r.id}:hit:${r.shot.impact}`],
      errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await open(page, r.data);
    await expect
      .poll(
        () =>
          page.evaluate(
            (superTroop) =>
              [
                'troop-' + (superTroop ? 'super_witch_deploy_01.ogg' : 'slimeball_fire_05.ogg'),
                'troop-wizard_hit_01.ogg',
              ].every((k) => window.__game.audio.samples.has(k)),
            c.superTroop,
          ),
        { timeout: 30000 },
      )
      .toBe(true);
    for (const snapshot of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
      const actual = await seek(page, snapshot.at);
      expect(JSON.parse(actual.battle)).toEqual(snapshot.battle);
      expect(actual.readOnly).toBe(true);
      const expected = witchFlightSoundCues(snapshot.battle).filter((c) => keys.includes(c.key));
      const played = await page.evaluate(async (keys) => {
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
        const battle = JSON.stringify(model.battle);
        audio.samples.stop();
        try {
          scene.santaPresentation.render(model.battle, false, true, 2, iso, scene.lastCues);
          const cues = scene.lastCues.filter((c) => keys.includes(c.key)),
            voices = cues.map((c) => {
              const node = audio.samples.active.get(c.key);
              return {
                key: c.key,
                duration: audio.samples.buffers.get(c.sample)?.duration,
                gain: node?.gain.gain.value ?? null,
                rate: node?.source.playbackRate.value ?? null,
                offset: calls.find((x) => x.source === node?.source)?.offset ?? null,
              };
            });
          scene.santaPresentation.render(model.battle, false, false, 2, iso, scene.lastCues);
          return {
            cues,
            voices,
            stopped: audio.samples.active.size === 0,
            readOnly: battle === JSON.stringify(model.battle),
          };
        } finally {
          AudioBufferSourceNode.prototype.start = start;
        }
      }, keys);
      expect(played.cues).toEqual(expected);
      expect(new Set(played.cues.map((c) => c.key)).size).toBe(played.cues.length);
      for (const cue of expected) {
        const voice = played.voices.find((v) => v.key === cue.key)!,
          age = Math.max(0, (snapshot.at - cue.at) * cue.pitch);
        expect(voice.duration).toBeGreaterThan(0);
        if (age < voice.duration) {
          expect(voice.gain).toBeCloseTo(cue.volume * 0.12, 6);
          expect(voice.rate).toBeCloseTo(cue.pitch * 2, 6);
          expect(voice.offset).toBeCloseTo(age, 6);
        } else expect(voice.gain).toBeNull();
      }
      expect(played.stopped).toBe(true);
      expect(played.readOnly).toBe(true);
    }
    expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
    expect(errors).toEqual([]);
  });

test('Witch impact sample recovers from a real 503 while paused without replay mutation', async ({
  page,
}) => {
  test.setTimeout(120000);
  let blocked = true,
    attempts = 0;
  await page.route('**/assets/audio/troops-native/wizard_hit_01.ogg', async (route) => {
    attempts++;
    if (blocked) await route.fulfill({ status: 503, body: 'temporary Witch hit sample failure' });
    else await route.continue();
  });
  const r = witchFlightRecording(),
    failure = page.waitForResponse(
      (r) => r.url().includes('/wizard_hit_01.ogg') && r.status() === 503,
    );
  await open(page, r.data);
  await failure;
  const before = await seek(page, r.tail);
  expect(
    await page.evaluate(() => window.__game.audio.samples.has('troop-wizard_hit_01.ogg')),
  ).toBe(false);
  blocked = false;
  await page.evaluate(() => {
    window.__game.scene.paused = false;
    dispatchEvent(new Event('online'));
  });
  await expect
    .poll(() => page.evaluate(() => window.__game.audio.samples.has('troop-wizard_hit_01.ogg')), {
      timeout: 15000,
    })
    .toBe(true);
  expect(attempts).toBeGreaterThanOrEqual(2);
  expect(await page.evaluate(() => JSON.stringify(window.__game.model.battle))).toBe(before.battle);
  expect(await page.evaluate(() => window.__game.model.replay.paused)).toBe(true);
  expect(await page.evaluate(() => window.__game.audio.samples.active.size)).toBe(0);
});
