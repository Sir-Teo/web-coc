import { expect, test, type Page } from '@playwright/test';
import { superBowlerRecording } from '../fixtures/attacking-super-bowler';
import { BattleSoundLog, troopSoundCues } from '../../src/game/troop-sounds';

async function open(page: Page, data: unknown) {
  await page.goto('/?lazyart');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  await page.evaluate(async (data) => {
    const { model, scene, audio } = window.__game,
      { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
    scene.paused = true;
    const { replayBattle } = await import('/src/game/replay.ts');
    model.state.army = structuredClone(data.initial.army);
    model.state.troopLevels = structuredClone(data.initial.troopLevels);
    model.state.spells = structuredClone(data.initial.spells);
    model.state.spellLevels = structuredClone(data.initial.spellLevels);
    model.changed();
    scene.sync();
    scene.drawOverlay(0);
    const signature = scene.armyPrefetchSignature;
    model.battle = replayBattle(data.initial, data.version);
    model.changed();
    scene.sync();
    scene.drawOverlay(0);
    if (signature !== scene.armyPrefetchSignature)
      throw Error('Same-roster prefetch signature changed');
    model.returnHome();
    audio.enabled = true;
    audio.unlock();
    await audio.context.resume();
    if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data)))))
      throw Error('Super Bowler audio replay rejected');
    model.replay.paused = true;
    model.changed();
    scene.sync();
    scene.drawOverlay(0);
  }, data);
}
async function seek(page: Page, at: number) {
  return page.evaluate(async (at) => {
    const { model, scene } = window.__game;
    model.seekReplay(at);
    while (model.replay.seeking) model.step(0.05);
    model.changed();
    scene.sync();
    const battle = JSON.stringify(model.battle);
    scene.drawOverlay(0);
    const { troopSoundCues, BattleSoundLog } = await import('/src/game/troop-sounds.ts');
    return {
      battle,
      cues: troopSoundCues(model.battle, new BattleSoundLog()).filter((c) =>
        c.key.startsWith('superbowler:'),
      ),
      readOnly: battle === JSON.stringify(model.battle),
    };
  }, at);
}
for (const { version, width, level, target } of [
  { version: 203, width: 390, level: 1, target: 'storage' },
  { version: 203, width: 1440, level: 10, target: 'cannon' },
  { version: 203, width: 390, level: 10, target: 'golem' },
  { version: 203, width: 1440, level: 1, target: 'golem' },
  { version: 202, width: 1440, level: 10, target: 'storage' },
  { version: 202, width: 390, level: 1, target: 'golem' },
] as const)
  test(`Super Bowler source contact audio at ${width}px, version=${version}, tier=${level}, target=${target}`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: width === 390 ? 844 : 960 });
    const r = superBowlerRecording(version, level, target),
      errors: string[] = [],
      requests: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('response', (r) => {
      if (r.status() >= 400 && r.url().includes('/assets/')) errors.push(r.url());
    });
    page.on('request', (r) => requests.push(r.url()));
    await open(page, r.data);
    if (version === 203)
      await expect
        .poll(
          () =>
            page.evaluate(
              () =>
                window.__game.audio.samples.has('troop-sup_troll_rb_01.ogg') &&
                window.__game.audio.samples.has('troop-rock_troll_explo_01.ogg'),
            ),
          { timeout: 30000 },
        )
        .toBe(true);
    if (version === 203)
      expect(requests.some((p) => p.includes('/sup_troll_rb_01.ogg'))).toBe(true);
    for (const snapshot of r.snapshots) {
      const state = await seek(page, snapshot.at);
      expect(JSON.parse(state.battle)).toEqual(snapshot.battle);
      expect(state.cues).toEqual(
        troopSoundCues(snapshot.battle, new BattleSoundLog()).filter((c) =>
          c.key.startsWith('superbowler:'),
        ),
      );
      expect(state.readOnly).toBe(true);
    }
    const heard = new Set<string>();
    const reference = version === 203 ? r : superBowlerRecording(203, level, target),
      impacts = reference.snapshots
        .find((s) => s.at === reference.landed)!
        .battle.nativeSuperBowlerImpacts!.slice(0, 3),
      contactFrames = impacts.map((h) => Math.ceil((h.at - 1e-9) * 20) / 20);
    for (const at of contactFrames) {
      const state = await seek(page, at);
      for (const expected of state.cues) {
        const playing = await page.evaluate(async (key) => {
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
              node = audio.samples.active.get(key),
              impact = model.battle.nativeSuperBowlerImpacts.find((p) =>
                key.startsWith(`superbowler:${p.id}:${p.bounce}:`),
              );
            const beforeLog = JSON.stringify(scene.battleSounds.cues(model.battle));
            scene.recordBattleSound({ type: 'impact', projectileId: impact.id, x: 0, y: 0 });
            const result = {
              cue,
              duration: audio.samples.buffers.get(cue.sample)?.duration,
              gain: node?.gain.gain.value,
              rate: node?.source.playbackRate.value,
              offset: calls.find((c) => c.source === node?.source)?.offset,
              covered: scene.fxSounded,
              unchangedLog: beforeLog === JSON.stringify(scene.battleSounds.cues(model.battle)),
              duplicates: scene.battleSounds
                .cues(model.battle)
                .filter((c) => c.key.startsWith('superbowler:')).length,
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
        }, expected.key);
        expect(playing.cue).toEqual(expected);
        // Recent records deliberately outlive the short sample; spent clips stay silent.
        if ((at - expected.at) * expected.pitch < playing.duration) {
          heard.add(expected.sample);
          expect(playing.gain).toBeCloseTo(expected.volume * 0.12, 7);
          expect(playing.rate).toBeCloseTo(expected.pitch * 2, 6);
          expect(playing.offset).toBeCloseTo((at - expected.at) * expected.pitch, 7);
        } else {
          expect(playing.gain).toBeUndefined();
          expect(playing.offset).toBeUndefined();
        }
        expect(playing.covered).toBe(true);
        expect(playing.unchangedLog).toBe(true);
        expect(playing.duplicates).toBe(0);
        expect(playing.stopped).toBe(true);
        expect(playing.battle).toBe(state.battle);
      }
    }
    if (version === 203)
      expect([...heard].sort()).toEqual([
        'troop-rock_troll_explo_01.ogg',
        'troop-sup_troll_rb_01.ogg',
      ]);
    const settled = await seek(page, r.landed);
    await seek(page, r.flight);
    expect(await seek(page, r.landed)).toEqual(settled);
    await page.evaluate(() => window.__game.model.toggleReducedMotion());
    expect(await page.evaluate(() => JSON.stringify(window.__game.model.battle))).toBe(
      settled.battle,
    );
    expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
    expect(errors).toEqual([]);
  });

