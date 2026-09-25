import { test, expect, type Page } from '@playwright/test';

async function setup(page: Page) {
  await page.clock.setFixedTime(new Date('2026-09-12T12:00:00Z'));
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('#loading').waitFor({ state: 'detached' });
  await page.locator('[data-action="skip-tutorial"]').click();
  await page.evaluate(async () => {
    const { wizardTowerVillage } = await import('/tests/fixtures/wizard-tower-battle.ts');
    const { model: m, scene, audio } = window.__game;
    scene.paused = true;
    m.state = wizardTowerVillage(10);
    audio.unlock();
    scene.sync();
    scene.drawOverlay();
    window.__wizardEffectsAudit = { baseline: scene.game.renderer.listenerCount('losewebgl') };
  });
  await page.waitForFunction(
    () =>
      [...window.__game.audio.samples.buffers.keys()].filter((k) => k.startsWith('wizardtower-'))
        .length === 7,
  );
}
function startFixture() {
  const { model: m, scene } = window.__game;
  m.startBattle(0, true);
  m.activeTroop = 'giant';
  m.deploy(14, 19.5);
  m.activeTroop = 'dragon';
  m.deploy(25, 19.5);
  scene.sync();
  scene.setZoom(scene.scale.canvasBounds.width < 500 ? 1.15 : 1.4);
  scene.cameras.main.centerOn(scene.scale.canvasBounds.width < 500 ? 960 : 896, 675);
}
function snapshot() {
  const { model: m, scene } = window.__game;
  const viewState = (view) => ({
    objects: view.objects.map((o) => ({
      x: o.x,
      y: o.y,
      depth: o.depth,
      alpha: o.alpha,
      vertices: o.vertices ? [...o.vertices] : undefined,
      effect: o.getData('nativeWizardTowerEffect'),
      projectile: o.getData('nativeWizardProjectile'),
      actor: o.getData('nativeTowerWizard'),
    })),
    groups: [...view.groups].map(([key, entry]) => [key, viewState(entry.content)]),
  });
  scene.drawOverlay();
  const native = scene.wizardTowerPresentation;
  return {
    elapsed: m.battle.elapsed,
    history: structuredClone(m.battle.wizardTowers),
    effects: [...native.effects].map(([key, view]) => [key, viewState(view)]),
    defenders: [...native.defenders].map(([key, view]) => [key, viewState(view)]),
    projectiles: [...native.projectiles].map(([key, view]) => [key, viewState(view)]),
  };
}

