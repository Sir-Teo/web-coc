import { expect, test, type Page } from '@playwright/test';
async function seek(page: Page, at: number) {
  return page.evaluate(async (at) => {
    const { model, scene } = window.__game,
      r = window.__electromite;
    model.seekReplay(at);
    while (model.replay.seeking) model.step(0.05);
    model.changed();
    scene.sync();
    const { iso } = await import('/src/game/scene.ts');
    const point = iso(9.5, 7);
    scene.cameras.main.setZoom(1.25).centerOn(point.x, point.y - 90);
    const before = JSON.stringify(model.battle);
    scene.drawOverlay(0);
    const child = model.battle.units.find((u) => u.id === r.childId);
    return {
      battle: before,
      hp: child?.hp,
      spent: !!child?.spent,
      arcs: model.battle.nativeElectromiteArcs?.filter((a) => a.sourceId === r.childId).length ?? 0,
      zaps: model.battle.nativeElectromiteZaps?.filter((z) => z.sourceId === r.childId).length ?? 0,
      unchanged: before === JSON.stringify(model.battle),
      gl: window.__game.game.renderer.gl.getError(),
    };
  }, at);
}
for (const { level, width } of [
  { level: 1, width: 390 },
  { level: 8, width: 1440 },
])
  test(`Electromite ${level} shows original lightning and sound through portable seeks at ${width}px`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    const errors: string[] = [],
      requests: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (e) => {
      if (e.type() === 'error') errors.push(e.text());
    });
    page.on('request', (r) => requests.push(new URL(r.url()).pathname));
    await page.setViewportSize({ width, height: 960 });
    await page.goto('/?lazyart');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').click();
    const r = await page.evaluate(async (level) => {
      const { nativeElectromiteRecording } = await import('/tests/fixtures/native-electromite.ts'),
        { replayBattle } = await import('/src/game/replay.ts');
      const r = nativeElectromiteRecording(level);
      window.__electromite = r;
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
        spawned: r.spawned,
        first: r.first,
        visible: r.visible,
        second: r.second,
        third: r.third,
        childId: r.childId,
        primary: r.targets[0],
      };
    }, level);
    await page.waitForFunction(async (level) => {
      const { scene, audio, model } = window.__game,
        { troopSoundFiles, troopSample } = await import('/src/game/troop-sounds.ts');
      const files = troopSoundFiles('electromite');
      return (
        model.battle.units.length === 0 &&
        !scene.battleArtPending() &&
        scene.troopNativePresentation.levelsReady.get('electromite')?.has(level) &&
        files.every((f) => audio.samples.has(troopSample(f))) &&
        scene.nativeProjectiles.layer.status('Zappies Attack') === 'ready' &&
        scene.nativeProjectiles.layer.status('SuperYetimite Hit') === 'ready'
      );
    }, level);
    expect(requests).toContain('/assets/electromite-native/attack/graph.json');
    expect(requests).toContain('/assets/electromite-native/hit/graph.json');
    await page.evaluate(async () => {
      const { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts'),
        { model, scene } = window.__game;
      model.returnHome();
      if (
        !model.openReplay(
          parseReplayFile(JSON.stringify(makeReplayFile(window.__electromite.data))),
        )
      )
        throw Error('Electromite replay rejected');
      scene.sync();
    });
    expect(await seek(page, r.spawned)).toMatchObject({
      spent: false,
      zaps: 0,
      unchanged: true,
      gl: 0,
    });
    await page.waitForFunction(() => {
      const { scene } = window.__game;
      scene.drawOverlay(0);
      return scene.troopNativePresentation.drewUnit(window.__electromite.childId);
    });
    const visible = await seek(page, r.visible);
    expect(visible).toMatchObject({ hp: 0, spent: true, zaps: 1, arcs: 1, unchanged: true, gl: 0 });
    await page.waitForFunction(() => {
      const { scene } = window.__game;
      scene.drawOverlay(0);
      return scene.children.list.some(
        (o) => o.getData?.('nativeEffect') === 'Zappies_Lightning' && o.visible && o.alpha > 0,
      );
    });
    const sound = await page.evaluate(async () => {
      const { model, scene, audio } = window.__game,
        { iso } = await import('/src/game/scene.ts'),
        r = window.__electromite;
      const before = JSON.stringify(model.battle),
        keys = [`${r.targets[0].key}:attack`, `${r.targets[0].key}:hit`];
      scene.santaPresentation.render(model.battle, false, true, 1, iso, scene.lastCues);
      const result = keys.map((key) => {
        const cue = scene.lastCues.find((c) => c.key === key),
          node = audio.samples.active.get(key);
        if (!cue || !node) throw Error('Original Electromite sample missing from Web Audio');
        return {
          at: cue.at,
          pitch: cue.pitch,
          rate: node.source.playbackRate.value,
          volume: cue.volume,
          gain: node.gain.gain.value,
        };
      });
      scene.santaPresentation.render(model.battle, false, false, 1, iso, scene.lastCues);
      return { nodes: result, unchanged: before === JSON.stringify(model.battle) };
    });
    expect(sound.unchanged).toBe(true);
    for (const node of sound.nodes) {
      expect(node.at).toBeCloseTo(r.primary.at, 8);
      expect(node.rate).toBeCloseTo(node.pitch, 6);
      expect(node.gain).toBeCloseTo(node.volume * 0.12, 6);
    }
    await page.screenshot({ path: `output/playtest/native-electromite-${level}-${width}.png` });
    const third = await seek(page, r.third);
    expect(third).toMatchObject({ spent: true, zaps: 3, arcs: 0, unchanged: true, gl: 0 });
    await seek(page, r.spawned);
    expect((await seek(page, r.visible)).battle).toBe(visible.battle);
    await page.evaluate(() => window.__game.model.toggleReducedMotion());
    expect((await seek(page, r.third)).battle).toBe(third.battle);
    await page.evaluate(async () => {
      const { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts'),
        { model, scene } = window.__game;
      const data = structuredClone(window.__electromite.data);
      data.version = 106;
      model.returnHome();
      if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data)))))
        throw Error('Historical Electromite replay rejected');
      scene.sync();
    });
    expect(await seek(page, r.third)).toMatchObject({ zaps: 0, arcs: 0, unchanged: true, gl: 0 });
    expect(errors).toEqual([]);
  });
