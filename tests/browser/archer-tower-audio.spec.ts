import { test, expect } from '@playwright/test';
test('all original Archer Tower samples decode in the browser audio engine', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  const durations = await page.evaluate(async () => {
    const { ARCHER_TOWER_SOUNDS, archerTowerSample } =
      await import('/src/game/archer-tower-sounds.ts');
    const context = new AudioContext();
    try {
      return await Promise.all(
        Object.keys(ARCHER_TOWER_SOUNDS).map(async (path) => {
          const bytes = window.__game.scene.cache.binary.get(archerTowerSample(path));
          return (await context.decodeAudioData(bytes.slice(0))).duration;
        }),
      );
    } finally {
      await context.close();
    }
  });
  expect(durations).toHaveLength(9);
  expect(durations.every((d) => Number.isFinite(d) && d > 0)).toBe(true);
});

test('handling audio survives reduced motion and cancels pending events', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  const result = await page.evaluate(async () => {
    const { scene, model } = window.__game;
    const { iso } = await import('/src/game/scene.ts');
    scene.paused = true;
    model.state.settings.reducedMotion = true;
    const view = scene.villageArcherTowers;
    view.handling(999, 'pickup', 10, 20, 20);
    const cues = view.render([], 0, iso, 10.15);
    const particles = view.effects.size;
    view.handling(999, 'cancel', 10.2, 20, 20);
    const cancelled = view.render([], 0, iso, 10.2);
    const cancelledParticles = view.effects.size;
    view.handling(999, 'place', 11, 20, 20);
    const placed = view.render([], 0, iso, 11.1);
    const reducedCues = view.render([], 0, iso, 11.15, true);
    const reducedParticles = view.effects.size;
    view.clear();
    return {
      cues,
      particles,
      cancelled,
      cancelledParticles,
      placed,
      reducedCues,
      reducedParticles,
      cleared: view.render([], 0, iso, 11.2),
    };
  });
  expect(result.particles).toBe(3);
  expect(result.cancelledParticles).toBe(0);
  expect(result.reducedParticles).toBe(0);
  expect(result.reducedCues).toHaveLength(1);
  expect(result.cues).toHaveLength(1);
  expect(result.cues[0]).toMatchObject({
    sample: 'archer-tower-archer_tower_pick_01.ogg',
    at: 10,
    volume: 0.8,
    pitch: 1,
  });
  expect(result.cancelled).toEqual([]);
  expect(result.placed[0]).toMatchObject({
    sample: 'archer-tower-archer_tower_place_02.ogg',
    at: 11,
  });
  expect(result.cleared).toEqual([]);
});

test('model placement uses native cues without duplicate generic audio', async ({
  page,
  browserName,
}) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('#loading').waitFor({ state: 'detached' });
  await page.locator('[data-action="skip-tutorial"]').click();
  const result = await page.evaluate(async () => {
    const { scene, model } = window.__game;
    const { makeBuilding } = await import('/src/game/model.ts');
    const { iso } = await import('/src/game/scene.ts');
    scene.paused = true;
    model.state.obstacles = [];
    const sounds = [];
    const original = scene.audio.play;
    scene.audio.play = (kind) => sounds.push(kind);
    const checks = [];
    try {
      for (const kind of ['darkdrill', 'archertower']) {
        const b = makeBuilding(999, kind, 2, 2, 1);
        model.state.buildings = [b];
        model.move(999);
        const rejected = scene.placeBuilding(0, 0);
        const placed = scene.placeBuilding(25, 25);
        checks.push({ kind, rejected, placed });
      }
    } finally {
      scene.audio.play = original;
    }
    document.querySelector<HTMLElement>('#ui')!.style.display = 'none';
    scene.sync();
    const b = model.state.buildings[0];
    const cues = scene.villageArcherTowers.render([b], 0, iso, scene.renderClock / 1000 + 0.15);
    const particles = scene.villageArcherTowers.effects.size;
    const point = iso(26.5, 26.5);
    scene.cameras.main.centerOn(point.x, point.y - 50).setZoom(2);
    await new Promise<void>((resolve) => scene.game.events.once('postrender', resolve));
    return { sounds, checks, cues, particles, glError: scene.game.renderer.gl.getError() };
  });
  expect(result.checks.every((c) => !c.rejected && c.placed)).toBe(true);
  expect(result.sounds).toEqual([]);
  expect(result.cues.map((c) => c.sample)).toEqual([
    'archer-tower-archer_tower_pick_01.ogg',
    'archer-tower-archer_tower_place_02.ogg',
  ]);
  expect(result.particles).toBe(9);
  expect(result.glError).toBe(0);
  await page.screenshot({ path: `output/playtest/archer-tower-handling-${browserName}.png` });
});

