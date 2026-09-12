import { test, expect, type Page } from '@playwright/test';

async function setup(page: Page) {
  // Keep the independent home-economy timestamp stable during multi-turn replay comparisons.
  await page.clock.setFixedTime(new Date('2026-09-12T12:00:00Z'));
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.ready);
  await page.locator('#loading').waitFor({ state: 'detached' });
  await page.locator('[data-action="skip-tutorial"]').click();
  await page.evaluate(async () => {
    const { makeBuilding } = await import('/src/game/model.ts');
    const { emptyArmy } = await import('/src/game/army.ts');
    const { model: m, scene, audio } = window.__game;
    scene.paused = true;
    m.state.obstacles = [];
    m.state.buildings = [
      makeBuilding(1, 'townhall', 30, 30, 8),
      makeBuilding(3, 'bombtower', 6, 10, 2),
    ];
    m.state.nextId = 4;
    m.state.army = { ...emptyArmy(), dragon: 3, giant: 2 };
    audio.unlock();
    scene.sync();
    scene.drawOverlay();
    window.__bombEffectsAudit = { baseline: scene.game.renderer.listenerCount('losewebgl') };
  });
  await page.waitForFunction(
    () =>
      [...window.__game.audio.samples.buffers.keys()].filter((k) => k.startsWith('bombtower-'))
        .length === 6,
  );
}

function startFixture() {
  const { model: m, scene } = window.__game;
  m.startBattle(0, true);
  for (const kind of ['giant', 'dragon']) {
    m.activeTroop = kind;
    while (m.battle.remaining[kind]) m.deploy(1, 11);
  }
  scene.sync();
  scene.setZoom(1);
  scene.cameras.main.centerOn(768, 416);
}

// Serialize actual native meshes and isolated GPU group contents, excluding generated texture IDs.
function snapshot() {
  const { model: m, scene } = window.__game;
  const viewState = (view) => ({
    objects: view.objects.map((o) => ({
      x: o.x,
      y: o.y,
      depth: o.depth,
      alpha: o.alpha,
      vertices: o.vertices ? [...o.vertices] : undefined,
      effect: o.getData('nativeBombTowerEffect'),
    })),
    groups: [...view.groups].map(([key, entry]) => [key, viewState(entry.content)]),
  });
  scene.drawOverlay();
  scene.cameras.main.preRender();
  return {
    elapsed: m.battle.elapsed,
    history: structuredClone(m.battle.bombTowers),
    effects: [...scene.bombTowerPresentation.effects].map(([key, view]) => [key, viewState(view)]),
    camera: [...scene.cameras.main.matrixCombined.matrix],
  };
}

