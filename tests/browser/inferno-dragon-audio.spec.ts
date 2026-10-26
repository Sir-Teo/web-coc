import { expect, test } from '@playwright/test';

for (const { defenders, width } of [
  { defenders: false, width: 1440 },
  { defenders: true, width: 390 },
]) {
  test(`Inferno Dragon loops source stage audio, defenders=${defenders}, ${width}px`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewportSize({ width, height: width === 390 ? 844 : 960 });
    await page.goto('/?lazyart');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').click();
    await page.evaluate(async (defenders) => {
      const { nativeDamageRampRecording } = await import('/tests/fixtures/native-damage-ramp.ts');
      const { replayBattle } = await import('/src/game/replay.ts');
      const r = nativeDamageRampRecording('infernodragon', defenders);
      window.__dragonAudio = r;
      const { model, scene, audio } = window.__game;
      scene.paused = true;
      audio.enabled = true;
      audio.unlock();
      // The actual recorded scouting state, before any deployment; the home army has no Dragon.
      model.battle = replayBattle(r.data.initial);
      model.changed();
      scene.sync();
      scene.drawOverlay(0);
    }, defenders);
    await page.waitForFunction(() => !window.__game.scene.battleArtPending());
    await page.waitForFunction(
      () => window.__game.audio.samples.has('troop-infdragon_fireloop_01.ogg'),
      null,
      { timeout: 30000 },
    );
    const result = await page.evaluate(async () => {
      const { model, scene, audio } = window.__game;
      const { iso } = await import('/src/game/scene.ts');
      const r = window.__dragonAudio;
      const { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
      const preloaded =
        model.battle.units.length === 0 &&
        model.battle.remaining.infernodragon === 1 &&
        !model.state.army.infernodragon;
      model.returnHome();
      if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data)))))
        throw Error('Dragon audio replay rejected');
      await audio.context.resume();
      scene.sys.resume();
      function seek(at: number) {
        model.seekReplay(at);
        while (model.replay.seeking) model.step(0.05);
        model.changed();
        scene.sync();
        scene.drawOverlay(0);
      }
      function play(at: number, speed = 1) {
        seek(at);
        const cues = scene.lastCues;
        const cue = cues.find((c) => c.key.startsWith('inferno-dragon:'));
        if (!cue) throw Error('Missing source dragon loop');
        const before = JSON.stringify(model.battle);
        const render = (playing: boolean, rate = speed) =>
          scene.santaPresentation.render(
            model.battle,
            model.reducedMotion,
            playing,
            rate,
            iso,
            cues,
          );
        render(true);
        const node = audio.samples.active.get(cue.key);
        if (!node) throw Error('Dragon loop did not reach Web Audio');
        const read = {
          cue,
          loop: node.source.loop,
          rate: node.source.playbackRate.value,
          gain: node.gain.gain.value,
          voices: [...audio.samples.active.keys()].filter((k) => k.startsWith('inferno-dragon:'))
            .length,
        };
        render(true);
        const retained = audio.samples.active.get(cue.key).source === node.source;
        render(true, 2);
        const doubled = audio.samples.active.get(cue.key).source.playbackRate.value;
        render(false);
        const paused = audio.samples.active.size === 0;
        render(true);
        const resumed = audio.samples.active.get(cue.key).source !== node.source;
        return {
          ...read,
          retained,
          doubled,
          paused,
          resumed,
          unchanged: JSON.stringify(model.battle) === before,
        };
      }
      const stages = [r.initial, r.middle, r.maximum].map((at) => play(at));
      const retargeted = play(r.retargeted);
      const backward = play(r.initial);
      model.toggleReducedMotion();
      const reduced = play(r.maximum);
      audio.enabled = false;
      const muted = audio.samples.active.size === 0;
      model.returnHome();
      scene.sync();
      scene.drawOverlay(0);
      return {
        preloaded,
        stages,
        retargeted,
        backward,
        reduced,
        muted,
        cleared: audio.samples.active.size === 0,
        gl: window.__game.game.renderer.gl.getError(),
      };
    });
    expect(result.preloaded).toBe(true);
    for (const [stage, sound] of result.stages.entries()) {
      const pitch = [1, 1.2, 1.4][stage];
      expect(sound).toMatchObject({
        loop: true,
        voices: 1,
        retained: true,
        paused: true,
        resumed: true,
        unchanged: true,
      });
      expect(sound.rate).toBeCloseTo(pitch, 6);
      expect(sound.doubled).toBeCloseTo(pitch * 2, 6);
      expect(sound.gain).toBeCloseTo(0.036, 6);
    }
    expect(new Set(result.stages.map((s) => s.cue.key)).size).toBe(3);
    expect(result.retargeted.rate).toBe(1);
    expect(result.retargeted.cue.key).not.toBe(result.stages[0].cue.key);
    expect(result.backward.cue.key).toBe(result.stages[0].cue.key);
    expect(result.reduced.rate).toBeCloseTo(1.4, 6);
    expect(result.muted && result.cleared).toBe(true);
    expect(result.gl).toBe(0);
    expect(errors).toEqual([]);
  });
}
