import { expect, test, type Page } from '@playwright/test';
import { garrisonAudioRecording } from '../fixtures/garrison-audio';
import { garrisonSoundCues } from '../../src/game/garrison-sounds';
import type { Battle } from '../../src/game/model';

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

for (const { kind, width, version } of [
  { kind: 'archer', width: 390, version: 146 },
  { kind: 'superminion', width: 1440, version: 146 },
  { kind: 'electrodragon', width: 390, version: 146 },
  { kind: 'royalghost', width: 1440, version: 146 },
  { kind: 'royalghost', width: 390, version: 145 },
] as const)
  test(`${kind} plays source-bound garrison audio at ${width}px, version=${version}`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: width === 390 ? 844 : 960 });
    const r = garrisonAudioRecording(kind, version),
      errors: string[] = [],
      requests: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('request', (request) => {
      if (request.url().includes('/assets/audio/troops-native/')) requests.push(request.url());
    });
    await open(page, r.data);
    await expect
      .poll(
        () =>
          page.evaluate(async () => {
            const { scene, model, audio } = window.__game,
              { garrisonSoundEffects } = await import('/src/game/garrison-native-sounds.ts'),
              { effectSoundFiles, troopSample } = await import('/src/game/troop-sounds.ts');
            scene.drawOverlay(0);
            return [...garrisonSoundEffects(model.battle)]
              .flatMap(effectSoundFiles)
              .every((file) => audio.samples.has(troopSample(file)));
          }),
        { timeout: 30000 },
      )
      .toBe(true);
    expect(await page.evaluate(() => window.__game.model.battle.defenders?.length ?? 0)).toBe(0);
    for (const snapshot of r.snapshots) {
      const actual = await seek(page, snapshot.at, r.defenderId);
      expect(JSON.parse(actual.battle)).toEqual(snapshot.battle);
      expect(actual.cues).toEqual(garrisonSoundCues(snapshot.battle as Battle));
      expect(actual.readOnly).toBe(true);
    }
    const launched = await seek(page, r.launched, r.defenderId);
    await expect
      .poll(
        () =>
          page.evaluate((id) => {
            const s = window.__game.scene;
            s.drawOverlay(0);
            return (
              s.garrisonPresentation.defenders
                .get(id)
                ?.objects.some((o) => o.visible && o.alpha > 0 && o.texture?.key !== '__MISSING') ??
              false
            );
          }, r.defenderId),
        { timeout: 30000 },
      )
      .toBe(true);
    await page.screenshot({
      path: `output/playtest/garrison-audio-${kind}-${version}-${width}.png`,
    });
    if (version === 146) {
      const phases = [{ at: r.launched, key: `garrison:${r.defenderId}:attack:0` }];
      if (kind === 'royalghost')
        phases.push(
          { at: r.spawned, key: `garrison:${r.defenderId}:deploy` },
          { at: r.dead!, key: `garrison:${r.defenderId}:die` },
        );
      for (const phase of phases) {
        const state = await seek(page, phase.at, r.defenderId);
        const actual = await page.evaluate(async (key) => {
          const { model, scene, audio } = window.__game,
            { iso } = await import('/src/game/scene.ts');
          audio.samples.stop();
          scene.santaPresentation.render(model.battle, false, true, 2, iso, scene.lastCues);
          const cue = scene.lastCues.find((cue) => cue.key === key),
            node = audio.samples.active.get(key);
          const result = {
            cue,
            gain: node?.gain.gain.value ?? null,
            rate: node?.source.playbackRate.value ?? null,
            battle: JSON.stringify(model.battle),
          };
          scene.santaPresentation.render(model.battle, false, false, 2, iso, scene.lastCues);
          return { ...result, stopped: audio.samples.active.size === 0 };
        }, phase.key);
        expect(actual.gain).not.toBeNull();
        expect(actual.gain).toBeCloseTo(actual.cue.volume * 0.12, 7);
        expect(actual.rate).toBeCloseTo(actual.cue.pitch * 2, 6);
        expect(actual.battle).toBe(state.battle);
        expect(actual.stopped).toBe(true);
      }
    } else
      expect(requests.some((url) => /groy_dep_01|roysword_01|roysword_vo_01/.test(url))).toBe(
        false,
      );
    await seek(page, r.launched, r.defenderId);
    await page.evaluate(() => window.__game.model.toggleReducedMotion());
    expect(await page.evaluate(() => JSON.stringify(window.__game.model.battle))).toBe(
      launched.battle,
    );
    await page.evaluate(() => window.__game.model.toggleReducedMotion());
    await seek(page, r.spawned, r.defenderId);
    expect(await seek(page, r.launched, r.defenderId)).toEqual(launched);
    expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
    expect(errors).toEqual([]);
  });

test('Royal Ghost source audio recovers while its portable replay remains paused', async ({
  page,
}) => {
  test.setTimeout(90000);
  let blocked = true,
    attempts = 0;
  await page.route('**/assets/audio/troops-native/groy_dep_01.ogg', async (route) => {
    attempts++;
    if (blocked) await route.fulfill({ status: 503, body: 'temporary sample failure' });
    else await route.continue();
  });
  const failure = page.waitForResponse(
      (response) => response.url().endsWith('/groy_dep_01.ogg') && response.status() === 503,
    ),
    r = garrisonAudioRecording('royalghost');
  await open(page, r.data);
  await failure;
  expect(attempts).toBe(1);
  const before = await seek(page, r.spawned, r.defenderId);
  await page.evaluate(() => {
    window.__game.model.replay.paused = true;
    window.__game.scene.paused = false;
  });
  blocked = false;
  await page.evaluate(() => dispatchEvent(new Event('online')));
  await expect
    .poll(() => page.evaluate(() => window.__game.audio.samples.has('troop-groy_dep_01.ogg')), {
      timeout: 5000,
    })
    .toBe(true);
  expect(attempts).toBe(2);
  expect(await page.evaluate(() => JSON.stringify(window.__game.model.battle))).toBe(before.battle);
  expect(await page.evaluate(() => window.__game.model.replay.paused)).toBe(true);
  expect(await page.evaluate(() => window.__game.audio.samples.active.size)).toBe(0);
});
