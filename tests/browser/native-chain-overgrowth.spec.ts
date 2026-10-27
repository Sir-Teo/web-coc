import { expect, test, type Page } from '@playwright/test';
import { nativeChainOvergrowthRecording } from '../fixtures/native-chain-overgrowth';
async function seek(page: Page, at: number) {
  return page.evaluate(async (at) => {
    const { model, scene } = window.__game,
      r = window.__rootChain;
    model.seekReplay(at);
    while (model.replay.seeking) model.step(0.05);
    model.changed();
    scene.sync();
    const { iso } = await import('/src/game/scene.ts'),
      point = iso(r.anchor.x, r.anchor.y);
    scene.cameras.main.setZoom(1.15).centerOn(point.x, point.y - 110);
    const before = JSON.stringify(model.battle);
    scene.drawOverlay(0);
    return {
      battle: before,
      zaps: model.battle.nativeElectroDragonZaps?.length ?? 0,
      hp: model.battle.buildings.find((b) => b.id === 3).hp,
      rooted: (model.battle.buildingEffects?.[3]?.overgrownUntil ?? 0) > model.battle.elapsed,
      unchanged: before === JSON.stringify(model.battle),
      gl: window.__game.game.renderer.gl.getError(),
    };
  }, at);
}
for (const { level, width } of [
  { level: 1, width: 390 },
  { level: 9, width: 1440 },
])
  test(`Overgrowth absorbs level-${level} lightning through portable seeks at ${width}px`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    const recording = nativeChainOvergrowthRecording(level),
      { snapshots, ...r } = recording,
      expected = JSON.stringify(snapshots.find((s) => s.at === r.hop)!.battle),
      errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (e) => {
      if (e.type() === 'error') errors.push(e.text());
    });
    await page.setViewportSize({ width, height: 960 });
    await page.goto('/?lazyart');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').click();
    await page.evaluate(async (r) => {
      window.__rootChain = r;
      const { model, scene, audio } = window.__game,
        { replayBattle } = await import('/src/game/replay.ts');
      scene.paused = true;
      audio.enabled = true;
      audio.unlock();
      await audio.context.resume();
      model.battle = replayBattle(r.data.initial);
      model.changed();
      scene.sync();
      scene.drawOverlay(0);
    }, r);
    await page.waitForFunction(async (level) => {
      const { scene, audio } = window.__game,
        { troopSoundFiles, troopSample } = await import('/src/game/troop-sounds.ts');
      return (
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
        !model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(window.__rootChain.data))))
      )
        throw Error('Rooted chain replay rejected');
      scene.sync();
    });
    expect(await seek(page, r.charging)).toMatchObject({
      zaps: 0,
      rooted: false,
      unchanged: true,
      gl: 0,
    });
    expect(await seek(page, r.rooted)).toMatchObject({
      zaps: 1,
      rooted: true,
      hp: r.hp,
      unchanged: true,
      gl: 0,
    });
    const hop = await seek(page, r.hop);
    expect(hop.battle).toBe(expected);
    expect(hop).toMatchObject({ zaps: 2, rooted: true, hp: r.hp, unchanged: true, gl: 0 });
    await page.waitForFunction(() => {
      const { scene } = window.__game;
      scene.drawOverlay(0);
      return scene.children.list.some(
        (o) =>
          o.getData?.('nativeEffect') === 'electro_dragon_attack_01' && o.visible && o.alpha > 0,
      );
    });
    const sound = await page.evaluate(async () => {
      const { model, scene, audio } = window.__game,
        { iso } = await import('/src/game/scene.ts'),
        r = window.__rootChain,
        before = JSON.stringify(model.battle);
      scene.santaPresentation.render(model.battle, false, true, 1, iso, scene.lastCues);
      const result = ['chain', 'hit'].map((event) => {
        const key = `${r.targets[1].key}:${event}`,
          cue = scene.lastCues.find((c) => c.key === key),
          node = audio.samples.active.get(key);
        if (!cue || !node) throw Error('Original absorbed-hop sound missing');
        return {
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
      expect(node.rate).toBeCloseTo(node.pitch, 6);
      expect(node.gain).toBeCloseTo(node.volume * 0.12, 6);
    }
    await page.screenshot({
      path: `output/playtest/native-chain-overgrowth-${level}-${width}.png`,
    });
    const last = await seek(page, r.visible);
    expect(last).toMatchObject({ zaps: 5, rooted: true, hp: r.hp, unchanged: true, gl: 0 });
    await seek(page, r.charging);
    expect((await seek(page, r.hop)).battle).toBe(hop.battle);
    await page.evaluate(() => window.__game.model.toggleReducedMotion());
    expect((await seek(page, r.visible)).battle).toBe(last.battle);
    await page.evaluate(async () => {
      const { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts'),
        { model, scene } = window.__game,
        data = structuredClone(window.__rootChain.data);
      data.version = 111;
      model.returnHome();
      if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data)))))
        throw Error('Historical rooted chain replay rejected');
      scene.sync();
    });
    expect(await seek(page, r.visible)).toMatchObject({
      zaps: 1,
      rooted: true,
      hp: r.hp,
      unchanged: true,
      gl: 0,
    });
    expect(errors).toEqual([]);
  });
