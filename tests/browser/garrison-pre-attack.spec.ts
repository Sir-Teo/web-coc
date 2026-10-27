import { expect, test, type Page } from '@playwright/test';
import { garrisonPreAttackRecording } from '../fixtures/garrison-pre-attack';
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

for (const { version, width, frozen } of [
  { version: 154, width: 390, frozen: false },
  { version: 154, width: 1440, frozen: true },
  { version: 153, width: 1440, frozen: false },
  { version: 153, width: 390, frozen: true },
])
  test(`Electro Dragon charge audio at ${width}px, version=${version}, Freeze=${frozen}`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: width === 390 ? 844 : 960 });
    const r = garrisonPreAttackRecording(version, frozen),
      errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await open(page, r.data);
    if (version === 154)
      await expect
        .poll(
          () =>
            page.evaluate(() =>
              window.__game.audio.samples.has('troop-electro_dragon_sfx_atk_01.ogg'),
            ),
          { timeout: 30000 },
        )
        .toBe(true);
    for (const snapshot of r.snapshots) {
      const actual = await seek(page, snapshot.at, r.id);
      expect(JSON.parse(actual.battle)).toEqual(snapshot.battle);
      expect(actual.cues).toEqual(garrisonSoundCues(snapshot.battle));
      expect(actual.readOnly).toBe(true);
    }
    for (const at of [
      r.charged,
      ...(frozen ? [r.frozen!, r.resumed!] : []),
      r.first,
      r.nextCharge,
    ]) {
      const state = await seek(page, at, r.id),
        expected = state.cues.find((c) => c.key.includes(':preAttack:')),
        playing = await page.evaluate(async () => {
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
            const cue = scene.lastCues.find((c) => c.key.includes(':preAttack:')),
              node = cue && audio.samples.active.get(cue.key),
              result = {
                cue,
                gain: node?.gain.gain.value ?? null,
                rate: node?.source.playbackRate.value ?? null,
                offset: calls.find((c) => c.source === node?.source)?.offset ?? null,
                battle: JSON.stringify(model.battle),
              };
            scene.santaPresentation.render(model.battle, false, false, 2, iso, scene.lastCues);
            return { ...result, stopped: audio.samples.active.size === 0 };
          } finally {
            AudioBufferSourceNode.prototype.start = start;
          }
        });
      expect(playing.cue).toEqual(expected);
      if (expected) {
        expect(playing.gain).toBeCloseTo(0.06, 7);
        expect(playing.rate).toBeCloseTo(2, 6);
        expect(playing.offset).toBeCloseTo(at - expected.at, 7);
      } else expect(playing.gain).toBeNull();
      expect(playing.stopped).toBe(true);
      expect(playing.battle).toBe(state.battle);
    }
    const charged = await seek(page, r.charged, r.id);
    await page.screenshot({
      path: `output/playtest/garrison-charge-${version}-${width}-${frozen}.png`,
    });
    await seek(page, r.spawned, r.id);
    expect(await seek(page, r.charged, r.id)).toEqual(charged);
    await page.evaluate(() => window.__game.model.toggleReducedMotion());
    expect(await page.evaluate(() => JSON.stringify(window.__game.model.battle))).toBe(
      charged.battle,
    );
    expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
    expect(errors).toEqual([]);
  });

test('Electro Dragon charge sample recovers from a 503 while playback stays paused', async ({
  page,
}) => {
  test.setTimeout(90000);
  let blocked = true,
    attempts = 0;
  await page.route('**/assets/audio/troops-native/electro_dragon_sfx_atk_01.ogg', async (route) => {
    attempts++;
    if (blocked) await route.fulfill({ status: 503, body: 'temporary charge sample failure' });
    else await route.continue();
  });
  const failure = page.waitForResponse(
      (r) => r.url().includes('/electro_dragon_sfx_atk_01.ogg') && r.status() === 503,
    ),
    r = garrisonPreAttackRecording();
  await open(page, r.data);
  await failure;
  expect(attempts).toBe(1);
  const before = await seek(page, r.charged, r.id);
  await page.evaluate(() => {
    window.__game.model.replay.paused = true;
    window.__game.scene.paused = false;
  });
  blocked = false;
  await page.evaluate(() => dispatchEvent(new Event('online')));
  await expect
    .poll(
      () =>
        page.evaluate(() => window.__game.audio.samples.has('troop-electro_dragon_sfx_atk_01.ogg')),
      { timeout: 5000 },
    )
    .toBe(true);
  expect(attempts).toBe(2);
  expect(await page.evaluate(() => JSON.stringify(window.__game.model.battle))).toBe(before.battle);
  expect(await page.evaluate(() => window.__game.model.replay.paused)).toBe(true);
  expect(await page.evaluate(() => window.__game.audio.samples.active.size)).toBe(0);
});
