import { test, expect } from '@playwright/test';

function snapshot() {
  const { model: m, scene } = window.__game;
  scene.sync();
  scene.drawOverlay();
  const view = (v) =>
    v.objects.map((o) => ({
      x: o.x,
      y: o.y,
      depth: o.depth,
      alpha: o.alpha,
      vertices: o.vertices ? [...o.vertices] : undefined,
      body: o.getData('nativeSweeper'),
      effect: o.getData('nativeSweeperEffect'),
    }));
  return {
    elapsed: m.battle.elapsed,
    history: structuredClone(m.battle.airSweepers),
    gusts: structuredClone(m.battle.gusts),
    towers: [...scene.sweeperPresentation.towers].map(([id, v]) => [id, view(v)]),
    effects: [...scene.sweeperPresentation.effects].map(([key, v]) => [key, view(v)]),
  };
}

for (const [width, height] of [
  [1440, 960],
  [390, 844],
  [844, 390],
])
  test(`original Air Sweeper loading, firing, destruction and audio reconstruct at ${width}×${height}`, async ({
    page,
    browserName,
  }) => {
    await page.setViewportSize({ width, height });
    await page.clock.setFixedTime(new Date('2026-09-12T12:00:00Z'));
    await page.goto('/');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').click();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.evaluate(async () => {
      const { airSweeperVillage } = await import('/tests/fixtures/air-sweeper-battle.ts');
      const { model: m, scene, audio } = window.__game;
      scene.paused = true;
      m.state = airSweeperVillage(7);
      audio.unlock();
      scene.sync();
      scene.drawOverlay();
      window.__sweeperAudit = { baseline: scene.game.renderer.listenerCount('losewebgl') };
      m.startBattle(0, true);
      m.activeTroop = 'dragon';
      m.deploy(14, 19.5);
      m.deploy(14, 20.5);
      m.activeTroop = 'balloon';
      m.deploy(14, 18.5);
      m.deploy(14, 17.5);
      scene.sync();
      scene.setZoom(scene.scale.canvasBounds.width < 500 ? 1.2 : 1.5);
      scene.cameras.main.centerOn(scene.scale.canvasBounds.width < 500 ? 865 : 830, 645);
    });
    await page.waitForFunction(
      () =>
        [...window.__game.audio.samples.buffers.keys()].filter((k) => k.startsWith('airsweeper-'))
          .length === 4,
    );
    const phases = new Map<number, Awaited<ReturnType<typeof snapshot>>>();
    for (const step of [1, 6, 12, 13, 15, 20, 40, 120]) {
      await page.evaluate((step) => {
        const { model: m } = window.__game;
        while (m.battle.elapsed < step / 20 - 1e-9) m.step(0.05);
      }, step);
      phases.set(step / 20, await page.evaluate(snapshot));
    }
    expect(phases.get(0.3)!.towers[0][1][0].body.action).toBe('load');
    const fire = phases.get(0.75)!;
    expect(fire.history[6].shots).toHaveLength(1);
    expect(fire.gusts).toHaveLength(1);
    expect(fire.towers[0][1][0].body).toMatchObject({
      state: 'setup',
      action: 'attack',
      sector: 180,
    });
    expect(fire.effects).toHaveLength(10);
    await page.evaluate(() => {
      const { model: m } = window.__game;
      for (let i = 0; i < 6000 && !m.battle.finished; i++) m.step(0.05);
      if (!m.battle.finished) throw Error('Air Sweeper fixture did not finish');
      window.__sweeperAudit.final = structuredClone(m.battle);
      m.returnHome();
      window.__sweeperAudit.home = structuredClone(m.state);
      m.startReplay(m.state.raidLog[0].id);
    });
    const seek = async (at: number) => {
      await page.evaluate((at) => {
        const { model: m, scene } = window.__game;
        m.seekReplay(at);
        while (m.replay.seeking) m.step(0.05);
        scene.sync();
        scene.setZoom(scene.scale.canvasBounds.width < 500 ? 1.2 : 1.5);
        scene.cameras.main.centerOn(scene.scale.canvasBounds.width < 500 ? 865 : 830, 645);
      }, at);
      return page.evaluate(snapshot);
    };
    for (const at of [6, 0.05, 0.75, 0.3, 2, 0.6, 0.65, 1, 0.75])
      expect(await seek(at)).toEqual(phases.get(at));
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    await page.screenshot({
      path: `output/playtest/air-sweeper-fire-${width}-${browserName}.png`,
      animations: 'disabled',
    });
    const audio = await page.evaluate(() => {
      const { model: m, scene, audio } = window.__game;
      const draw = () => {
        scene.paused = false;
        scene.drawOverlay();
        scene.paused = true;
      };
      const active = () =>
        [...audio.samples.active]
          .filter(([k]) => k.startsWith('airsweeper:'))
          .map(([key, v]) => ({
            key,
            sample: [...audio.samples.buffers].find(([, b]) => b === v.source.buffer)[0],
            gain: v.gain.gain.value,
            rate: v.source.playbackRate.value,
          }));
      if (m.replay.paused) m.toggleReplay();
      m.setReplaySpeed(2);
      draw();
      const playing = active();
      m.toggleReplay();
      draw();
      const paused = active();
      m.toggleReplay();
      draw();
      const resumed = active();
      audio.enabled = false;
      draw();
      const muted = active();
      audio.enabled = true;
      m.state.settings.reducedMotion = true;
      draw();
      const reduced = {
        effects: scene.sweeperPresentation.effects.size,
        loading: scene.sweeperPresentation.towers.get(6).objects[0].getData('nativeSweeper')
          .loading,
      };
      m.state.settings.reducedMotion = false;
      return { playing, paused, resumed, muted, reduced };
    });
    expect(audio.playing).toHaveLength(1);
    expect(audio.playing[0].sample).toBe('airsweeper-air_cannon_fire_04');
    expect(audio.playing[0].gain).toBeCloseTo(0.108, 8);
    expect(audio.playing[0].rate).toBeGreaterThanOrEqual(1.9);
    expect(audio.playing[0].rate).toBeLessThanOrEqual(2.1);
    expect(audio.paused).toEqual([]);
    expect(audio.muted).toEqual([]);
    expect(audio.resumed).toEqual(audio.playing);
    expect(audio.reduced).toEqual({ effects: 0, loading: 0 });
    const death = await page.evaluate(() => window.__sweeperAudit.final.airSweepers[6].destroyedAt);
    expect(death).toBeGreaterThan(0);
    const rubble = await seek(Math.round((death + 0.2) * 20) / 20);
    expect(rubble.towers[0][1][0].body.state).toBe('ruin');
    expect(rubble.effects.length).toBeGreaterThan(0);
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    await page.screenshot({
      path: `output/playtest/air-sweeper-destruction-${width}-${browserName}.png`,
      animations: 'disabled',
    });
    const final = await seek(9999);
    expect(final.effects).toEqual([]);
    const cleanup = await page.evaluate(() => {
      const { model: m, scene, audio, game } = window.__game;
      const same =
        JSON.stringify(m.battle.result) === JSON.stringify(window.__sweeperAudit.final.result);
      m.returnHome();
      scene.sync();
      scene.drawOverlay();
      return {
        same,
        home: m.state,
        expected: window.__sweeperAudit.home,
        effects: scene.sweeperPresentation.effects.size,
        active: audio.samples.active.size,
        listeners: game.renderer.listenerCount('losewebgl'),
        baseline: window.__sweeperAudit.baseline,
        gl: game.renderer.gl.getError(),
      };
    });
    expect(cleanup.same).toBe(true);
    expect(cleanup.home).toEqual(cleanup.expected);
    expect(cleanup.effects).toBe(0);
    expect(cleanup.active).toBe(0);
    expect(cleanup.listeners).toBe(cleanup.baseline);
    expect(cleanup.gl).toBe(0);
    expect(errors).toEqual([]);
    await (
      await import('node:fs/promises')
    ).writeFile(
      `output/playtest/air-sweeper-live-${width}-${browserName}.json`,
      JSON.stringify(
        {
          phases: [...phases],
          audio,
          death,
          cleanup: { ...cleanup, home: undefined, expected: undefined },
          errors,
        },
        null,
        2,
      ),
    );
  });