for (const width of [1440, 390])
  test(`original Wizard Tower flight, effects and audio reconstruct on replay at ${width}px`, async ({
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
      for (let i = 0; i < 5; i++) m.step(0.05);
      scene.sync();
      scene.drawOverlay();
    });
    const flight = await page.evaluate(snapshot);
    expect(flight.history[6].shots).toHaveLength(1);
    expect(flight.projectiles).toHaveLength(1);
    expect(flight.effects.length).toBeGreaterThan(0);
    expect(flight.defenders[0][1].objects[0].actor.action).toBe('attack');
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    await page.screenshot({
      path: `output/playtest/wizard-tower-flight-${width}-${browserName}.png`,
      animations: 'disabled',
    });
    const hitAt = await page.evaluate(() => {
      const { model: m, scene } = window.__game;
      const deadline = m.battle.projectiles[0].impact + 0.1;
      while (m.battle.elapsed < deadline) m.step(0.05);
      scene.sync();
      scene.drawOverlay();
      return m.battle.elapsed;
    });
    const hit = await page.evaluate(snapshot);
    const emitters = hit.effects.flatMap(([, view]) => view.objects.map((o) => o.effect.emitter));
    expect(emitters).toContain('e_chr_WizardAttack_FireBallImpact_lvl4');
    expect(hit.history[6].hits).toHaveLength(1);
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    await page.screenshot({
      path: `output/playtest/wizard-tower-hit-${width}-${browserName}.png`,
      animations: 'disabled',
    });
    await page.evaluate(() => {
      const { model: m } = window.__game;
      for (let i = 0; i < 6000 && !m.battle.finished; i++) m.step(0.05);
      if (!m.battle.finished) throw Error('Wizard Tower recording did not finish');
      window.__wizardEffectsAudit.final = structuredClone(m.battle);
      m.returnHome();
      window.__wizardEffectsAudit.home = JSON.stringify(m.state);
      m.startReplay(m.state.raidLog[0].id);
    });
    const seek = async (at: number) => {
      await page.evaluate((at) => {
        const { model: m, scene } = window.__game;
        m.seekReplay(at);
        while (m.replay.seeking) m.step(0.05);
        scene.sync();
        scene.setZoom(scene.scale.canvasBounds.width < 500 ? 1.15 : 1.4);
        scene.cameras.main.centerOn(scene.scale.canvasBounds.width < 500 ? 960 : 896, 675);
      }, at);
      return page.evaluate(snapshot);
    };
    expect(await seek(flight.elapsed)).toEqual(flight);
    expect(await seek(hitAt)).toEqual(hit);
    expect((await seek(0)).effects).toEqual([]);
    expect(await seek(flight.elapsed)).toEqual(flight);
    const lifecycle = await page.evaluate(() => {
      const { model: m, scene, audio } = window.__game;
      const draw = () => {
        scene.paused = false;
        scene.drawOverlay();
        scene.paused = true;
      };
      if (m.replay.paused) m.toggleReplay();
      const active = () =>
        [...audio.samples.active]
          .filter(([key]) => key.startsWith('wizardtower:'))
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
      const reduced = {
        effects: scene.wizardTowerPresentation.effects.size,
        projectiles: scene.wizardTowerPresentation.projectiles.size,
        actions: [...scene.wizardTowerPresentation.defenders.values()].flatMap((v) =>
          v.objects.map((o) => o.getData('nativeTowerWizard').action),
        ),
      };
      m.state.settings.reducedMotion = false;
      m.seekReplay(9999);
      while (m.replay.seeking) m.step(0.05);
      scene.sync();
      draw();
      const finalEqual =
        JSON.stringify(m.battle) === JSON.stringify(window.__wizardEffectsAudit.final);
      const finished = {
        effects: scene.wizardTowerPresentation.effects.size,
        projectiles: scene.wizardTowerPresentation.projectiles.size,
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
        isolated: JSON.stringify(m.state) === window.__wizardEffectsAudit.home,
        listeners: scene.game.renderer.listenerCount('losewebgl'),
        baseline: window.__wizardEffectsAudit.baseline,
        glError: scene.game.renderer.gl.getError(),
      };
    });
    expect(lifecycle.sounds.length).toBeGreaterThan(0);
    expect(lifecycle.sounds.every((v) => v.sample.startsWith('wizardtower-mage_attack'))).toBe(
      true,
    );
    expect(lifecycle.paused).toEqual([]);
    expect(lifecycle.resumed).toEqual(lifecycle.sounds);
    expect(lifecycle.muted).toEqual([]);
    expect(lifecycle.reduced.effects).toBe(0);
    expect(lifecycle.reduced.projectiles).toBe(0);
    expect(lifecycle.reduced.actions.every((v) => v === 'idle')).toBe(true);
    expect(lifecycle.finalEqual).toBe(true);
    expect(lifecycle.finished).toEqual({ effects: 0, projectiles: 0, sounds: 0 });
    expect(lifecycle.isolated).toBe(true);
    expect(lifecycle.listeners).toBe(lifecycle.baseline);
    expect(lifecycle.glError).toBe(0);
    expect(errors).toEqual([]);
    console.log(
      'Native Wizard Tower effects lifecycle',
      width,
      browserName,
      JSON.stringify(lifecycle),
    );
  });

