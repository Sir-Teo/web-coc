import { expect, test, type Page } from '@playwright/test';
async function seek(page: Page, at: number) {
  return page.evaluate(async (at) => {
    const { model, scene } = window.__game,
      r = window.__superWizard;
    model.seekReplay(at);
    while (model.replay.seeking) model.step(0.05);
    model.changed();
    scene.sync();
    const { iso } = await import('/src/game/scene.ts'),
      point = iso(r.anchor.x, r.anchor.y);
    scene.cameras.main.setZoom(1.35).centerOn(point.x, point.y - 100);
    const before = JSON.stringify(model.battle);
    scene.drawOverlay(0);
    return {
      battle: before,
      zaps: model.battle.nativeSuperWizardZaps?.length ?? 0,
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
      if (!cue || !node) throw Error(`Original Super Wizard sound missing: ${key}`);
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
  { level: 10, mode: 'defender', width: 1440 },
] as const)
  test(`Super Wizard ${level} branches original art and sounds against ${mode} at ${width}px`, async ({
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
        const { nativeSuperWizardRecording } =
            await import('/tests/fixtures/native-super-wizard.ts'),
          { replayBattle } = await import('/src/game/replay.ts');
        const r = nativeSuperWizardRecording(level, mode);
        window.__superWizard = r;
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
          chainVisible: r.chainVisible,
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
      .poll(() => requests.includes('/assets/super-wizard-native/attack/graph.json'))
      .toBe(true);
    await expect
      .poll(() => requests.includes('/assets/super-wizard-native/hit/graph.json'))
      .toBe(true);
    await expect
      .poll(() => requests.includes('/assets/super-wizard-native/chain/graph.json'))
      .toBe(true);
    await page.waitForFunction(async (level) => {
      const { scene, audio, model } = window.__game,
        { troopSoundFiles, troopSample } = await import('/src/game/troop-sounds.ts');
      return (
        model.battle.units.length === 0 &&
        !scene.battleArtPending() &&
        scene.troopNativePresentation.levelsReady.get('superwizard')?.has(level) &&
        troopSoundFiles('superwizard').every((f) => audio.samples.has(troopSample(f))) &&
        ['Super Wizard Attack', 'Super Wizard Attack Chain', 'Super Wizard Hit'].every(
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
          parseReplayFile(JSON.stringify(makeReplayFile(window.__superWizard.data))),
        )
      )
        throw Error('Super Wizard replay rejected');
      scene.sync();
    });
    const visible = await seek(page, r.visible);
    expect(visible).toMatchObject({ zaps: 1, unchanged: true, gl: 0 });
    await page.waitForFunction(() => {
      const { scene } = window.__game;
      scene.drawOverlay(0);
      return scene.children.list.some(
        (o) => o.getData?.('nativeEffect') === 'super_wizard_attack' && o.visible && o.alpha > 0,
      );
    });
    const attack = await sound(page, [`${r.targets[0].key}:attack`, `${r.targets[0].key}:hit`]);
    expect(attack.unchanged).toBe(true);
    for (const node of attack.nodes) {
      expect(node.rate).toBeCloseTo(node.pitch, 6);
      expect(node.gain).toBeCloseTo(node.volume * 0.12, 6);
    }
    await page.screenshot({ path: `output/playtest/native-super-wizard-${level}-${width}.png` });
    const last = await seek(page, r.chainVisible);
    expect(last).toMatchObject({ zaps: r.targets.length, unchanged: true, gl: 0 });
    await page.waitForFunction(() => {
      const { scene } = window.__game;
      scene.drawOverlay(0);
      return scene.children.list.some(
        (o) => o.getData?.('nativeEffect') === 'super_wizard_attack_01' && o.visible && o.alpha > 0,
      );
    });
    await sound(page, [`${r.targets[1].key}:chain`, `${r.targets[1].key}:hit`]);
    await seek(page, r.last);
    expect((await seek(page, r.visible)).battle).toBe(visible.battle);
    await page.evaluate(() => window.__game.model.toggleReducedMotion());
    expect((await seek(page, r.chainVisible)).battle).toBe(last.battle);
    await page.evaluate(async () => {
      const { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts'),
        { model, scene } = window.__game;
      const data = structuredClone(window.__superWizard.data);
      data.version = 109;
      model.returnHome();
      if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data)))))
        throw Error('Historical Super Wizard replay rejected');
      scene.sync();
    });
    expect(await seek(page, r.chainVisible)).toMatchObject({
      zaps: 0,
      unchanged: true,
      gl: 0,
    });
    expect(errors).toEqual([]);
  });