test('Super Bowler bounce Ogg retries a 503 while replay remains paused', async ({ page }) => {
  test.setTimeout(90000);
  let blocked = true,
    attempts = 0;
  await page.route('**/assets/audio/troops-native/sup_troll_rb_01.ogg', async (route) => {
    attempts++;
    if (blocked) await route.fulfill({ status: 503, body: 'temporary bounce sample failure' });
    else await route.continue();
  });
  const failure = page.waitForResponse(
      (r) => r.url().includes('/sup_troll_rb_01.ogg') && r.status() === 503,
    ),
    r = superBowlerRecording();
  await open(page, r.data);
  await failure;
  expect(attempts).toBe(1);
  const before = await seek(page, r.impact);
  await page.evaluate(() => {
    window.__game.model.replay.paused = true;
    window.__game.scene.paused = false;
  });
  blocked = false;
  await page.evaluate(() => dispatchEvent(new Event('online')));
  await expect
    .poll(() => page.evaluate(() => window.__game.audio.samples.has('troop-sup_troll_rb_01.ogg')), {
      timeout: 5000,
    })
    .toBe(true);
  expect(attempts).toBe(2);
  expect(await page.evaluate(() => JSON.stringify(window.__game.model.battle))).toBe(before.battle);
  expect(await page.evaluate(() => window.__game.audio.samples.active.size)).toBe(0);
});
