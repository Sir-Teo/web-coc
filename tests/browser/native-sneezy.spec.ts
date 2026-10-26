import { expect, test, type Page } from '@playwright/test';

async function seek(page: Page, at: number) {
  return page.evaluate(async (at) => {
    const { model, scene } = window.__game,
      r = window.__sneezy;
    model.seekReplay(at);
    while (model.replay.seeking) model.step(0.05);
    model.changed();
    scene.sync();
    const pet = model.battle.units.find((u) => u.id === r.petId),
      child = model.battle.units.find((u) => u.id === r.childId);
    const { iso } = await import('/src/game/scene.ts');
    const point = iso(pet.x, pet.y);
    scene.cameras.main.setZoom(1.5).centerOn(point.x, point.y - 60);
    const before = JSON.stringify(model.battle);
    scene.drawOverlay(0);
    const sprite = scene.heroNativePresentation.sprites.get(pet.id),
      spawn = scene.heroNativePresentation.sprites.get(r.childId);
    return {
      battle: before,
      unchanged: before === JSON.stringify(model.battle),
      petVisible: !!sprite?.visible,
      texture: sprite?.texture.key,
      scale: sprite?.scaleX,
      state: scene.heroNativePresentation.positions.get(pet.id)?.state,
      childVisible: !!spawn?.visible,
      childTexture: spawn?.texture.key,
      childBorn: child?.spawnedAt,
      gl: window.__game.game.renderer.gl.getError(),
    };
  }, at);
}

for (const { width, level } of [
  { width: 390, level: 1 },
  { width: 1440, level: 10 },
]) {
  test(`Sneezy level ${level} uses its spawner clip, original Booger and transformed attack at ${width}px`, async ({
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
      const { nativeSneezyRecording } = await import('/tests/fixtures/native-sneezy.ts');
      const { replayBattle } = await import('/src/game/replay.ts');
      const r = nativeSneezyRecording(level);
      window.__sneezy = r;
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
        summoning: r.summoning,
        born: r.born,
        transformed: r.transformed,
        firing: r.firing,
        shotId: r.shotId,
        childId: r.childId,
      };
    }, level);
    await page.waitForFunction(() => !window.__game.scene.battleArtPending());
    await page.waitForFunction(async () => {
      const { troopSoundFiles, troopSample } = await import('/src/game/troop-sounds.ts');
      return troopSoundFiles('booger').every((path) =>
        window.__game.audio.samples.has(troopSample(path)),
      );
    });
    expect(await page.evaluate(() => window.__game.model.battle.units.length)).toBe(0);
    await page.evaluate(async () => {
      const { model, scene } = window.__game;
      const { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
      model.returnHome();
      if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(window.__sneezy.data)))))
        throw Error('Sneezy replay rejected');
      scene.sync();
      scene.drawOverlay(0);
    });
    await page.waitForFunction(() => !window.__game.scene.battleArtPending());
    const initial = await seek(page, r.initial);
    expect(initial).toMatchObject({ petVisible: true, unchanged: true, gl: 0 });
    expect(initial.scale).toBeCloseTo(0.72, 8);
    expect(initial.texture).not.toContain('/attack.png');
    const summoning = await seek(page, r.summoning);
    expect(summoning).toMatchObject({
      state: 'attack2',
      childVisible: false,
      childBorn: undefined,
      unchanged: true,
      gl: 0,
    });
    expect(summoning.texture).toBe('baked:heroes-native/sneezy/attack2.png');
    await page.screenshot({ path: `output/playtest/native-sneezy-summon-${width}.png` });
    await seek(page, r.born);
    await page.waitForFunction(() => {
      const { scene } = window.__game;
      scene.drawOverlay(0);
      return !!scene.heroNativePresentation.sprites.get(window.__sneezy.childId)?.visible;
    });
    const born = await seek(page, r.born);
    expect(born.childTexture).toMatch(/^baked:heroes-native\/booger\//);
    const audio = await page.evaluate(async () => {
      const { model, scene, audio } = window.__game;
      const { iso } = await import('/src/game/scene.ts');
      const cue = scene.lastCues.find((cue) => cue.sample === 'troop-Pet_Sneezy_Spirit_Deploy.ogg');
      if (!cue) throw Error('Booger source deploy sample missing');
      const before = JSON.stringify(model.battle);
      scene.santaPresentation.render(model.battle, false, true, 1, iso, scene.lastCues);
      const node = audio.samples.active.get(cue.key);
      if (!node) throw Error('Booger did not reach Web Audio');
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
    expect(audio.at).toBe(2.5);
    expect(audio.rate).toBeCloseTo(audio.pitch, 6);
    expect(audio.gain).toBeCloseTo(audio.volume * 0.12, 6);
    expect(audio.unchanged).toBe(true);
    await page.screenshot({ path: `output/playtest/native-sneezy-booger-${width}.png` });
    const firing = await seek(page, r.firing);
    expect(firing.scale).toBeCloseTo(0.6, 8);
    expect(firing).toMatchObject({ state: 'attack', unchanged: true, gl: 0 });
    expect(firing.texture).toBe('baked:heroes-native/sneezy/attack.png');
    await page.waitForFunction((id) => {
      const { scene } = window.__game;
      scene.drawOverlay(0);
      return (
        scene.nativeProjectiles.covers(id) &&
        scene.nativeProjectiles.views.get(id)?.view.objects.some((o) => o.visible && o.alpha > 0)
      );
    }, r.shotId);
    expect(await seek(page, r.summoning)).toEqual(summoning);
    await page.evaluate(() => window.__game.model.toggleReducedMotion());
    const reduced = await seek(page, r.firing);
    expect(reduced.battle).toBe(firing.battle);
    expect(reduced.unchanged).toBe(true);
    expect(reduced.gl).toBe(0);
    await page.evaluate(async () => {
      const { model, scene } = window.__game;
      const { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
      model.returnHome();
      const data = structuredClone(window.__sneezy.data);
      data.version = 101;
      if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data)))))
        throw Error('Historical Sneezy replay rejected');
      scene.sync();
    });
    const old = await seek(page, r.summoning);
    expect(old.scale).toBeCloseTo(0.6, 8);
    expect(old.state).not.toBe('attack2');
    expect(old.childBorn).toBeUndefined();
    expect(errors).toEqual([]);
  });
}
