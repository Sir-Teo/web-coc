import { expect, test, type Page } from '@playwright/test';
async function seek(page: Page, at: number) {
  return page.evaluate(async (at) => {
    const { model, scene } = window.__game,
      r = window.__electroDragon;
    model.seekReplay(at);
    while (model.replay.seeking) model.step(0.05);
    model.changed();
    scene.sync();
    const { iso } = await import('/src/game/scene.ts'),
      point = iso(r.anchor.x, r.anchor.y);
    scene.cameras.main.setZoom(1.35).centerOn(point.x, point.y - 100);
    const before = JSON.stringify(model.battle);
    scene.drawOverlay(0);
    const actor = model.battle.units.find((u) => u.id === r.sourceId);
    return {
      battle: before,
      charge: !!actor?.native?.electroDragon?.charge,
      zaps: model.battle.nativeElectroDragonZaps?.length ?? 0,
      unchanged: before === JSON.stringify(model.battle),
      gl: window.__game.game.renderer.gl.getError(),
    };
  }, at);
}
async function sound(page: Page, keys: string[]) {
  return page.evaluate(async (keys) => {
    const { model, scene, audio } = window.__game,
      { iso } = await import('/src/game/scene.ts');
    const before = JSON.stringify(model.battle);
    scene.santaPresentation.render(model.battle, false, true, 1, iso, scene.lastCues);
    const nodes = keys.map((key) => {
      const cue = scene.lastCues.find((c) => c.key === key),
        node = audio.samples.active.get(key);
      if (!cue || !node) throw Error(`Original dragon sound missing: ${key}`);
      return {
        pitch: cue.pitch,
        rate: node.source.playbackRate.value,
        volume: cue.volume,
        gain: node.gain.gain.value,
      };
    });
    scene.santaPresentation.render(model.battle, false, false, 1, iso, scene.lastCues);
    return { nodes, unchanged: before === JSON.stringify(model.battle) };
  }, keys);
}
for (const { level, mode, width } of [
  { level: 1, mode: 'buildings', width: 390 },
  { level: 9, mode: 'defender', width: 1440 },
] as const)
  test(`Electro Dragon ${level} charges and chains original art and sounds against ${mode} at ${width}px`, async ({
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
    const r = await page.evaluate(
      async ({ level, mode }) => {
        const { nativeElectroDragonRecording } =
            await import('/tests/fixtures/native-electro-dragon.ts'),
          { replayBattle } = await import('/src/game/replay.ts');
        const r = nativeElectroDragonRecording(level, mode);
        window.__electroDragon = r;
        const { model, scene, audio } = window.__game;
        scene.paused = true;
        audio.enabled = true;
        audio.unlock();
        await audio.context.resume();
        // Warm the same army at home first: battle effects must not depend on a changed roster signature.
        model.state.army = structuredClone(r.data.initial.army);
        model.state.troopLevels = structuredClone(r.data.initial.troopLevels);
        model.changed();
        scene.sync();
        scene.drawOverlay(0);
        const homeSignature = scene.armyPrefetchSignature;
        model.battle = replayBattle(r.data.initial);
        model.changed();
        scene.sync();
        scene.drawOverlay(0);
        return {
          sameRoster: homeSignature === scene.armyPrefetchSignature,
          chargeVisible: r.chargeVisible,
          visible: r.visible,
          last: r.last,
          targets: r.targets,
          sourceId: r.sourceId,
        };
      },
      { level, mode },
    );
    expect(r.sameRoster).toBe(true);
    await expect
      .poll(() => requests.includes('/assets/electro-dragon-native/attack/graph.json'))
      .toBe(true);
    await expect
      .poll(() => requests.includes('/assets/electro-dragon-native/hit/graph.json'))
      .toBe(true);
    await page.waitForFunction(async (level) => {
      const { scene, audio, model } = window.__game,
        { troopSoundFiles, troopSample } = await import('/src/game/troop-sounds.ts');
      return (
        model.battle.units.length === 0 &&
        !scene.battleArtPending() &&
        scene.troopNativePresentation.levelsReady.get('electrodragon')?.has(level) &&
        troopSoundFiles('electrodragon').every((f) => audio.samples.has(troopSample(f))) &&
        ['Electro Dragon Attack', 'Electro Dragon Attack Chain', 'Mega Tesla Hit'].every(
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
          parseReplayFile(JSON.stringify(makeReplayFile(window.__electroDragon.data))),
        )
      )
        throw Error('Dragon replay rejected');
      scene.sync();
    });
    expect(await seek(page, r.chargeVisible)).toMatchObject({
      charge: true,
      zaps: 0,
      unchanged: true,
      gl: 0,
    });
    await page.waitForFunction(() => {
      const { scene } = window.__game;
      scene.drawOverlay(0);
      return scene.troopNativePresentation.drewUnit(window.__electroDragon.sourceId);
    });
    const pose = await page.evaluate(() => {
      const { scene, model } = window.__game,
        id = window.__electroDragon.sourceId;
      const state = model.battle.units.find((u) => u.id === id).native.electroDragon;
      const view = scene.troopNativePresentation.views.get(id);
      return {
        state: view.state,
        name: view.sample.name,
        frame: view.sample.frame,
        expected: Math.floor((state.clock - state.animAt) * 24 + 1e-9),
      };
    });
    expect(pose.state).toBe('attack');
    expect(pose.name).toContain('attack');
    expect(pose.frame).toBe(pose.expected);
    const preKey = await page.evaluate(
      () =>
        `${window.__game.model.battle.units.find((u) => u.id === window.__electroDragon.sourceId).native.electroDragon.charge.key}:preAttack`,
    );
    const pre = await sound(page, [preKey]);
    expect(pre.unchanged).toBe(true);
    const visible = await seek(page, r.visible);
    expect(visible).toMatchObject({ charge: false, zaps: 1, unchanged: true, gl: 0 });
    await page.waitForFunction(() => {
      const { scene } = window.__game;
      scene.drawOverlay(0);
      return scene.children.list.some(
        (o) =>
          o.getData?.('nativeEffect') === 'electro_dragon_attack_02' && o.visible && o.alpha > 0,
      );
    });
    const attack = await sound(page, [`${r.targets[0].key}:attack`, `${r.targets[0].key}:hit`]);
    expect(attack.unchanged).toBe(true);
    for (const node of [...pre.nodes, ...attack.nodes]) {
      expect(node.rate).toBeCloseTo(node.pitch, 6);
      expect(node.gain).toBeCloseTo(node.volume * 0.12, 6);
    }
    await page.screenshot({ path: `output/playtest/native-electro-dragon-${level}-${width}.png` });
    const last = await seek(page, r.last);
    expect(last).toMatchObject({ zaps: 5, unchanged: true, gl: 0 });
    await page.waitForFunction(() => {
      const { scene } = window.__game;
      scene.drawOverlay(0);
      return scene.children.list.some(
        (o) =>
          o.getData?.('nativeEffect') === 'electro_dragon_attack_01' && o.visible && o.alpha > 0,
      );
    });
    await sound(page, [`${r.targets[1].key}:chain`, `${r.targets[1].key}:hit`]);
    await seek(page, r.chargeVisible);
    expect((await seek(page, r.visible)).battle).toBe(visible.battle);
    await page.evaluate(() => window.__game.model.toggleReducedMotion());
    expect((await seek(page, r.last)).battle).toBe(last.battle);
    await page.evaluate(async () => {
      const { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts'),
        { model, scene } = window.__game;
      const data = structuredClone(window.__electroDragon.data);
      data.version = 108;
      model.returnHome();
      if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data)))))
        throw Error('Historical dragon replay rejected');
      scene.sync();
    });
    expect(await seek(page, r.last)).toMatchObject({
      charge: false,
      zaps: 0,
      unchanged: true,
      gl: 0,
    });
    expect(errors).toEqual([]);
  });