test('native release audio overlaps, deduplicates and stops on pause', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  const result = await page.evaluate(async () => {
    const { SampleAudio } = await import('/src/game/sample-audio.ts');
    const { archerTowerBattle } = await import('/tests/fixtures/archer-tower-battle.ts');
    const { ARCHER_TOWER_SOUNDS, archerTowerSample } =
      await import('/src/game/archer-tower-sounds.ts');
    const { iso } = await import('/src/game/scene.ts');
    const { scene } = window.__game;
    scene.paused = true;
    const context = new AudioContext();
    await context.resume();
    const samples = new SampleAudio(() => context);
    for (const path of Object.keys(ARCHER_TOWER_SOUNDS))
      samples.register(archerTowerSample(path), scene.cache.binary.get(archerTowerSample(path)));
    for (let i = 0; i < 100 && samples.buffers.size < 9; i++)
      await new Promise((r) => setTimeout(r, 10));
    const model = archerTowerBattle();
    for (let i = 0; i < 80; i++) model.step(0.05);
    const battle = model.battle;
    const latest = battle.archerTowerReleases.at(-1);
    battle.elapsed = latest.at + 0.01;
    const cues = scene.villageArcherTowers.render([], 0, iso, battle.elapsed, true, battle);
    samples.sync(cues, battle.elapsed, 1, true);
    const overlap = samples.active.size;
    const nodes = [...samples.active.values()].map((v) => v.source);
    samples.sync(cues, battle.elapsed, 1, true);
    const duplicate = nodes.some((node, i) => node !== [...samples.active.values()][i].source);
    samples.sync(cues, battle.elapsed, 2, true);
    const speed = [...samples.active.entries()].every(
      ([key, value]) =>
        Math.abs(value.source.playbackRate.value - cues.find((c) => c.key === key).pitch * 2) <
        0.00001,
    );
    samples.sync(cues, battle.elapsed, 1, false);
    const paused = samples.active.size;
    await context.close();
    return { overlap, duplicate, speed, paused, decoded: samples.buffers.size };
  });
  expect(result.overlap).toBeGreaterThanOrEqual(2);
  expect(result).toMatchObject({ duplicate: false, speed: true, paused: 0, decoded: 9 });
});

test('recorded tower impacts use native cues without synthetic hit audio', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  const result = await page.evaluate(async () => {
    const { scene } = window.__game;
    const { archerTowerBattle } = await import('/tests/fixtures/archer-tower-battle.ts');
    const { iso } = await import('/src/game/scene.ts');
    scene.paused = true;
    const samples = [];
    const originalPlay = scene.audio.play;
    const originalRandom = Math.random;
    const calls = [];
    try {
      scene.audio.play = (name) => calls.push(name);
      Math.random = () => 0;
      for (const level of [1, 10, 21]) {
        const model = archerTowerBattle(level);
        scene.model = model;
        for (let step = 0; step < 100 && !model.battle.archerTowerHits?.length; step++)
          model.step(0.05);
        scene.sync();
        const hit = model.battle.archerTowerHits[0];
        calls.length = 0;
        scene.effect({
          type: 'impact',
          projectileId: hit.id,
          weapon: 'arrow',
          sourceId: hit.sourceId,
          x: 19.5,
          y: 19.5,
          toX: hit.x,
          toY: hit.y,
          toAir: hit.air,
        });
        if (calls.includes('hit')) throw Error('Duplicate synthetic impact audio');
        const cues = scene.villageArcherTowers.render(
          model.buildings,
          0,
          iso,
          model.battle.elapsed,
          true,
          model.battle,
        );
        const cue = cues.find((cue) => cue.key === `archer-tower:hit:${hit.id}`);
        if (!cue) throw Error('Native hit missing from shared presentation cues');
        samples.push(cue.sample);
      }
    } finally {
      scene.audio.play = originalPlay;
      Math.random = originalRandom;
    }
    return samples;
  });
  expect(result).toEqual([
    'archer-tower-generic_hit_01.ogg',
    'archer-tower-explosive_arrow_01v2.ogg',
    'archer-tower-explosive_arrow_01v2.ogg',
  ]);
});
