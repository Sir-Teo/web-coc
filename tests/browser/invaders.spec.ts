import { test, expect } from '@playwright/test';

for (const width of [1440, 390])
  test(`Invaders opens its original layout and reconstructs level-three combat at ${width}px`, async ({
    page,
    browserName,
  }) => {
    await page.setViewportSize({ width, height: width === 1440 ? 960 : 844 });
    await page.clock.setFixedTime(new Date('2026-09-12T14:00:00Z'));
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/');
    await page.waitForFunction(() => window.__game?.scene.ready);
    await page.locator('#loading').waitFor({ state: 'detached' });
    await page.locator('[data-action="skip-tutorial"]').click();
    await page.evaluate(async () => {
      const { invadersVillage } = await import('/tests/fixtures/invaders-battle.ts');
      const { model: m, scene } = window.__game;
      scene.paused = true;
      m.state = invadersVillage();
      m.changed();
      scene.sync();
      scene.drawOverlay();
    });
    await page.locator('.attack-btn').click();
    const card = page.locator('[data-stage="51"]');
    await expect(card).toContainText('Invaders');
    await expect(card).toContainText('300,000');
    await expect(card).toContainText('2,000');
    await expect(page.locator('[data-action="attack:50"]')).toBeEnabled();
    await expect(page.locator('[data-action="attack:54"]')).toHaveText('Coming soon');
    await page.locator('[data-action="attack:50"]').click();
    await expect(page.locator('.battle-enemy h2')).toHaveText('Invaders');
    await expect(page.locator('#battle-timer')).toHaveText('∞');
    const firing = await page.evaluate(async (width) => {
      const { deployInvaders } = await import('/tests/fixtures/invaders-battle.ts');
      const { BOMBER_GRAPH, BOMB_TOWER_GRAPH } = await import('/src/game/bomb-tower-poses.ts');
      const { model: m, scene } = window.__game;
      const tower = m.battle.buildings.find((b) => b.kind === 'bombtower');
      if (m.battle.buildings.length !== 272) throw Error('Incomplete Invaders layout');
      deployInvaders(m);
      for (let i = 0; i < 400 && !m.battle.bombTowers?.[tower.id]?.shots.length; i++) m.step(0.05);
      scene.sync();
      scene.setZoom(width < 500 ? 1 : 1.6);
      scene.cameras.main.centerOn(672, 720);
      scene.drawOverlay();
      const actor = scene.bombTowerPresentation.defenders.get(tower.id),
        pose = actor.objects[0].getData('nativeBomber');
      const shot = m.battle.projectiles.find((p) => p.weapon === 'towerbomb');
      const visual = scene.bombTowerPresentation.projectiles.get(shot.id);
      return {
        at: m.battle.elapsed,
        tower: structuredClone(tower),
        shot: structuredClone(shot),
        pose,
        actorKeys: [...actor.meshes.keys()],
        actorRoot: BOMBER_GRAPH.exports[`b_skeleton2_attack1_${pose.direction}`],
        bombKeys: [...visual.meshes.keys()],
        bombRoot: BOMB_TOWER_GRAPH.exports.bomb_projectile_lvl2,
      };
    }, width);
    expect(firing.tower).toMatchObject({ x: 13, y: 22, level: 3, maxHp: 750 });
    expect(firing.pose.action).toBe('attack');
    expect(firing.shot.damage).toBeCloseTo(35.2, 10);
    expect(firing.actorKeys.length).toBeGreaterThan(0);
    expect(firing.bombKeys.length).toBeGreaterThan(0);
    expect(firing.actorKeys.every((k) => k.startsWith(`${firing.actorRoot}/`))).toBe(true);
    expect(firing.bombKeys.every((k) => k.startsWith(`${firing.bombRoot}/`))).toBe(true);
    await page.screenshot({
      path: `output/playtest/invaders-firing-${width}-${browserName}.png`,
      animations: 'disabled',
    });
    const fuse = await page.evaluate(async () => {
      const { BOMB_TOWER_GRAPH } = await import('/src/game/bomb-tower-poses.ts');
      const { model: m, scene } = window.__game;
      const id = m.battle.buildings.find((b) => b.kind === 'bombtower').id;
      for (let i = 0; i < 400 && !m.battle.deathBombs?.[id]; i++) m.step(0.05);
      for (let i = 0; i < 3; i++) m.step(0.05);
      scene.sync();
      scene.drawOverlay();
      return {
        at: m.battle.elapsed,
        bomb: structuredClone(m.battle.deathBombs[id]),
        keys: [...scene.bombTowerPresentation.bombs.get(id).meshes.keys()],
        root: BOMB_TOWER_GRAPH.exports.bomb_tower_bomb_lvl2,
        emitters: [...scene.bombTowerPresentation.effects.values()].flatMap((v) =>
          v.objects.map((o) => o.getData('nativeBombTowerEffect').emitter),
        ),
        actor: scene.bombTowerPresentation.defenders.has(id),
      };
    });
    expect(fuse.bomb).toMatchObject({ damage: 220, resolved: false, x: 14.5, y: 23.5 });
    expect(fuse.actor).toBe(false);
    expect(fuse.keys.length).toBeGreaterThan(0);
    expect(fuse.keys.every((key) => key.startsWith(`${fuse.root}/`))).toBe(true);
    expect(fuse.emitters).toContain('Stone');
    await page.screenshot({
      path: `output/playtest/invaders-fuse-${width}-${browserName}.png`,
      animations: 'disabled',
    });
    const result = await page.evaluate(
      async ({ firingAt, fuseAt }) => {
        const { model: m, scene } = window.__game;
        const id = m.battle.buildings.find((b) => b.kind === 'bombtower').id;
        for (let i = 0; i < 1600 && !m.battle.finished; i++) m.step(0.05);
        if (!m.battle.finished) throw Error('Invaders did not settle');
        const result = structuredClone(m.battle.result),
          final = structuredClone(m.battle),
          progress = structuredClone(m.state.nativeCampaign);
        const record = m.state.raidLog[0];
        m.returnHome();
        const home = JSON.stringify(m.state);
        if (!m.startReplay(record.id)) throw Error('Invaders replay was rejected');
        const seek = (at) => {
          m.seekReplay(at);
          while (m.replay.seeking) m.step(0.05);
          scene.sync();
          scene.drawOverlay();
        };
        seek(firingAt);
        const replayShot = structuredClone(
          m.battle.projectiles.find((p) => p.weapon === 'towerbomb'),
        );
        seek(fuseAt);
        const replayBomb = structuredClone(m.battle.deathBombs[id]);
        seek(0);
        const reset = {
          hp: m.battle.buildings.find((b) => b.id === id).hp,
          effects: scene.bombTowerPresentation.effects.size,
          bombs: scene.bombTowerPresentation.bombs.size,
        };
        seek(9999);
        const same = JSON.stringify(m.battle) === JSON.stringify(final);
        m.returnHome();
        scene.sync();
        scene.drawOverlay();
        return {
          result,
          progress,
          replayShot,
          replayBomb,
          reset,
          same,
          isolated: JSON.stringify(m.state) === home,
          glError: scene.game.renderer.gl.getError(),
        };
      },
      { firingAt: firing.at, fuseAt: fuse.at },
    );
    expect(result.replayShot).toEqual(firing.shot);
    expect(result.replayBomb).toEqual(fuse.bomb);
    expect(result.reset).toEqual({ hp: 750, effects: 0, bombs: 0 });
    expect(result.same).toBe(true);
    expect(result.isolated).toBe(true);
    expect(result.result).toMatchObject({ stars: 2, destruction: 65, trophies: 0 });
    expect(result.progress.stars[50]).toBe(2);
    expect(result.glError).toBe(0);
    expect(errors).toEqual([]);
    console.log(
      'Invaders native combat',
      width,
      browserName,
      JSON.stringify({
        firingAt: firing.at,
        fuseAt: fuse.at,
        bomb: fuse.bomb,
        result: result.result,
      }),
    );
  });