test('a destroyed Wizard Tower keeps its fireball and plays original empty-impact and collapse samples once', async ({
  page,
  browserName,
}) => {
  await setup(page);
  await page.evaluate(startFixture);
  const report = await page.evaluate(() => {
    const { model: m, scene, audio } = window.__game;
    const draw = () => {
      scene.sync();
      scene.paused = false;
      scene.drawOverlay();
      scene.paused = true;
    };
    const samples = () =>
      [...audio.samples.active]
        .filter(([key]) => key.startsWith('wizardtower:'))
        .map(([key, value]) => ({
          key,
          sample: [...audio.samples.buffers].find(([, b]) => b === value.source.buffer)[0],
          rate: value.source.playbackRate.value,
          gain: value.gain.gain.value,
        }));
    m.step(0.05);
    draw();
    const attack = samples();
    const first = attack.map((s) => audio.samples.active.get(s.key).source);
    draw();
    const attackOnce = attack.every((s, i) => audio.samples.active.get(s.key).source === first[i]);
    const shot = structuredClone(m.battle.projectiles.find((p) => p.weapon === 'arcane'));
    const tower = m.battle.buildings.find((b) => b.id === 6);
    // Isolate a miss after destruction: move the deployed units beyond the
    // captured landing circle, then keep them alive without attacking.
    for (const unit of m.battle.units) {
      unit.x = 35;
      unit.springUntil = 1000;
    }
    const hp = m.battle.units.map((u) => u.hp);
    m.damage(tower, tower.hp);
    m.step(0.1);
    draw();
    const destroyed = {
      at: m.battle.wizardTowers[6].destroyedAt,
      shots: scene.wizardTowerPresentation.projectiles.size,
      defender: scene.wizardTowerPresentation.defenders.has(6),
      rubble: scene.sprites.get(6).getData('nativeWizardTowerRuin'),
      sounds: samples(),
    };
    m.damage(tower, 1);
    while (m.battle.elapsed < shot.impact + 0.1) m.step(0.05);
    draw();
    const hit = samples().filter((s) => s.key.includes(':hit:'));
    const source = audio.samples.active.get(hit[0].key).source;
    draw();
    const hitOnce = audio.samples.active.get(hit[0].key).source === source;
    const impact = {
      hits: structuredClone(m.battle.wizardTowers[6].hits),
      hp: m.battle.units.map((u) => u.hp),
      shots: scene.wizardTowerPresentation.projectiles.size,
      trail: [...scene.wizardTowerPresentation.effects.keys()].some((k) => k.includes(':trail:')),
      depths: [...scene.wizardTowerPresentation.effects]
        .filter(([k]) => k.includes(':hit:'))
        .flatMap(([, view]) => view.objects.map((o) => o.depth)),
    };
    m.step(5);
    draw();
    return {
      attack,
      attackOnce,
      destroyed,
      hit,
      hitOnce,
      impact,
      hp,
      shot,
      history: structuredClone(m.battle.wizardTowers[6]),
      cleaned: { effects: scene.wizardTowerPresentation.effects.size, sounds: samples().length },
      glError: scene.game.renderer.gl.getError(),
    };
  });
  expect(report.attack).toHaveLength(3);
  expect(report.attackOnce).toBe(true);
  expect(report.destroyed).toMatchObject({ at: 0.05, shots: 1, defender: false, rubble: true });
  const collapse = report.destroyed.sounds.filter((s) => s.key.includes(':destroy:'));
  expect(collapse).toHaveLength(1);
  expect(collapse[0].sample).toBe('wizardtower-building_destroyed_01');
  expect(collapse[0].gain).toBeCloseTo(0.096, 8);
  expect(collapse[0].rate).toBeGreaterThanOrEqual(0.85);
  expect(collapse[0].rate).toBeLessThanOrEqual(0.95);
  expect(report.hit).toHaveLength(1);
  expect(report.hit[0].sample).toBe('wizardtower-wizard_hit_01');
  expect(report.hit[0].gain).toBeCloseTo(0.06, 8);
  expect(report.hit[0].rate).toBeGreaterThanOrEqual(0.8);
  expect(report.hit[0].rate).toBeLessThanOrEqual(1);
  expect(report.hitOnce).toBe(true);
  expect(report.impact.hits).toHaveLength(1);
  expect(report.impact.hits[0]).toMatchObject({
    at: report.shot.impact,
    x: report.shot.x,
    y: report.shot.y,
    toAir: true,
  });
  expect(report.impact.hp).toEqual(report.hp);
  expect(report.impact.shots).toBe(0);
  expect(report.impact.trail).toBe(true);
  expect(report.impact.depths.length).toBeGreaterThan(0);
  expect(report.impact.depths.every((depth) => depth === 8000)).toBe(true);
  expect(report.history.destroyedAt).toBe(report.destroyed.at);
  expect(report.history.fired).toBe(1);
  expect(report.history.hits).toHaveLength(1);
  expect(report.cleaned).toEqual({ effects: 0, sounds: 0 });
  expect(report.glError).toBe(0);
  console.log(
    'Native Wizard Tower empty landing and collapse',
    browserName,
    JSON.stringify(report),
  );
});

test('original screen-blended projectile and additive charge survive WebGL context restoration', async ({
  page,
  browserName,
}) => {
  await setup(page);
  await page.evaluate(startFixture);
  const result = await page.evaluate(async () => {
    const { model: m, scene, game } = window.__game;
    for (let i = 0; i < 5; i++) m.step(0.05);
    scene.sync();
    scene.drawOverlay();
    scene.tweens.pauseAll();
    const views = [
      ...scene.wizardTowerPresentation.projectiles.values(),
      ...scene.wizardTowerPresentation.effects.values(),
    ];
    const groups = views.reduce((n, view) => n + view.groups.size, 0);
    const gl = game.renderer.gl,
      errors = [gl.getError()];
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
          errors.push(gl.getError());
          resolve(pixels);
        }),
      );
    const before = await capture(),
      extension = gl.getExtension('WEBGL_lose_context');
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
    return { groups, changes: before.reduce((n, v, i) => n + Number(v !== after[i]), 0), errors };
  });
  expect(result.groups).toBeGreaterThan(0);
  expect(result.changes).toBe(0);
  expect(result.errors).toEqual([0, 0, 0]);
  console.log('Native Wizard Tower effects context', browserName, JSON.stringify(result));
});
