import { expect, test } from '@playwright/test';

for (const { kind, width, sample, volume } of [
  { kind: 'unicorn', width: 390, sample: 'troop-clash_pet_horse_heal_01.ogg', volume: 0.8 },
  { kind: 'phoenix', width: 1440, sample: 'troop-pet_phoenix_deploy_01.ogg', volume: 0.9 },
]) {
  test(`carried ${kind} preloads and plays its source sample at ${width}px`, async ({ page }) => {
    test.setTimeout(120000);
    const errors: string[] = [];
    const requested: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => requested.push(new URL(request.url()).pathname));
    await page.setViewportSize({ width, height: width === 390 ? 844 : 960 });
    await page.goto('/?lazyart');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').click();
    await page.evaluate(async (kind) => {
      const { model, scene, audio } = window.__game;
      const { replayBattle } = await import('/src/game/replay.ts');
      const r =
        kind === 'unicorn'
          ? (await import('/tests/fixtures/native-unicorn.ts')).nativeUnicornRecording('king', 1)
          : (await import('/tests/fixtures/native-phoenix.ts')).nativePhoenixRecording(1);
      window.__petSound = r;
      scene.paused = true;
      audio.enabled = true;
      audio.unlock();
      await audio.context.resume();
      model.battle = replayBattle(r.data.initial);
      model.changed();
      scene.sync();
      scene.drawOverlay(0);
    }, kind);
    await page.waitForFunction(() => !window.__game.scene.battleArtPending());
    await page.waitForFunction(async (kind) => {
      const { troopSoundFiles, troopSample } = await import('/src/game/troop-sounds.ts');
      const files = troopSoundFiles(kind);
      return (
        files.length > 0 &&
        files.every((path) => window.__game.audio.samples.has(troopSample(path)))
      );
    }, kind);
    expect(await page.evaluate(() => window.__game.model.battle.units.length)).toBe(0);
    const basename = sample.slice('troop-'.length);
    expect(requested).toContain('/assets/audio/troops-native/' + basename);
    expect(requested.some((path) => path.includes('clash_pet_yak_'))).toBe(false);
    await page.evaluate(async () => {
      const { model, scene } = window.__game;
      const { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
      model.returnHome();
      if (
        !model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(window.__petSound.data))))
      )
        throw Error('Pet sound replay rejected');
      scene.sync();
      scene.drawOverlay(0);
    });
    await page.waitForFunction(() => !window.__game.scene.battleArtPending());
    const result = await page.evaluate(
      async ({ kind, sample }) => {
        const { model, scene, audio } = window.__game;
        const { iso } = await import('/src/game/scene.ts');
        const r = window.__petSound;
        let silentEgg = true;
        if (kind === 'phoenix') {
          model.seekReplay(r.waiting);
          while (model.replay.seeking) model.step(0.05);
          model.changed();
          scene.sync();
          scene.drawOverlay(0);
          silentEgg = !scene.lastCues.some((cue) => cue.sample === sample);
          model.seekReplay(r.hatched + 0.05);
          while (model.replay.seeking) model.step(0.05);
        } else {
          model.replay.playing = true;
          model.step(0.05);
          model.replay.playing = false;
        }
        model.changed();
        scene.sync();
        scene.drawOverlay(0);
        const before = JSON.stringify(model.battle);
        const cue = scene.lastCues.find((cue) => cue.sample === sample);
        if (!cue) throw Error('Pet source cue missing: ' + sample);
        const render = (playing: boolean, speed = 1) =>
          scene.santaPresentation.render(
            model.battle,
            model.reducedMotion,
            playing,
            speed,
            iso,
            scene.lastCues,
          );
        render(true);
        const node = audio.samples.active.get(cue.key);
        if (!node) throw Error('Pet sample did not reach Web Audio');
        const rate = node.source.playbackRate.value,
          gain = node.gain.gain.value;
        render(true);
        const retained = audio.samples.active.get(cue.key).source === node.source;
        render(true, 2);
        const doubled = audio.samples.active.get(cue.key).source.playbackRate.value;
        render(false);
        const paused = audio.samples.active.size === 0;
        render(true);
        const resumed = audio.samples.active.get(cue.key).source !== node.source;
        audio.enabled = false;
        const muted = audio.samples.active.size === 0;
        const unchanged = before === JSON.stringify(model.battle);
        const at = kind === 'phoenix' ? r.hatched : 0.05;
        model.returnHome();
        scene.sync();
        scene.drawOverlay(0);
        return {
          cue,
          at,
          rate,
          gain,
          loop: node.source.loop,
          retained,
          doubled,
          paused,
          resumed,
          muted,
          unchanged,
          silentEgg,
          cleared: audio.samples.active.size === 0,
          gl: window.__game.game.renderer.gl.getError(),
        };
      },
      { kind, sample },
    );
    expect(result).toMatchObject({
      loop: false,
      retained: true,
      paused: true,
      resumed: true,
      muted: true,
      unchanged: true,
      silentEgg: true,
      cleared: true,
      gl: 0,
    });
    expect(result.cue.at).toBeCloseTo(result.at, 8);
    expect(result.rate).toBeCloseTo(result.cue.pitch, 6);
    expect(result.doubled).toBeCloseTo(result.cue.pitch * 2, 6);
    expect(result.gain).toBeCloseTo(volume * 0.12, 6);
    expect(errors).toEqual([]);
  });
}
