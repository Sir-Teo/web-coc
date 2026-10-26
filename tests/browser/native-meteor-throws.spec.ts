import { expect, test, type Page } from '@playwright/test';
async function seek(page: Page, at: number) {
  return page.evaluate(async (at) => {
    const { model, scene } = window.__game,
      r = window.__meteorThrow;
    model.seekReplay(at);
    while (model.replay.seeking) model.step(0.05);
    model.changed();
    scene.sync();
    const { iso } = await import('/src/game/scene.ts'),
      source = model.battle.units.find((u) => u.id === r.sourceId),
      target = model.battle.defenders.find((d) => d.id === r.targetId),
      point = iso((source.x + target.x) / 2, (source.y + target.y) / 2);
    scene.cameras.main.setZoom(1.35).centerOn(point.x, point.y - 110);
    const before = JSON.stringify(model.battle);
    scene.drawOverlay(0);
    const child = model.battle.units.find((u) => u.id === r.childId);
    return {
      battle: before,
      kind: source.kind,
      hp: source.hp,
      cloneUntil: source.native?.cloneUntil ?? null,
      child: child
        ? { kind: child.kind, level: child.level, cloneUntil: child.native?.cloneUntil ?? null }
        : null,
      shots:
        model.battle.projectiles?.filter(
          (p) => p.sourceId === r.sourceId && p.native?.kind === 'meteorgolem',
        ).length ?? 0,
      pending:
        model.battle.nativePendingSpawns?.some(
          (p) => p.kind === 'meteormite' && Math.abs(p.at - r.impact) < 1e-9,
        ) ?? false,
      unchanged: before === JSON.stringify(model.battle),
      gl: window.__game.game.renderer.gl.getError(),
    };
  }, at);
}
for (const { level, cloned, width } of [
  { level: 1, cloned: false, width: 390 },
  { level: 3, cloned: true, width: 1440 },
])
  test(`Meteor Golem ${level} (cloned ${cloned}) throws original art at a Queen at ${width}px`, async ({
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
      async ({ level, cloned }) => {
        const { nativeMeteorThrowRecording } =
            await import('/tests/fixtures/native-meteor-throws.ts'),
          { replayBattle } = await import('/src/game/replay.ts'),
          { nativeUnitStats } = await import('/src/game/native-units.ts'),
          { nativeProjectilePack } = await import('/src/game/native-projectile-poses.ts');
        const r = nativeMeteorThrowRecording(level, cloned);
        window.__meteorThrow = r;
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
          body: r.body,
          flight: r.flight,
          visible: r.visible,
          landed: r.landed,
          impact: r.impact,
          launched: r.launched,
          sourceId: r.sourceId,
          childId: r.childId,
          shotId: r.shotId,
          cloneUntil: r.cloneUntil ?? null,
          pack: nativeProjectilePack(nativeUnitStats('meteorgolem', level).projectile),
        };
      },
      { level, cloned },
    );
    await page.waitForFunction(async (level) => {
      const { scene, model, audio } = window.__game,
        { troopSoundFiles, troopSample } = await import('/src/game/troop-sounds.ts');
      return (
        model.battle.units.length === 0 &&
        !scene.battleArtPending() &&
        scene.troopNativePresentation.levelsReady.get('meteorgolem')?.has(level) &&
        scene.troopNativePresentation.levelsReady.get('meteormite')?.has(level) &&
        ['meteorgolem', 'meteormite'].every((k) =>
          troopSoundFiles(k).every((f) => audio.samples.has(troopSample(f))),
        )
      );
    }, level);
    expect(requests).toContain('/' + r.pack);
    await page.evaluate(async () => {
      const { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts'),
        { model, scene } = window.__game;
      model.returnHome();
      if (
        !model.openReplay(
          parseReplayFile(JSON.stringify(makeReplayFile(window.__meteorThrow.data))),
        )
      )
        throw Error('Meteor throw replay rejected');
      scene.sync();
    });
    expect(await seek(page, r.body)).toMatchObject({
      kind: 'meteorgolem',
      cloneUntil: r.cloneUntil,
      unchanged: true,
      gl: 0,
    });
    await page.waitForFunction(() => {
      const { scene } = window.__game;
      scene.drawOverlay(0);
      return scene.troopNativePresentation.drewUnit(window.__meteorThrow.sourceId);
    });
    expect(
      await page.evaluate(
        () =>
          window.__game.scene.troopNativePresentation.views.get(window.__meteorThrow.sourceId).view
            .prefix,
      ),
    ).toBe('troop:meteorgolem:chr_split_golem');
    const flight = await seek(page, r.visible);
    expect(flight).toMatchObject({
      kind: 'meteormite',
      cloneUntil: r.cloneUntil,
      child: null,
      shots: 1,
      pending: true,
      unchanged: true,
      gl: 0,
    });
    await page.waitForFunction(() => {
      const { scene } = window.__game;
      scene.drawOverlay(0);
      const r = window.__meteorThrow;
      return (
        scene.nativeProjectiles.covers(r.shotId) &&
        scene.nativeProjectiles.views
          .get(r.shotId)
          ?.view.objects.some((o) => o.visible && o.alpha > 0) &&
        scene.troopNativePresentation.drewUnit(r.sourceId)
      );
    });
    expect(
      await page.evaluate(
        () =>
          window.__game.scene.troopNativePresentation.views.get(window.__meteorThrow.sourceId).view
            .prefix,
      ),
    ).toBe('troop:meteormite:chr_split_golem');
    const attack = await page.evaluate(async () => {
      const { scene, model, audio } = window.__game,
        { iso } = await import('/src/game/scene.ts'),
        r = window.__meteorThrow,
        { effectCue, troopSoundEffect } = await import('/src/game/troop-sounds.ts');
      const key = `troop:${r.sourceId}:attack:${r.launched}`,
        cue = scene.lastCues.find((c) => c.key === key),
        expected = effectCue(troopSoundEffect('meteorgolem', r.level, 'attack'), key, r.launched);
      scene.santaPresentation.render(model.battle, false, true, 1, iso, scene.lastCues);
      const node = audio.samples.active.get(key);
      if (!cue || !node) throw Error('Original Golem throw did not reach Web Audio');
      const result = {
        actual: cue,
        expected,
        rate: node.source.playbackRate.value,
        gain: node.gain.gain.value,
      };
      scene.santaPresentation.render(model.battle, false, false, 1, iso, scene.lastCues);
      return result;
    });
    expect(attack.actual).toEqual(attack.expected);
    expect(attack.rate).toBeCloseTo(attack.actual.pitch, 6);
    expect(attack.gain).toBeCloseTo(attack.actual.volume * 0.12, 6);
    await page.screenshot({
      path: `output/playtest/native-meteor-throw-${level}-${cloned}-${width}.png`,
    });
    const landed = await seek(page, r.landed);
    expect(landed).toMatchObject({
      kind: 'meteormite',
      child: { kind: 'meteormite', level, cloneUntil: r.cloneUntil },
      pending: false,
      unchanged: true,
      gl: 0,
    });
    await page.waitForFunction(() => {
      const { scene } = window.__game;
      scene.drawOverlay(0);
      return scene.troopNativePresentation.drewUnit(window.__meteorThrow.childId);
    });
    const hit = await page.evaluate(async () => {
      const { model, scene, audio } = window.__game,
        { iso } = await import('/src/game/scene.ts'),
        { troopSoundEffect, effectCue } = await import('/src/game/troop-sounds.ts'),
        r = window.__meteorThrow;
      const key = `troop:${r.sourceId}:projectileHit:${r.impact}`,
        cue = scene.lastCues.find((c) => c.key === key),
        expected = effectCue(
          troopSoundEffect('meteorgolem', r.level, 'projectileHit'),
          key,
          r.impact,
        );
      scene.santaPresentation.render(model.battle, false, true, 1, iso, scene.lastCues);
      const node = audio.samples.active.get(key);
      if (!cue || !node) throw Error('Captured Golem hit did not reach Web Audio');
      const result = {
        actual: cue,
        expected,
        rate: node.source.playbackRate.value,
        gain: node.gain.gain.value,
      };
      scene.santaPresentation.render(model.battle, false, false, 1, iso, scene.lastCues);
      return result;
    });
    expect(hit.actual).toEqual(hit.expected);
    expect(hit.rate).toBeCloseTo(hit.actual.pitch, 6);
    expect(hit.gain).toBeCloseTo(hit.actual.volume * 0.12, 6);
    await seek(page, r.body);
    expect((await seek(page, r.visible)).battle).toBe(flight.battle);
    await seek(page, r.body);
    await seek(page, r.landed);
    await page.waitForFunction(() => {
      const { scene } = window.__game;
      scene.drawOverlay(0);
      return scene.nativeProjectiles.coversImpact(window.__meteorThrow.shotId);
    });
    await page.evaluate(() => window.__game.model.toggleReducedMotion());
    expect((await seek(page, r.landed)).battle).toBe(landed.battle);
    await page.evaluate(async () => {
      const { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts'),
        { model, scene } = window.__game,
        data = structuredClone(window.__meteorThrow.data);
      data.version = 107;
      model.returnHome();
      if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data)))))
        throw Error('Historical Meteor replay rejected');
      scene.sync();
    });
    expect(await seek(page, r.landed)).toMatchObject({
      kind: 'meteorgolem',
      child: null,
      shots: 0,
      pending: false,
      unchanged: true,
      gl: 0,
    });
    expect(errors).toEqual([]);
  });
