import { expect, test, type Page } from '@playwright/test';
import { nativeSuperArcherRecording } from '../fixtures/native-super-archer';
async function seek(page: Page, at: number) {
  return page.evaluate(async (at) => {
    const { model, scene } = window.__game,
      r = window.__superArcher;
    model.seekReplay(at);
    while (model.replay.seeking) model.step(0.05);
    model.changed();
    scene.sync();
    const { iso } = await import('/src/game/scene.ts'),
      point = iso(r.anchor.x, r.anchor.y);
    scene.cameras.main.setZoom(1.35).centerOn(point.x, point.y - 100);
    const before = JSON.stringify(model.battle);
    scene.drawOverlay(0);
    const shot = model.battle.nativeArcherShots?.find((s) => s.id === r.shotId);
    return {
      battle: before,
      hits: shot?.hit.length ?? 0,
      shots: model.battle.nativeArcherShots?.length ?? 0,
      travelled: shot?.travelled ?? 0,
      length: shot?.length ?? 0,
      unchanged: before === JSON.stringify(model.battle),
      gl: window.__game.game.renderer.gl.getError(),
    };
  }, at);
}
for (const { level, mode, width } of [
  { level: 1, mode: 'buildings', width: 390 },
  { level: 10, mode: 'defender', width: 1440 },
] as const)
  test(`Super Archer ${level} keeps original arrows flying through ${mode} at ${width}px`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    // The original recording and expected state are generated in Node, then executed in Chromium.
    const recording = nativeSuperArcherRecording(level, mode),
      { snapshots, ...r } = recording,
      expected = JSON.stringify(snapshots.find((s) => s.at === r.passedPrimary)!.battle);
    const errors: string[] = [],
      requests: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (e) => {
      if (e.type() === 'error') errors.push(e.text());
    });
    page.on('request', (req) => requests.push(new URL(req.url()).pathname));
    await page.setViewportSize({ width, height: 960 });
    await page.goto('/?lazyart');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').click();
    const same = await page.evaluate(async (r) => {
      window.__superArcher = r;
      const { model, scene, audio } = window.__game,
        { replayBattle } = await import('/src/game/replay.ts');
      scene.paused = true;
      audio.enabled = true;
      audio.unlock();
      await audio.context.resume();
      model.state.army = structuredClone(r.data.initial.army);
      model.state.troopLevels = structuredClone(r.data.initial.troopLevels);
      model.changed();
      scene.sync();
      scene.drawOverlay(0);
      const signature = scene.armyPrefetchSignature;
      model.battle = replayBattle(r.data.initial);
      model.changed();
      scene.sync();
      scene.drawOverlay(0);
      return signature === scene.armyPrefetchSignature;
    }, r);
    expect(same).toBe(true);
    for (const name of ['attack', 'hit'])
      await expect
        .poll(() => requests.includes(`/assets/super-archer-native/${name}/graph.json`))
        .toBe(true);
    expect(requests).toContain('/assets/projectiles-native/magic-archer-projectile/graph.json');
    await page.waitForFunction(async (level) => {
      const { model, scene, audio } = window.__game,
        { troopSoundFiles, troopSample } = await import('/src/game/troop-sounds.ts');
      return (
        model.battle.units.length === 0 &&
        !scene.battleArtPending() &&
        scene.troopNativePresentation.levelsReady.get('superarcher')?.has(level) &&
        troopSoundFiles('superarcher').every((f) => audio.samples.has(troopSample(f))) &&
        ['IceArcher_attack', 'IceArcher Hit'].every(
          (e) => scene.nativeProjectiles.layer.status(e) === 'ready',
        )
      );
    }, level);
    await page.evaluate(async () => {
      const { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts'),
        { model, scene } = window.__game;
      model.returnHome();
      if (
        !model.openReplay(
          parseReplayFile(JSON.stringify(makeReplayFile(window.__superArcher.data))),
        )
      )
        throw Error('Archer replay rejected');
      scene.sync();
    });
    expect(await seek(page, r.flight)).toMatchObject({ shots: 1, hits: 0, unchanged: true, gl: 0 });
    await page.waitForFunction(() => {
      const { scene } = window.__game;
      scene.drawOverlay(0);
      const r = window.__superArcher;
      return (
        scene.nativeProjectiles.covers(r.shotId) &&
        scene.nativeProjectiles.views
          .get(r.shotId)
          ?.view.objects.some((o) => o.visible && o.alpha > 0) &&
        scene.troopNativePresentation.drewUnit(r.sourceId)
      );
    });
    const sound = await page.evaluate(async () => {
      const { model, scene, audio } = window.__game,
        { iso } = await import('/src/game/scene.ts'),
        key = `${window.__superArcher.shotId}:attack`,
        before = JSON.stringify(model.battle);
      scene.santaPresentation.render(model.battle, false, true, 1, iso, scene.lastCues);
      const cue = scene.lastCues.find((c) => c.key === key),
        node = audio.samples.active.get(key);
      if (!cue || !node) throw Error('Original archer cast missing from Web Audio');
      const result = {
        volume: cue.volume,
        pitch: cue.pitch,
        rate: node.source.playbackRate.value,
        gain: node.gain.gain.value,
      };
      scene.santaPresentation.render(model.battle, false, false, 1, iso, scene.lastCues);
      return { ...result, unchanged: before === JSON.stringify(model.battle) };
    });
    expect(sound.unchanged).toBe(true);
    expect(sound.rate).toBeCloseTo(sound.pitch, 6);
    expect(sound.gain).toBeCloseTo(sound.volume * 0.12, 6);
    const passed = await seek(page, r.passedPrimary);
    expect(passed.battle).toBe(expected);
    expect(passed).toMatchObject({ shots: 1, unchanged: true, gl: 0 });
    expect(passed.travelled).toBeGreaterThan(passed.length - 4);
    expect(passed.travelled).toBeLessThan(passed.length);
    await page.waitForFunction(() => {
      const { scene } = window.__game;
      scene.drawOverlay(0);
      return scene.nativeProjectiles.views
        .get(window.__superArcher.shotId)
        ?.view.objects.some((o) => o.visible && o.alpha > 0);
    });
    await page.screenshot({ path: `output/playtest/native-super-archer-${level}-${width}.png` });
    const after = await seek(page, r.after);
    expect(after).toMatchObject({ hits: r.hits.length, unchanged: true, gl: 0 });
    await seek(page, r.flight);
    expect((await seek(page, r.passedPrimary)).battle).toBe(passed.battle);
    await page.evaluate(() => window.__game.model.toggleReducedMotion());
    expect((await seek(page, r.after)).battle).toBe(after.battle);
    await page.evaluate(async () => {
      const { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts'),
        { model, scene } = window.__game;
      const data = structuredClone(window.__superArcher.data);
      data.version = 110;
      model.returnHome();
      if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data)))))
        throw Error('Historical archer replay rejected');
      scene.sync();
    });
    expect(await seek(page, r.passedPrimary)).toMatchObject({ shots: 0, unchanged: true, gl: 0 });
    expect(errors).toEqual([]);
  });
