import { expect, test } from '@playwright/test';
import { logLauncherRecording } from '../fixtures/attacking-log-launcher';

for (const { level, width } of [
  { level: 1, width: 390 },
  { level: 6, width: 1440 },
])
  test(`rolling Log Launcher ${level} plays original launch and physical contact samples at ${width}`, async ({
    page,
  }) => {
    test.setTimeout(180000);
    const r = logLauncherRecording(level, 224),
      errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewportSize({ width, height: 960 });
    await page.goto('/?lazyart');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').click();
    await page.evaluate(async (data) => {
      const { model, scene, audio } = window.__game,
        { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
      scene.paused = true;
      if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data)))))
        throw Error('Log audio replay rejected');
      model.replay.paused = true;
      audio.enabled = true;
      audio.unlock();
      await audio.context.resume();
      scene.sync();
    }, r.data);
    await expect
      .poll(
        () =>
          page.evaluate(async () => {
            const { scene, audio } = window.__game,
              { troopSoundFiles, troopSample } = await import('/src/game/troop-sounds.ts');
            scene.drawOverlay(0);
            return troopSoundFiles('loglauncher').every((f) => audio.samples.has(troopSample(f)));
          }),
        { timeout: 60000 },
      )
      .toBe(true);
    for (const at of [0.05, 1, 0.05]) {
      const result = await page.evaluate(async (at) => {
        const { model, scene, audio } = window.__game,
          { iso } = await import('/src/game/scene.ts');
        model.seekReplay(at);
        while (model.replay.seeking) model.step(0.05);
        model.changed();
        scene.sync();
        scene.drawOverlay(0);
        const before = JSON.stringify(model.battle),
          shot = model.battle.nativeRollingLogs[0],
          hit = shot.hit.find((h) => h.target.building && h.target.id === 2),
          key = at < 1 ? `${shot.id}:attack` : `${shot.id}:building:2:hit`;
        scene.santaPresentation.render(model.battle, false, true, 1, iso, scene.lastCues);
        const cues = scene.lastCues.filter((c) => c.key === key),
          node = audio.samples.active.get(key);
        scene.santaPresentation.render(model.battle, false, false, 1, iso, scene.lastCues);
        return {
          cues,
          active: !!node,
          rate: node?.source.playbackRate.value,
          unchanged: before === JSON.stringify(model.battle),
          hitAt: hit?.at,
          launched: shot.launched,
          debug: { at, state: audio.context.state, paused: scene.sys.isPaused() },
        };
      }, at);
      expect(result.unchanged).toBe(true);
      expect(result.cues).toHaveLength(1);
      expect(result.active, JSON.stringify(result.debug)).toBe(true);
      expect(result.rate).toBeCloseTo(result.cues[0].pitch, 6);
      expect(result.cues[0].at).toBeCloseTo(at < 1 ? result.launched : result.hitAt!, 8);
    }
    expect(errors).toEqual([]);
  });