for (const width of [1440, 390])
  test(`native Bomb Tower particles, audio and shake reconstruct on replay at ${width}px`, async ({
    page,
    browserName,
  }) => {
    await page.setViewportSize({ width, height: width === 1440 ? 960 : 844 });
    await setup(page);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.evaluate(startFixture);
    await page.evaluate(() => {
      const { model: m, scene } = window.__game;
      while (!m.battle.deathBombs?.[3]?.resolved) m.step(0.05);
      for (let i = 0; i < 3; i++) m.step(0.05);
      scene.sync();
      scene.drawOverlay();
    });
    const live = await page.evaluate(snapshot);
    expect(live.history[3].hits.length).toBeGreaterThan(0);
    const emitters = live.effects.flatMap(([, v]) => v.objects.map((o) => o.effect.emitter));
    expect(emitters).toContain('bomb_crater');
    expect(emitters).toContain('Force');
    await page.waitForTimeout(250);
    expect(await page.evaluate(snapshot)).toEqual(live);
    await page.screenshot({
      path: `output/playtest/bomb-tower-effects-${width}-${browserName}.png`,
    });
    const projection = await page.evaluate(async () => {
      const { model: m, scene } = window.__game;
      const { iso } = await import('/src/game/scene.ts');
      const sample = () => {
        const p = scene.screenFor(7.5, 11.5),
          c = scene.cameras.main,
          rect = scene.scale.canvasBounds;
        const world = c.getWorldPoint(
          (p.x - rect.left) * scene.scale.displayScale.x,
          (p.y - rect.top) * scene.scale.displayScale.y,
        );
        m.state.settings.reducedMotion = true;
        const still = scene.screenFor(7.5, 11.5);
        m.state.settings.reducedMotion = false;
        return {
          delta: [p.x - still.x, p.y - still.y],
          world: [world.x, world.y],
          zoom: scene.viewZoom,
        };
      };
      const first = sample();
      scene.setZoom(scene.viewZoom * 1.3);
      const zoomed = sample();
      scene.setZoom(1);
      return { first, zoomed, expected: Object.values(iso(7.5, 11.5)) };
    });
    expect(Math.hypot(...projection.first.delta)).toBeGreaterThan(0.1);
    for (let axis = 0; axis < 2; axis++) {
      expect(projection.first.world[axis]).toBeCloseTo(projection.expected[axis], 4);
      expect(projection.zoomed.world[axis]).toBeCloseTo(projection.expected[axis], 4);
      expect(projection.zoomed.delta[axis] / projection.first.delta[axis]).toBeCloseTo(
        projection.zoomed.zoom / projection.first.zoom,
        3,
      );
    }
    await page.evaluate(() => {
      const { model: m } = window.__game;
      for (let i = 0; i < 100; i++) m.step(0.05);
      m.finishBattle();
      window.__bombEffectsAudit.final = structuredClone(m.battle);
      m.returnHome();
      window.__bombEffectsAudit.home = JSON.stringify(m.state);
      m.startReplay(m.state.raidLog[0].id);
    });
    const seek = async (at: number) => {
      await page.evaluate((at) => {
        const { model: m, scene } = window.__game;
        m.seekReplay(at);
        while (m.replay.seeking) m.step(0.05);
        scene.sync();
        scene.setZoom(1);
        scene.cameras.main.centerOn(768, 416);
      }, at);
      return page.evaluate(snapshot);
    };
    expect(await seek(live.elapsed)).toEqual(live);
    expect((await seek(0)).effects).toEqual([]);
    expect(await seek(live.elapsed)).toEqual(live);
    for (const speed of [1, 2, 4]) {
      await seek(live.elapsed - 0.1);
      await page.evaluate((speed) => {
        const { model: m } = window.__game;
        if (m.replay.paused) m.toggleReplay();
        m.setReplaySpeed(speed);
        m.step(0.1 / speed);
      }, speed);
      expect(await page.evaluate(snapshot)).toEqual(live);
    }
    const lifecycle = await page.evaluate(() => {
      const { model: m, scene, audio } = window.__game;
      const draw = () => {
        scene.paused = false;
        scene.drawOverlay();
        scene.paused = true;
      };
      const active = () =>
        [...audio.samples.active]
          .filter(([key]) => key.startsWith('bombtower:'))
          .map(([key, v]) => ({
            key,
            sample: [...audio.samples.buffers].find(([, b]) => b === v.source.buffer)[0],
            rate: v.source.playbackRate.value,
            gain: v.gain.gain.value,
          }));
      draw();
      const sounds = active();
      scene.sys.pause();
      const paused = active();
      scene.sys.resume();
      draw();
      const resumed = active();
      audio.enabled = false;
      draw();
      const muted = active();
      audio.enabled = true;
      m.state.settings.reducedMotion = true;
      draw();
      const reduced = [...scene.bombTowerPresentation.effects.values()].flatMap((v) =>
        v.objects.map((o) => o.getData('nativeBombTowerEffect').emitter),
      );
      m.state.settings.reducedMotion = false;
      m.seekReplay(9999);
      while (m.replay.seeking) m.step(0.05);
      scene.sync();
      draw();
      const finalEqual =
        JSON.stringify(m.battle) === JSON.stringify(window.__bombEffectsAudit.final);
      const finished = {
        effects: scene.bombTowerPresentation.effects.size,
        sounds: active().length,
      };
      m.returnHome();
      scene.sync();
      draw();
      return {
        sounds,
        paused,
        resumed,
        muted,
        reduced,
        finalEqual,
        finished,
        isolated: JSON.stringify(m.state) === window.__bombEffectsAudit.home,
        listeners: scene.game.renderer.listenerCount('losewebgl'),
        baseline: window.__bombEffectsAudit.baseline,
        glError: scene.game.renderer.gl.getError(),
      };
    });
    const explosions = lifecycle.sounds.filter((s) => s.key.includes(':explode:'));
    expect(explosions).toHaveLength(2);
    for (const sound of explosions) {
      expect(sound.sample).toBe('bombtower-mortar_hit_01');
      expect(sound.rate).toBeGreaterThanOrEqual(2.4);
      expect(sound.rate).toBeLessThanOrEqual(3.2);
      expect(sound.gain).toBeCloseTo(0.096, 8);
    }
    expect(lifecycle.paused).toEqual([]);
    expect(lifecycle.resumed).toEqual(lifecycle.sounds);
    expect(lifecycle.muted).toEqual([]);
    expect(lifecycle.reduced).toContain('bomb_crater');
    expect(
      lifecycle.reduced.every((e) =>
        ['bomb_crater', 'bomb_tower_area_edge', 'Super_ground_bomb_area'].includes(e),
      ),
    ).toBe(true);
    expect(lifecycle.finalEqual).toBe(true);
    expect(lifecycle.finished).toEqual({ effects: 0, sounds: 0 });
    expect(lifecycle.isolated).toBe(true);
    expect(lifecycle.listeners).toBe(lifecycle.baseline);
    expect(lifecycle.glError).toBe(0);
    expect(errors).toEqual([]);
    console.log(
      'Native Bomb Tower effects lifecycle',
      width,
      browserName,
      JSON.stringify(lifecycle),
    );
  });

