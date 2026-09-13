import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.ready);
  await page.locator('#loading').waitFor({ state: 'detached' });
  await page.locator('[data-action="skip-tutorial"]').click();
});

for (const viewport of [
  { width: 1440, height: 960 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
])
  test(`original Shrink Trap activation, area and recovery at ${viewport.width}×${viewport.height}`, async ({
    page,
    browserName,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewportSize(viewport);
    await page.evaluate(async () => {
      const { shrinkTrapVillage } = await import('/tests/fixtures/shrink-trap-battle.ts');
      const { model: m } = window.__game;
      Object.assign(m.state, shrinkTrapVillage());
      m.state.settings.reducedMotion = false;
      m.changed();
    });
    await page.locator('.attack-btn').click();
    await expect(page.locator('[data-action="attack:54"]')).toBeEnabled();
    await page.locator('[data-action="attack:54"]').click();
    await expect(page.locator('.battle-enemy h2')).toHaveText('Magic Practice');
    const start = await page.evaluate(async () => {
      const { deployShrinkTrap } = await import('/tests/fixtures/shrink-trap-battle.ts');
      const { model: m, scene } = window.__game;
      scene.scene.pause();
      scene.sync();
      scene.drawOverlay(0);
      const traps = m.battle.buildings.filter((b) => b.npc === 'shrink-trap');
      const hidden = traps.every((b) => !scene.sprites.get(b.id).visible);
      const absent = scene.shrinkTrapPresentation.bodies.size === 0;
      deployShrinkTrap(m);
      m.step(0.05);
      scene.sync();
      scene.drawOverlay(0);
      const trap = traps.find((t) => m.battle.traps[t.id]);
      const sprite = scene.sprites.get(trap.id);
      scene.setZoom(innerWidth < 500 ? 1 : 1.3);
      scene.cameras.main.centerOn(sprite.x + 70, sprite.y);
      return {
        hidden,
        absent,
        count: traps.length,
        hp: m.battle.units.map((u) => [u.hp, u.maxHp]),
        bodies: scene.shrinkTrapPresentation.bodies.size,
        effects: [...scene.shrinkTrapPresentation.effects.keys()],
      };
    });
    expect(start).toMatchObject({ hidden: true, absent: true, count: 8, bodies: 1 });
    expect(start.hp.every(([hp, max]) => hp === max)).toBe(true);
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    await page.screenshot({
      path: `output/playtest/shrink-trap-trigger-${viewport.width}-${browserName}.png`,
    });
    const active = await page.evaluate(() => {
      const { model: m, scene } = window.__game;
      for (let i = 0; i < 79; i++) m.step(0.05);
      scene.sync();
      scene.drawOverlay(0);
      const poses = () =>
        [...scene.shrinkTrapPresentation.effects].map(([key, view]) => [
          key,
          [...view.meshes].map(([k, v]) => [k, v.vertices, v.alpha]),
        ]);
      const before = JSON.stringify(poses()),
        battle = JSON.stringify(m.battle);
      scene.drawOverlay(999999);
      return {
        poses: poses(),
        paused: before === JSON.stringify(poses()),
        unchanged: battle === JSON.stringify(m.battle),
        scales: m.battle.units
          .filter((u) => u.hp > 0)
          .map((u) => [u.kind, scene.unitSprites.get(u.id).getData('shrinkScale')]),
        range: [...scene.shrinkTrapPresentation.effects.keys()].filter((k) =>
          k.includes(':deploy:2:'),
        ),
        gl: scene.game.renderer.gl.getError(),
      };
    });
    expect(active).toMatchObject({ paused: true, unchanged: true, gl: 0 });
    expect(active.range).toHaveLength(1);
    expect(active.scales.every(([, s]) => s === 0.5)).toBe(true);
    expect(active.scales.some(([k]) => k === 'dragon')).toBe(true);
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    await page.screenshot({
      path: `output/playtest/shrink-trap-area-${viewport.width}-${browserName}.png`,
    });
    const reduced = await page.evaluate(() => {
      const { model: m, scene } = window.__game;
      m.state.settings.reducedMotion = true;
      scene.drawOverlay(0);
      const keys = [...scene.shrinkTrapPresentation.effects.keys()];
      for (let i = 0; i < 560; i++) m.step(0.05);
      scene.sync();
      scene.drawOverlay(0);
      const scales = m.battle.units
        .filter((u) => u.hp > 0)
        .map((u) => scene.unitSprites.get(u.id).getData('shrinkScale'));
      const result = { keys, scales, remaining: scene.shrinkTrapPresentation.effects.size };
      m.finishBattle();
      scene.sync();
      scene.drawOverlay(0);
      m.returnHome();
      scene.sync();
      scene.drawOverlay(0);
      return {
        ...result,
        cleared:
          scene.shrinkTrapPresentation.effects.size === 0 &&
          scene.shrinkTrapPresentation.bodies.size === 0,
      };
    });
    expect(reduced.keys).toHaveLength(1);
    expect(reduced.keys[0]).toContain(':deploy:2:');
    expect(reduced.scales.length).toBeGreaterThan(0);
    expect(reduced.scales.every((s) => s === 1)).toBe(true);
    expect(reduced).toMatchObject({ remaining: 0, cleared: true });
    expect(errors).toEqual([]);
  });

test('portable Magic Practice replay restores status, particles, audio and the home village', async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { shrinkTrapBattle, shrinkTrapVillage } =
      await import('/tests/fixtures/shrink-trap-battle.ts');
    const { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
    const { model: m, scene, audio } = window.__game;
    scene.scene.pause();
    Object.assign(m.state, shrinkTrapVillage());
    shrinkTrapBattle(m);
    for (let i = 0; i < 4000 && !m.battle.finished; i++) m.step(0.05);
    const end = JSON.stringify(m.battle),
      file = makeReplayFile(m.state.raidLog[0].replay);
    m.returnHome();
    const home = JSON.stringify(m.state);
    m.openReplay(parseReplayFile(JSON.stringify(file)));
    const seek = (at) => {
      m.seekReplay(at);
      while (m.replay.seeking) m.step(0.05);
      scene.sync();
      scene.drawOverlay(0);
      return JSON.stringify({
        battle: m.battle,
        effects: [...scene.shrinkTrapPresentation.effects].map(([key, v]) => [
          key,
          [...v.meshes].map(([k, m]) => [k, m.vertices, m.alpha]),
        ]),
        bodies: [...scene.shrinkTrapPresentation.bodies.keys()],
        scales: [...scene.unitSprites].map(([id, v]) => [id, v.getData('shrinkScale')]),
      });
    };
    const times = [0.1, 0.5, 1, 1.95, 4, 20.5, 21, 27.5];
    const same = times.map((at) => {
      const first = seek(at);
      seek(0);
      return seek(at) === first;
    });
    seek(9999);
    const actualEnd = structuredClone(m.battle);
    // Inspect replay isolation before yielding to normal wall-clock home production.
    const homeUnchanged = JSON.stringify(m.state) === home;
    seek(0.1);
    await audio.unlock();
    audio.samples.decode();
    await Promise.all([...audio.samples.decoding.values()]);
    const { shrinkSoundCues } = await import('/src/game/shrink-trap-poses.ts');
    const trap = m.battle.buildings.find((b) => b.npc === 'shrink-trap' && m.battle.traps[b.id]);
    const cues = shrinkSoundCues(trap.id, m.battle.traps[trap.id]);
    audio.samples.sync(cues, 0.1, 2, true);
    const sound = [...audio.samples.active].map(([key, v]) => [
      key,
      v.source.playbackRate.value,
      v.gain.gain.value,
    ]);
    audio.samples.sync(cues, 0.1, 2, false);
    const stopped = audio.samples.active.size === 0;
    m.returnHome();
    scene.sync();
    scene.drawOverlay(0);
    return {
      same,
      actualEnd,
      expectedEnd: JSON.parse(end),
      sound,
      stopped,
      home: homeUnchanged,
      gl: scene.game.renderer.gl.getError(),
    };
  });
  expect(result.same).toEqual(Array(8).fill(true));
  expect(result.actualEnd).toEqual(result.expectedEnd);
  expect(result).toMatchObject({ stopped: true, home: true, gl: 0 });
  expect(result.sound).toHaveLength(1);
  expect(result.sound[0][0]).toContain('shrink:');
  expect(result.sound[0][1]).toBe(2);
  expect(result.sound[0][2]).toBeCloseTo(0.108, 6);
});