for (const width of [390, 320])
  test(`Bomb Tower Info shows the source next level and TH9 gate at ${width}px`, async ({
    page,
    browserName,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/');
    await page.waitForFunction(() => window.__game?.scene.ready);
    await page.locator('#loading').waitFor({ state: 'detached' });
    await page.locator('[data-action="skip-tutorial"]').click();
    await page.evaluate(async () => {
      const { makeBuilding } = await import('/src/game/model.ts');
      const { model: m, scene } = window.__game;
      m.townhall.level = 8;
      m.state.obstacles = [];
      m.state.buildings.push(makeBuilding(m.state.nextId++, 'bombtower', 6, 10, 2));
      m.selected = m.state.buildings.at(-1).id;
      m.changed();
      scene.sync();
    });
    await page.locator('[data-action="info"]').click();
    await expect(page.locator('.info-hero')).toContainText('LEVEL 2 OF 13');
    await expect(page.locator('.info-table')).toContainText('Level 3');
    for (const value of ['700', '750', '28', '32', '30.8', '35.2', '180', '220'])
      await expect(page.locator('.info-table')).toContainText(value);
    await expect(page.locator('.info-upgrade')).toContainText('Requires Town Hall 9');
    expect(await page.locator('.info-upgrade button').count()).toBe(0);
    const bounds = await page.locator('.info-table').boundingBox();
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    await page.screenshot({
      path: `output/playtest/bomb-tower-th9-gate-${width}-${browserName}.png`,
      animations: 'disabled',
    });
  });