test('native throw, empty landing and collapse play original samples once; additive effects survive context loss', async ({
  page,
  browserName,
}) => {
  await setup(page);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const result = await page.evaluate(async () => {
    const { model: m, scene, audio, game } = window.__game;
    m.startBattle(0, true);
    m.battle.started = true;
    m.battle.units.push({
      id: 999,
      kind: 'giant',
      x: 12,
      y: 11.5,
      hp: 5000,
      maxHp: 5000,
      cooldown: 99,
      target: null,
      path: [],
      pathAt: 0,
      attacking: false,
      springUntil: 1000,
    });
    scene.sync();
    scene.setZoom(1.5);
    scene.cameras.main.centerOn(800, 416);
    const draw = () => {
      scene.paused = false;
      scene.drawOverlay();
      scene.paused = true;
    };
    const samples = () =>
      [...audio.samples.active]
        .filter(([key]) => key.startsWith('bombtower:'))
        .map(([key, v]) => ({
          key,
          sample: [...audio.samples.buffers].find(([, b]) => b === v.source.buffer)[0],
          rate: v.source.playbackRate.value,
          gain: v.gain.gain.value,
        }));
    m.step(0.05);
    draw();
    const thrown = samples(),
      first = audio.samples.active.get(thrown[0].key).source;
    draw();
    const same = first === audio.samples.active.get(thrown[0].key).source;
    const shot = structuredClone(m.battle.projectiles[0]);
    const tower = m.battle.buildings.find((b) => b.id === 3);
    tower.cooldown = 99;
    m.battle.units[0].x = 25;
    m.step(shot.impact - m.battle.elapsed + 0.1);
    draw();
    const hit = samples(),
      hp = m.battle.units[0].hp,
      hitCount = m.battle.bombTowers[3].hits.length;
    const trail = [...scene.bombTowerPresentation.effects.keys()].some((k) =>
      k.includes(':trail:'),
    );
    m.damage(tower, 9999);
    m.step(0.15);
    scene.sync();
    draw();
    const collapse = samples();
    m.step(1);
    scene.sync();
    scene.drawOverlay();
    // Freeze all other animations so only the native effect graph is under comparison.
    scene.tweens.pauseAll();
    const gl = game.renderer.gl,
      glErrors = [gl.getError()];
    const capture = () =>
      new Promise<Uint8Array>((resolve) =>
        game.events.once('postrender', () => {
          const pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
          gl.readPixels(
            0,
            0,
            gl.drawingBufferWidth,
            gl.drawingBufferHeight,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            pixels,
          );
          glErrors.push(gl.getError());
          resolve(pixels);
        }),
      );
    const before = await capture();
    const extension = gl.getExtension('WEBGL_lose_context');
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
    const after = await capture();
    const groups = [...scene.bombTowerPresentation.effects.values()].reduce(
      (n, v) => n + v.groups.size,
      0,
    );
    return {
      thrown,
      same,
      hit,
      hp,
      hitCount,
      trail,
      collapse,
      groups,
      contextChanges: before.reduce((n, v, i) => n + Number(v !== after[i]), 0),
      glErrors,
    };
  });
  expect(result.thrown).toHaveLength(1);
  expect(result.thrown[0].sample).toBe('bombtower-bomb_tower_atk_01');
  expect(result.thrown[0].rate).toBeGreaterThanOrEqual(0.98);
  expect(result.thrown[0].rate).toBeLessThanOrEqual(1.02);
  expect(result.thrown[0].gain).toBeCloseTo(0.084, 8);
  expect(result.same).toBe(true);
  expect(result.hit.some((s) => s.sample === 'bombtower-bomb_tower_hit_01')).toBe(true);
  expect(result.hp).toBe(5000);
  expect(result.hitCount).toBe(1);
  expect(result.trail).toBe(true);
  expect(result.collapse.some((s) => s.sample === 'bombtower-building_destroyed_01')).toBe(true);
  expect(result.groups).toBeGreaterThan(10);
  expect(result.contextChanges).toBe(0);
  expect(result.glErrors).toEqual([0, 0, 0]);
  expect(errors).toEqual([]);
  console.log('Native Bomb Tower effects context', browserName, JSON.stringify(result));
});
