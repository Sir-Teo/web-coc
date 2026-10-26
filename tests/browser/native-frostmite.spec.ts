import { expect, test, type Page } from '@playwright/test';

async function seek(page: Page, at: number) {
  return page.evaluate(async (at) => {
    const { model, scene } = window.__game,
      r = window.__frostmite;
    model.seekReplay(at);
    while (model.replay.seeking) model.step(0.05);
    model.changed();
    scene.sync();
    const child = model.battle.units.find((u) => u.id === r.childId),
      target = model.battle.buildings.find((b) => b.id === r.targetId);
    const { iso } = await import('/src/game/scene.ts');
    const point = iso(target.x + 0.4, target.y + 1.5);
    scene.cameras.main.setZoom(innerWidth === 390 ? 1.35 : 1.65).centerOn(point.x, point.y - 85);
    const before = JSON.stringify(model.battle);
    scene.drawOverlay(0);
    const frost = model.battle.buildingEffects?.[r.targetId]?.frost;
    return {
      battle: before,
      children: model.battle.units.filter((u) => u.kind === 'frostmite').length,
      hp: child?.hp ?? null,
      spent: !!child?.spent,
      slow: !!frost && frost.percent === 0.5 && frost.until > model.battle.elapsed,
      unchanged: before === JSON.stringify(model.battle),
      gl: window.__game.game.renderer.gl.getError(),
    };
  }, at);
}

for (const { width, level, wave } of [
  { width: 390, level: 1, wave: 1 },
  { width: 1440, level: 15, wave: 3 },
]) {
  test(`Frosty ${level} shows original Frostmite body, leap, splat and sound at ${width}px`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (entry) => {
      if (entry.type() === 'error') errors.push(entry.text());
    });
    await page.setViewportSize({ width, height: 960 });
    await page.goto('/?lazyart');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').click();
    const r = await page.evaluate(async (level) => {
      const { nativeFrostmiteRecording } = await import('/tests/fixtures/native-frostmite.ts');
      const { replayBattle } = await import('/src/game/replay.ts');
      const r = nativeFrostmiteRecording(level);
      window.__frostmite = r;
      const { model, scene, audio } = window.__game;
      scene.paused = true;
      audio.enabled = true;
      audio.unlock();
      await audio.context.resume();
      model.battle = replayBattle(r.data.initial);
      model.changed();
      scene.sync();
      scene.drawOverlay(0);
      return {
        initial: r.initial,
        beforeJump: r.beforeJump,
        launched: r.launched,
        inFlight: r.inFlight,
        landed: r.landed,
        childId: r.childId,
        shotId: r.shotId,
      };
    }, level);
    await page.waitForFunction(() => !window.__game.scene.battleArtPending());
    await page.waitForFunction(async () => {
      const { troopSoundFiles, troopSample } = await import('/src/game/troop-sounds.ts');
      const files = troopSoundFiles('frostmite');
      return (
        files.length === 2 &&
        files.every((path) => window.__game.audio.samples.has(troopSample(path)))
      );
    });
    expect(await page.evaluate(() => window.__game.model.battle.units.length)).toBe(0);
    await page.evaluate(async () => {
      const { model, scene } = window.__game;
      const { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
      model.returnHome();
      if (
        !model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(window.__frostmite.data))))
      )
        throw Error('Frostmite replay rejected');
      scene.sync();
      scene.drawOverlay(0);
    });
    await page.waitForFunction(() => !window.__game.scene.battleArtPending());
    const initial = await seek(page, r.initial);
    expect(initial).toMatchObject({ children: wave, spent: false, unchanged: true, gl: 0 });
    expect(initial.hp).toBeGreaterThan(0);
    await page.waitForFunction((id) => {
      const scene = window.__game.scene;
      scene.drawOverlay(0);
      return scene.troopNativePresentation.views
        .get(id)
        ?.view.objects.some(
          (o) => o.visible && o.alpha > 0 && o.texture?.key?.includes('frostmite'),
        );
    }, r.childId);
    const flight = await seek(page, r.inFlight);
    expect(flight).toMatchObject({ spent: true, hp: 0, unchanged: true, gl: 0 });
    expect(
      await page.evaluate(
        (id) => window.__game.scene.troopNativePresentation.drewUnit(id),
        r.childId,
      ),
    ).toBe(false);
    await page.waitForFunction((id) => {
      const scene = window.__game.scene;
      scene.drawOverlay(0);
      return (
        scene.nativeProjectiles.covers(id) &&
        scene.nativeProjectiles.views.get(id)?.view.objects.some((o) => o.visible && o.alpha > 0)
      );
    }, r.shotId);
    const sound = await page.evaluate(async () => {
      const { model, scene, audio } = window.__game;
      const { iso } = await import('/src/game/scene.ts');
      const cue = scene.lastCues.find((cue) => cue.sample === 'troop-frostmite_die_01.ogg');
      if (!cue) throw Error('Original Frostmite jump sample missing');
      const before = JSON.stringify(model.battle);
      scene.santaPresentation.render(model.battle, false, true, 1, iso, scene.lastCues);
      const node = audio.samples.active.get(cue.key);
      if (!node) throw Error('Frostmite sample did not reach Web Audio');
      const result = {
        at: cue.at,
        rate: node.source.playbackRate.value,
        pitch: cue.pitch,
        gain: node.gain.gain.value,
        volume: cue.volume,
        unchanged: before === JSON.stringify(model.battle),
      };
      scene.santaPresentation.render(model.battle, false, false, 1, iso, scene.lastCues);
      return result;
    });
    expect(sound.at).toBeCloseTo(r.launched, 8);
    expect(sound.rate).toBeCloseTo(sound.pitch, 6);
    expect(sound.volume).toBe(0.7);
    expect(sound.gain).toBeCloseTo(0.7 * 0.12, 6);
    expect(sound.unchanged).toBe(true);
    await page.screenshot({ path: `output/playtest/native-frostmite-jump-${width}.png` });
    const landed = await seek(page, r.landed);
    expect(landed).toMatchObject({ slow: true, unchanged: true, gl: 0 });
    await page.waitForFunction((id) => {
      const scene = window.__game.scene;
      scene.drawOverlay(0);
      return scene.nativeProjectiles.coversImpact(id);
    }, r.shotId);
    await page.screenshot({ path: `output/playtest/native-frostmite-splat-${width}.png` });
    expect(await seek(page, r.inFlight)).toEqual(flight);
    await page.evaluate(() => window.__game.model.toggleReducedMotion());
    expect(await seek(page, r.landed)).toEqual(landed);
    await page.evaluate(async () => {
      const { model, scene } = window.__game;
      const { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
      model.returnHome();
      const data = structuredClone(window.__frostmite.data);
      data.version = 103;
      if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data)))))
        throw Error('Historical Frosty replay rejected');
      scene.sync();
    });
    expect(await seek(page, r.initial)).toMatchObject({ children: 0, unchanged: true, gl: 0 });
    expect(errors).toEqual([]);
  });
}
