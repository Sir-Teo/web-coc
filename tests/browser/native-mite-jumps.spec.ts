import { expect, test, type Page } from '@playwright/test';

async function seek(page: Page, at: number) {
  return page.evaluate(async (at) => {
    const { model, scene } = window.__game,
      r = window.__miteJump;
    model.seekReplay(at);
    while (model.replay.seeking) model.step(0.05);
    model.changed();
    scene.sync();
    const target = model.battle.defenders.find((d) => d.id === r.targetId),
      child = model.battle.units.find((u) => u.id === r.childId);
    const { iso } = await import('/src/game/scene.ts');
    const point = iso(target.x, target.y);
    scene.cameras.main.setZoom(1.6).centerOn(point.x, point.y - 65);
    const before = JSON.stringify(model.battle);
    scene.drawOverlay(0);
    return {
      battle: before,
      hp: child?.hp ?? null,
      spent: !!child?.spent,
      shots:
        model.battle.projectiles?.filter((p) => p.sourceId === r.childId && p.native).length ?? 0,
      enemyHp: target.hp,
      burns: model.battle.nativeSpells?.filter((c) => c.name === 'FireSpiritBurn').length ?? 0,
      unchanged: before === JSON.stringify(model.battle),
      gl: window.__game.game.renderer.gl.getError(),
    };
  }, at);
}

for (const { kind, width } of [
  { kind: 'yetimite' as const, width: 1440 },
  { kind: 'firemite' as const, width: 390 },
]) {
  test(`${kind} warms its carried tier and leaps once at a defending Queen at ${width}px`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    const errors: string[] = [],
      requests: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (entry) => {
      if (entry.type() === 'error') errors.push(entry.text());
    });
    page.on('request', (r) => requests.push(new URL(r.url()).pathname));
    await page.setViewportSize({ width, height: 960 });
    await page.goto('/?lazyart');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').click();
    const r = await page.evaluate(async (kind) => {
      const { nativeMiteJumpRecording } = await import('/tests/fixtures/native-mite-jumps.ts');
      const { replayBattle } = await import('/src/game/replay.ts');
      const { nativeUnitStats } = await import('/src/game/native-units.ts');
      const { nativeProjectilePack } = await import('/src/game/native-projectile-poses.ts');
      const r = nativeMiteJumpRecording(kind);
      window.__miteJump = r;
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
        beforeJump: r.beforeJump,
        inFlight: r.inFlight,
        landed: r.landed,
        burning: r.burning,
        childId: r.childId,
        shotId: r.shotId,
        level: r.level,
        pack: nativeProjectilePack(nativeUnitStats(kind, r.level).projectile),
      };
    }, kind);
    await page.waitForFunction(() => !window.__game.scene.battleArtPending());
    await page.waitForFunction(
      async ({ kind, level }) => {
        const { troopSoundFiles, troopSample } = await import('/src/game/troop-sounds.ts');
        const files = troopSoundFiles(kind);
        return (
          window.__game.scene.troopNativePresentation.levelsReady.get(kind)?.has(level) &&
          files.length > 0 &&
          files.every((path) => window.__game.audio.samples.has(troopSample(path)))
        );
      },
      { kind, level: r.level },
    );
    expect(await page.evaluate(() => window.__game.model.battle.units.length)).toBe(0);
    expect(requests).toContain('/' + r.pack);
    await page.evaluate(async () => {
      const { model, scene } = window.__game;
      const { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
      model.returnHome();
      if (
        !model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(window.__miteJump.data))))
      )
        throw Error('Mite leap replay rejected');
      scene.sync();
      scene.drawOverlay(0);
    });
    await page.waitForFunction(() => !window.__game.scene.battleArtPending());
    const spawned = await seek(page, r.spawned);
    expect(spawned.hp).toBeGreaterThan(0);
    expect(spawned).toMatchObject({ spent: false, unchanged: true, gl: 0 });
    await page.waitForFunction((id) => {
      const scene = window.__game.scene;
      scene.drawOverlay(0);
      return scene.troopNativePresentation.views
        .get(id)
        ?.view.objects.some((o) => o.visible && o.alpha > 0);
    }, r.childId);
    const flight = await seek(page, r.inFlight);
    expect(flight).toMatchObject({ hp: 0, spent: true, shots: 1, unchanged: true, gl: 0 });
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
      const cue = scene.lastCues.find((c) => c.key === `troop:${window.__miteJump.childId}:die`);
      if (!cue) throw Error('Mite source jump cue missing');
      const before = JSON.stringify(model.battle);
      scene.santaPresentation.render(model.battle, false, true, 1, iso, scene.lastCues);
      const node = audio.samples.active.get(cue.key);
      if (!node) throw Error('Mite source jump did not reach Web Audio');
      const result = {
        at: cue.at,
        pitch: cue.pitch,
        rate: node.source.playbackRate.value,
        gain: node.gain.gain.value,
        volume: cue.volume,
        unchanged: before === JSON.stringify(model.battle),
      };
      scene.santaPresentation.render(model.battle, false, false, 1, iso, scene.lastCues);
      return result;
    });
    expect(sound.at).toBeCloseTo(r.inFlight, 8);
    expect(sound.rate).toBeCloseTo(sound.pitch, 6);
    expect(sound.gain).toBeCloseTo(sound.volume * 0.12, 6);
    expect(sound.unchanged).toBe(true);
    await page.screenshot({ path: `output/playtest/native-mite-jump-${kind}-${width}.png` });
    const landed = await seek(page, r.landed);
    expect(landed).toMatchObject({ hp: 0, spent: true, unchanged: true, gl: 0 });
    if (kind === 'firemite') {
      expect(landed.burns).toBe(1);
      expect((await seek(page, r.burning)).enemyHp).toBeLessThan(landed.enemyHp);
    }
    expect(await seek(page, r.inFlight)).toEqual(flight);
    await page.evaluate(() => window.__game.model.toggleReducedMotion());
    expect(await seek(page, r.landed)).toEqual(landed);
    await page.evaluate(async () => {
      const { model, scene } = window.__game;
      const { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
      model.returnHome();
      const data = structuredClone(window.__miteJump.data);
      data.version = 104;
      if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data)))))
        throw Error('Historical mite replay rejected');
      scene.sync();
    });
    expect(await seek(page, r.inFlight)).toMatchObject({
      spent: false,
      shots: 0,
      unchanged: true,
      gl: 0,
    });
    expect(errors).toEqual([]);
  });
}
