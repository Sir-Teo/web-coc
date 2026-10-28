import { expect, test, type Page } from '@playwright/test';
import { wallBreakerRecording } from '../fixtures/attacking-wall-breaker';
import { superWallBreakerRecording } from '../fixtures/attacking-super-wall-breaker';
import { BattleSoundLog, troopSoundCues } from '../../src/game/troop-sounds';
const relevant = (battle: Parameters<typeof troopSoundCues>[0], id: number) =>
  troopSoundCues(battle, new BattleSoundLog()).filter(
    (c) =>
      c.key === `troop:${id}:die` ||
      c.key.startsWith(`troop:${id}:attack:`) ||
      c.key.startsWith(`troop:${id}:hit:`),
  );

test('Wall Breaker death clip retries a 503 while paused and then covers the generated tone', async ({
  page,
}) => {
  test.setTimeout(90000);
  let blocked = true,
    attempts = 0;
  await page.route('**/assets/audio/troops-native/wall_breaker_die_01.ogg', async (route) => {
    attempts++;
    if (blocked) await route.fulfill({ status: 503, body: 'temporary death clip failure' });
    else await route.continue();
  });
  const failed = page.waitForResponse(
      (response) =>
        response.url().includes('/wall_breaker_die_01.ogg') && response.status() === 503,
    ),
    r = wallBreakerRecording(207);
  await open(page, r.data);
  await failed;
  expect(attempts).toBe(1);
  const before = await seek(page, r.exploded, r.id);
  const tone = () =>
    page.evaluate((id) => {
      const { model, scene, audio } = window.__game,
        u = model.battle.units.find((u) => u.id === id),
        played: string[] = [],
        fed: string[] = [],
        play = audio.play,
        feedback = audio.feedback;
      audio.play = (kind) => {
        played.push(kind);
      };
      audio.feedback = (kind) => {
        fed.push(kind);
      };
      try {
        scene.renderEffect({ type: 'blast', sourceId: id, x: u.x, y: u.y, radius: 1.5 });
        return { played, fed, covered: scene.fxSounded };
      } finally {
        audio.play = play;
        audio.feedback = feedback;
      }
    }, r.id);
  expect(await tone()).toEqual({ played: ['destroy'], fed: [], covered: false });
  blocked = false;
  await page.evaluate(() => {
    window.__game.model.replay.paused = true;
    window.__game.scene.paused = false;
    dispatchEvent(new Event('online'));
  });
  await expect
    .poll(
      () => page.evaluate(() => window.__game.audio.samples.has('troop-wall_breaker_die_01.ogg')),
      { timeout: 5000 },
    )
    .toBe(true);
  expect(attempts).toBe(2);
  expect(await tone()).toEqual({ played: [], fed: ['destroy'], covered: true });
  expect(await page.evaluate(() => JSON.stringify(window.__game.model.battle))).toBe(before.battle);
  expect(await page.evaluate(() => window.__game.audio.samples.active.size)).toBe(0);
});

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
      throw Error('Wall Breaker audio replay rejected');
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
      const before = JSON.stringify(model.battle);
      scene.drawOverlay(0);
      const { troopSoundCues, BattleSoundLog } = await import('/src/game/troop-sounds.ts');
      return {
        battle: before,
        readOnly: before === JSON.stringify(model.battle),
        cues: troopSoundCues(model.battle, new BattleSoundLog()).filter(
          (c) =>
            c.key === `troop:${id}:die` ||
            c.key.startsWith(`troop:${id}:attack:`) ||
            c.key.startsWith(`troop:${id}:hit:`),
        ),
      };
    },
    { at, id },
  );
}
for (const c of [
  { kind: 'wallbreaker', version: 207, level: 1, target: 'storage', width: 390 },
  { kind: 'wallbreaker', version: 207, level: 14, target: 'cannon', width: 1440 },
  { kind: 'superwallbreaker', version: 207, level: 1, target: 'storage', width: 390 },
  { kind: 'superwallbreaker', version: 207, level: 10, target: 'wall', width: 1440 },
  { kind: 'wallbreaker', version: 206, level: 14, target: 'storage', width: 1440 },
  { kind: 'superwallbreaker', version: 206, level: 1, target: 'cannon', width: 390 },
] as const)
  test(`${c.kind} source contact audio v${c.version} tier${c.level} ${c.target} at${c.width}px`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    const record = c.kind === 'wallbreaker' ? wallBreakerRecording : superWallBreakerRecording,
      r = record(c.version, c.level, c.target, c.target === 'wall' ? 6.9 : 11.4),
      errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('response', (response) => {
      if (response.status() >= 400 && response.url().includes('/assets/'))
        errors.push(response.url());
    });
    await page.setViewportSize({ width: c.width, height: c.width === 390 ? 844 : 960 });
    await open(page, r.data);
    const samples = [
      'troop-wall_breaker_attack_01.ogg',
      'troop-cannon_fire3.ogg',
      c.kind === 'wallbreaker' ? 'troop-wall_breaker_die_01.ogg' : 'troop-mortar_hit_01.ogg',
    ];
    await expect
      .poll(
        () =>
          page.evaluate(
            (samples) => samples.every((sample) => window.__game.audio.samples.has(sample)),
            samples,
          ),
        { timeout: 30000 },
      )
      .toBe(true);
    for (const s of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
      const state = await seek(page, s.at, r.id);
      expect(JSON.parse(state.battle)).toEqual(s.battle);
      expect(state.cues).toEqual(relevant(s.battle, r.id));
      expect(state.readOnly).toBe(true);
    }
    const after = await seek(page, r.exploded, r.id),
      heard = new Set<string>();
    expect(after.cues.filter((c) => /:attack:|:hit:/.test(c.key))).toHaveLength(
      c.version === 207 ? 2 : 0,
    );
    for (const expected of after.cues) {
      const playing = await page.evaluate(
        async ({ key, id }) => {
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
              beforeLog = JSON.stringify(scene.battleSounds.cues(model.battle)),
              u = model.battle.units.find((u) => u.id === id);
            scene.recordBattleSound({
              type: 'hit',
              sourceId: id,
              targetBuilding: true,
              targetId: 2,
              x: u.x,
              y: u.y,
              toX: 14.5,
              toY: 11.5,
            });
            const covered = scene.fxSounded,
              sameLog = beforeLog === JSON.stringify(scene.battleSounds.cues(model.battle));
            const result = {
              cue,
              gain: node?.gain.gain.value,
              rate: node?.source.playbackRate.value,
              offset: calls.find((c) => c.source === node?.source)?.offset,
              covered,
              sameLog,
              duration: audio.samples.buffers.get(cue.sample)?.duration,
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
        },
        { key: expected.key, id: r.id },
      );
      expect(playing.cue).toEqual(expected);
      if ((r.exploded - expected.at) * expected.pitch < playing.duration) {
        heard.add(expected.sample);
        expect(playing.gain).toBeCloseTo(expected.volume * 0.12, 7);
        expect(playing.rate).toBeCloseTo(expected.pitch * 2, 6);
        expect(playing.offset).toBeCloseTo((r.exploded - expected.at) * expected.pitch, 7);
      }
      expect(playing.covered).toBe(true);
      if (c.version === 207) expect(playing.sameLog).toBe(true);
      expect(playing.stopped).toBe(true);
      expect(playing.battle).toBe(after.battle);
    }
    if (c.version === 207) expect([...heard].sort()).toEqual(samples.slice().sort());
    const tone = await page.evaluate((id) => {
      const { model, scene, audio } = window.__game,
        u = model.battle.units.find((u) => u.id === id),
        played: string[] = [],
        fed: string[] = [],
        play = audio.play,
        feedback = audio.feedback;
      audio.play = (kind) => {
        played.push(kind);
      };
      audio.feedback = (kind) => {
        fed.push(kind);
      };
      try {
        scene.renderEffect({ type: 'blast', sourceId: id, x: u.x, y: u.y, radius: 1.5 });
        return { played, fed, covered: scene.fxSounded, battle: JSON.stringify(model.battle) };
      } finally {
        audio.play = play;
        audio.feedback = feedback;
      }
    }, r.id);
    expect(tone.covered).toBe(c.version === 207);
    expect(tone.played).toEqual(c.version === 207 ? [] : ['destroy']);
    expect(tone.fed).toEqual(c.version === 207 ? ['destroy'] : []);
    expect(tone.battle).toBe(after.battle);
    await page.evaluate(() => window.__game.model.toggleReducedMotion());
    expect(await page.evaluate(() => JSON.stringify(window.__game.model.battle))).toBe(
      after.battle,
    );
    expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
    expect(errors).toEqual([]);
  });
