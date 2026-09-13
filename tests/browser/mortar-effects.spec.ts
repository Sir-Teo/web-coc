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
      body: o.getData('nativeMortar'),
      effect: o.getData('nativeMortarEffect'),
    }));
  return {
    elapsed: m.battle.elapsed,
    history: structuredClone(m.battle.mortars),
    shells: structuredClone(m.battle.shells),
    projectiles: [...scene.mortarPresentation.projectiles].map(([key, v]) => [key, view(v)]),
    shadows: [...scene.mortarPresentation.shadows].map(([key, v]) => [key, view(v)]),
    towers: [...scene.mortarPresentation.towers].map(([id, v]) => [id, view(v)]),
    effects: [...scene.mortarPresentation.effects]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, v]) => [key, view(v)]),
  };
}

for (const [width, height] of [
  [1440, 960],
  [390, 844],
  [844, 390],
])
  test(`original Mortar aiming, firing, destruction and audio reconstruct at ${width}×${height}`, async ({
    page,
    browserName,
  }) => {
    await page.setViewportSize({ width, height });
    await page.clock.setFixedTime(new Date('2026-09-12T12:00:00Z'));
    await page.goto('/');
    await page.waitForFunction(() => window.__game?.scene.ready);
    await page.locator('#loading').waitFor({ state: 'detached' });
    await page.locator('[data-action="skip-tutorial"]').click();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.evaluate(async () => {
      const { mortarVillage } = await import('/tests/fixtures/mortar-battle.ts');
      const { model: m, scene, audio } = window.__game;
      scene.paused = true;
      m.state = mortarVillage(11);
      audio.unlock();
      scene.sync();
      scene.drawOverlay();
      window.__mortarAudit = { baseline: scene.game.renderer.listenerCount('losewebgl') };
      m.startBattle(0, true);
      m.activeTroop = 'giant';
      for (let i = 0; i < 6; i++)
        if (!m.deploy(13.5, 18 + i * 0.6)) throw Error('Giant deployment failed');
      m.activeTroop = 'wizard';
      for (let i = 0; i < 5; i++)
        if (!m.deploy(12, 18.5 + i * 0.6)) throw Error('Wizard deployment failed');
      scene.sync();
      scene.setZoom(scene.scale.canvasBounds.width < 500 ? 1.2 : 1.5);
      scene.cameras.main.centerOn(scene.scale.canvasBounds.width < 500 ? 865 : 830, 645);
    });
    await page.waitForFunction(
      () =>
        [...window.__game.audio.samples.buffers.keys()].filter((k) => k.startsWith('mortar-'))
          .length === 5,
    );
    const phases = new Map<number, Awaited<ReturnType<typeof snapshot>>>();
    for (const step of [1, 6, 12, 13, 15, 20, 40, 120]) {
      await page.evaluate((step) => {
        const { model: m } = window.__game;
        while (m.battle.elapsed < step / 20 - 1e-9) m.step(0.05);
      }, step);
      phases.set(step / 20, await page.evaluate(snapshot));
    }
    expect(phases.get(0.3)!.towers[0][1][0].body.state).toBe('setup');
    const fire = phases.get(0.75)!;
    expect(fire.history[6].shots).toHaveLength(1);
    expect(fire.shells).toHaveLength(1);
    expect(fire.projectiles).toHaveLength(1);
    expect(fire.shadows).toHaveLength(1);
    expect(fire.towers[0][1][0].body).toMatchObject({
      state: 'setup',
      turret: 180,
    });
    expect(fire.effects.length).toBeGreaterThan(10);
    await page.evaluate(() => {
      const { model: m } = window.__game;
      for (let i = 0; i < 6000 && !m.battle.finished; i++) m.step(0.05);
      if (!m.battle.finished) throw Error('Mortar fixture did not finish');
      window.__mortarAudit.final = structuredClone(m.battle);
      m.returnHome();
      window.__mortarAudit.home = structuredClone(m.state);
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
      path: `output/playtest/mortar-fire-${width}-${browserName}.png`,
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
          .filter(([k]) => k.startsWith('mortar:'))
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
        effects: scene.mortarPresentation.effects.size,
        projectiles: scene.mortarPresentation.projectiles.size,
        shadows: scene.mortarPresentation.shadows.size,
      };
      m.state.settings.reducedMotion = false;
      return { playing, paused, resumed, muted, reduced };
    });
    expect(audio.playing).toHaveLength(1);
    expect(audio.playing[0].sample).toBe('mortar-mortar_fire_02_with_fall');
    expect(audio.playing[0].gain).toBeCloseTo(0.084, 8);
    expect(audio.playing[0].rate).toBeGreaterThanOrEqual(1.9);
    expect(audio.playing[0].rate).toBeLessThanOrEqual(2.1);
    expect(audio.paused).toEqual([]);
    expect(audio.muted).toEqual([]);
    expect(audio.resumed).toEqual(audio.playing);
    expect(audio.reduced).toEqual({ effects: 0, projectiles: 0, shadows: 0 });
    const death = await page.evaluate(() => window.__mortarAudit.final.mortars[6].destroyedAt);
    expect(death).toBeGreaterThan(0);
    const rubble = await seek(Math.round((death + 0.2) * 20) / 20);
    expect(rubble.towers[0][1][0].body.state).toBe('ruin');
    expect(rubble.effects.length).toBeGreaterThan(0);
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    await page.screenshot({
      path: `output/playtest/mortar-destruction-${width}-${browserName}.png`,
      animations: 'disabled',
    });
    const final = await seek(9999);
    expect(final.effects).toEqual([]);
    const cleanup = await page.evaluate(() => {
      const { model: m, scene, audio, game } = window.__game;
      const same =
        JSON.stringify(m.battle.result) === JSON.stringify(window.__mortarAudit.final.result);
      m.returnHome();
      scene.sync();
      scene.drawOverlay();
      return {
        same,
        home: m.state,
        expected: window.__mortarAudit.home,
        effects: scene.mortarPresentation.effects.size,
        active: audio.samples.active.size,
        listeners: game.renderer.listenerCount('losewebgl'),
        baseline: window.__mortarAudit.baseline,
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
      `output/playtest/mortar-live-${width}-${browserName}.json`,
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

test('a frozen original shell, trail and smoke survive WebGL context restoration pixel for pixel', async ({
  page,
  browserName,
}) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.ready);
  await page.locator('#loading').waitFor({ state: 'detached' });
  const report = await page.evaluate(async () => {
    const { mortarBattle } = await import('/tests/fixtures/mortar-battle.ts');
    const { iso } = await import('/src/game/scene.ts');
    const { scene, game } = window.__game;
    scene.paused = true;
    scene.tweens.pauseAll();
    const m = mortarBattle(18);
    for (let i = 0; i < 6; i++) m.step(0.05);
    document.querySelector('#ui').style.display = 'none';
    for (const o of scene.children.list) o.setVisible(false);
    scene.mortarPresentation.clear();
    scene.cameras.main.setZoom(2).centerOn(860, 650).setBackgroundColor('#304135');
    const draw = () =>
      scene.mortarPresentation.render(m.battle.buildings, m.battle, m.battle.elapsed, false, iso);
    draw();
    const gl = game.renderer.gl;
    const capture = () =>
      new Promise<Uint8Array>((resolve) =>
        game.events.once('postrender', () => {
          const bytes = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
          gl.readPixels(
            0,
            0,
            gl.drawingBufferWidth,
            gl.drawingBufferHeight,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            bytes,
          );
          resolve(bytes);
        }),
      );
    const baseline = game.renderer.listenerCount('losewebgl');
    const before = await capture(),
      errors = [gl.getError()];
    const extension = gl.getExtension('WEBGL_lose_context');
    if (!extension) throw Error('Context loss extension unavailable');
    await new Promise<void>((resolve) => {
      game.canvas.addEventListener(
        'webglcontextlost',
        () => setTimeout(() => extension.restoreContext(), 50),
        { once: true },
      );
      game.canvas.addEventListener(
        'webglcontextrestored',
        () => {
          scene.paused = true;
          resolve();
        },
        { once: true },
      );
      extension.loseContext();
    });
    draw();
    const after = await capture();
    errors.push(gl.getError());
    let changed = 0;
    for (let i = 0; i < before.length; i++) if (before[i] !== after[i]) changed++;
    return {
      changed,
      bytes: before.length,
      errors,
      baseline,
      listeners: game.renderer.listenerCount('losewebgl'),
      projectiles: scene.mortarPresentation.projectiles.size,
      effects: scene.mortarPresentation.effects.size,
    };
  });
  expect(report.changed).toBe(0);
  expect(report.errors).toEqual([0, 0]);
  expect(report.listeners).toBe(report.baseline);
  expect(report.projectiles).toBe(1);
  expect(report.effects).toBeGreaterThan(10);
  await page.screenshot({ path: `output/playtest/mortar-context-restored-${browserName}.png` });
  await (
    await import('node:fs/promises')
  ).writeFile(
    `output/playtest/mortar-context-restored-${browserName}.json`,
    JSON.stringify(report, null, 2),
  );
});
