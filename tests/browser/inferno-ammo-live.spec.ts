import { test, expect } from '@playwright/test';
test('exhausted Inferno restores empty native artwork and silences its beams', async ({
  page,
  browserName,
}) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('#loading').waitFor({ state: 'detached' });
  const active = await page.evaluate(async () => {
    const { model, scene } = window.__game;
    const { makeBuilding } = await import('/src/game/model.ts');
    const { stepInfernos } = await import('/src/game/inferno-battle.ts');
    const { infernoSoundCues } = await import('/src/game/inferno-sounds.ts');
    model.startBattle(0, true);
    scene.paused = true;
    const b = model.battle;
    b.nativeInfernoAmmo = true;
    b.started = true;
    b.buildings = [{ ...makeBuilding(1, 'inferno', 18, 18, 8), infernoMode: 'multi' }];
    b.units = Array.from({ length: 6 }, (_, i) => ({
      id: i + 1,
      kind: 'giant',
      x: 15 + i * 1.4,
      y: 23,
      hp: 1e9,
      maxHp: 1e9,
      cooldown: 0,
      target: null,
      path: [],
      pathAt: 0,
      attacking: false,
    }));
    b.elapsed = 0.064;
    stepInfernos(b, 0.064);
    // Shorten only this visual fixture; unit tests exhaust the full source capacity.
    b.infernos[1].ammunition = 1;
    b.infernos[1].ammoChargeMs = 0;
    b.elapsed = 0.128;
    stepInfernos(b, 0.064);
    scene.sync();
    scene.drawOverlay(128);
    return {
      beams: scene.infernoPresentation.beams.size,
      loops: infernoSoundCues(b).filter((c) => c.loop).length,
    };
  });
  expect(active).toEqual({ beams: 6, loops: 1 });
  await page.screenshot({ path: `output/playtest/inferno-ammo-active-${browserName}.png` });
  const empty = await page.evaluate(async () => {
    const { model, scene, game } = window.__game;
    const { stepInfernos } = await import('/src/game/inferno-battle.ts');
    const { infernoSoundCues } = await import('/src/game/inferno-sounds.ts');
    const { iso } = await import('/src/game/scene.ts');
    const b = model.battle;
    b.elapsed = 0.192;
    stepInfernos(b, 0.064);
    const hp = b.units.map((u) => u.hp);
    b.elapsed = 1;
    stepInfernos(b, 0.808);
    const copy = JSON.parse(JSON.stringify(b));
    scene.infernoPresentation.clear();
    const states = [];
    for (const reduced of [false, true]) {
      scene.infernoPresentation.render(copy.buildings, copy.elapsed, copy, reduced, iso);
      states.push(
        [...scene.infernoPresentation.views.get(1).objects].map((o) =>
          o.getData('nativeInfernoState'),
        ),
      );
    }
    scene.sync();
    scene.drawOverlay(1000);
    return {
      ammunition: b.infernos[1].ammunition,
      emptyAt: b.infernos[1].emptyAt,
      beams: scene.infernoPresentation.beams.size,
      loops: infernoSoundCues(b).filter((c) => c.loop).length,
      states,
      noDamage: JSON.stringify(hp) === JSON.stringify(b.units.map((u) => u.hp)),
      gl: game.renderer.gl.getError(),
    };
  });
  expect(empty).toMatchObject({
    ammunition: 0,
    emptyAt: 0.192,
    beams: 0,
    loops: 0,
    noDamage: true,
    gl: 0,
  });
  for (const states of empty.states) {
    expect(states.length).toBeGreaterThan(0);
    expect(states.every((s) => s === 'empty')).toBe(true);
  }
  await page.screenshot({ path: `output/playtest/inferno-ammo-empty-${browserName}.png` });
});
test('explicit empty setup renders before the first combat tick', async ({ page, browserName }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('#loading').waitFor({ state: 'detached' });
  const report = await page.evaluate(async () => {
    const { model, scene, game } = window.__game;
    const { makeBuilding } = await import('/src/game/model.ts');
    model.startBattle(0, true);
    scene.paused = true;
    const b = model.battle;
    b.nativeInfernoAmmo = true;
    b.buildings = [
      { ...makeBuilding(1, 'inferno', 18, 18, 8), infernoMode: 'multi', infernoAmmo: 0 },
    ];
    scene.sync();
    scene.drawOverlay(0);
    return {
      states: scene.infernoPresentation.views
        .get(1)
        .objects.map((o) => o.getData('nativeInfernoState')),
      beams: scene.infernoPresentation.beams.size,
      initialized: !!b.infernos,
      gl: game.renderer.gl.getError(),
    };
  });
  expect(report).toMatchObject({ beams: 0, initialized: false, gl: 0 });
  expect(report.states.length).toBeGreaterThan(0);
  expect(report.states.every((s) => s === 'empty')).toBe(true);
  await page.screenshot({ path: `output/playtest/inferno-initial-empty-${browserName}.png` });
});
