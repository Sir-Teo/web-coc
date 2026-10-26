import { expect, test } from '@playwright/test';

for (const { defenders, width } of [
  { defenders: false, width: 1440 },
  { defenders: true, width: 390 },
]) {
  test(`Inferno Dragon original transition burst and sound, defenders=${defenders}, ${width}px`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const requested: string[] = [];
    page.on('request', (request) => requested.push(new URL(request.url()).pathname));
    await page.setViewportSize({ width, height: width === 390 ? 844 : 960 });
    await page.goto('/?lazyart');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').click();
    const times = await page.evaluate(async (defenders) => {
      const { nativeDamageRampRecording } = await import('/tests/fixtures/native-damage-ramp.ts');
      const { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
      const r = nativeDamageRampRecording('infernodragon', defenders);
      window.__dragonTransitions = r;
      const { model, scene, audio } = window.__game;
      scene.paused = true;
      audio.enabled = true;
      audio.unlock();
      if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data)))))
        throw Error('Transition replay rejected');
      scene.sync();
      scene.drawOverlay(0);
      return { middle: r.middle + 0.1, maximum: r.maximum + 0.1 };
    }, defenders);
    await page.waitForFunction(() => !window.__game.scene.battleArtPending());
    await page.waitForFunction(() =>
      window.__game.audio.samples.has('inferno-dragon-infdragon_lvl_up_03.ogg'),
    );
    expect(requested).toContain('/assets/audio/inferno-dragon-native/infdragon_lvl_up_03.ogg');
    const sample = async (at: number, reduced = false) =>
      page.evaluate(
        async ({ at, reduced }) => {
          const { model, scene, audio } = window.__game;
          const { iso } = await import('/src/game/scene.ts');
          const r = window.__dragonTransitions;
          model.seekReplay(at);
          while (model.replay.seeking) model.step(0.05);
          model.state.settings.reducedMotion = reduced;
          model.changed();
          scene.sync();
          const battle = model.battle;
          const unit = battle.units.find((u) => u.id === r.unitId);
          const point = iso(unit.x, unit.y);
          scene.cameras.main
            .setZoom(innerWidth === 390 ? 1.35 : 1.8)
            .centerOn(point.x, point.y - 90);
          scene.drawOverlay(0);
          const before = JSON.stringify(battle);
          const views = [...scene.infernoPresentation.impacts.entries()].filter(([key]) =>
            key.startsWith('inferno-dragon:'),
          );
          const cue = scene.lastCues
            .filter((c) => c.key.startsWith('inferno-dragon:') && !c.loop)
            .at(-1);
          await audio.context.resume();
          scene.santaPresentation.render(battle, reduced, true, 1, iso, scene.lastCues);
          const node = audio.samples.active.get(cue.key);
          const result = {
            events: battle.infernoDragonTransitions,
            keys: views.map(([key]) => key),
            visible: views.some(([, view]) => view.objects.some((object) => object.visible)),
            loop: node.source.loop,
            rate: node.source.playbackRate.value,
            gain: node.gain.gain.value,
            key: cue.key,
            unchanged: JSON.stringify(battle) === before,
            gl: window.__game.game.renderer.gl.getError(),
          };
          scene.santaPresentation.render(battle, reduced, false, 1, iso, scene.lastCues);
          return result;
        },
        { at, reduced },
      );
    const middle = await sample(times.middle);
    const maximum = await sample(times.maximum);
    for (const [index, state] of [middle, maximum].entries()) {
      expect(state.keys).toHaveLength(1);
      expect(state.visible).toBe(true);
      expect(state.loop).toBe(false);
      expect(state.rate).toBeCloseTo(index === 0 ? 0.95 : 1.15, 6);
      expect(state.gain).toBeCloseTo(0.072, 6);
      expect(state.unchanged).toBe(true);
      expect(state.gl).toBe(0);
    }
    await page.screenshot({
      path: `output/playtest/inferno-dragon-transition-${defenders}-${width}.png`,
    });
    const backward = await sample(times.middle);
    expect(backward).toEqual(middle);
    const reduced = await sample(times.maximum, true);
    expect(reduced.keys).toEqual([]);
    expect(reduced.events).toEqual(maximum.events);
    expect(reduced.rate).toBeCloseTo(1.15, 6);
    expect(reduced.unchanged).toBe(true);
    expect(
      await page.evaluate(() => {
        const { model, scene } = window.__game;
        model.returnHome();
        scene.sync();
        scene.drawOverlay(0);
        return [...scene.infernoPresentation.impacts.keys()].filter((key) =>
          key.startsWith('inferno-dragon:'),
        ).length;
      }),
    ).toBe(0);
    expect(errors).toEqual([]);
  });
}
