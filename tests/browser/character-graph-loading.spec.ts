import { expect, test, type Page } from '@playwright/test';

test.use({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
});

async function bootShared(page: Page, withShared = true) {
  await page.goto('/?lazyart');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  await page.evaluate(async (withShared) => {
    const { makeBuilding } = await import('/src/game/model.ts');
    const { loadCharacterArt } = await import('/src/game/character-art.ts');
    const { model, scene } = window.__game;
    model.townhall.level = 18;
    const hut = makeBuilding(model.state.nextId++, 'builder', 32, 32, 4);
    model.state.buildings.push(hut);
    window.__partialGraphHut = hut.id;
    model.changed();
    scene.sync();
    if (withShared) await loadCharacterArt(new Set());
  }, withShared);
  await page.waitForFunction(
    () => window.__game.scene.artSettled && !window.__game.scene.lateArtLoading,
  );
}

async function spawn(page: Page, kind = 'archer', level = 9) {
  return page.evaluate(
    async ({ kind, level }) => {
      const { spawnDefendingBuilder } = await import('/src/game/defending-builder.ts');
      const { spawnGarrisonDefender } = await import('/src/game/garrison-combat.ts');
      const { model, scene, game } = window.__game;
      model.startBattle(0, true);
      const battle = model.battle;
      const hut = battle.buildings.find((building) => building.id === window.__partialGraphHut);
      const worker = spawnDefendingBuilder(battle, hut, 0);
      const archer = spawnGarrisonDefender(battle, kind, level, hut.id, 33, 32, 0);
      battle.elapsed = 0.2;
      model.changed();
      scene.sync();
      scene.drawOverlay(200);
      return { worker: worker.id, archer: archer.id, frame: game.loop.frame };
    },
    { kind, level },
  );
}

for (const blocked of ['Archer9', 'Defending Builder']) {
  test(`a pending ${blocked} body stays guarded after shared graphs and another body are ready`, async ({
    page,
  }) => {
    test.setTimeout(180000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.text().startsWith('Skipped drawing')) errors.push(message.text());
    });
    const path =
      blocked === 'Archer9'
        ? '**/reference/characters/archer/archer9.json*'
        : '**/reference/characters/worker/defending-builder.json*';
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let requested = 0;
    await page.route(path, async (route) => {
      requested++;
      await gate;
      await route.continue();
    });
    try {
      await bootShared(page);
      const ids = await spawn(page);
      await expect.poll(() => requested).toBe(1);
      const other = blocked === 'Archer9' ? 'Defending Builder' : 'Archer9';
      await page.waitForFunction(
        async (other) => (await import('/src/game/character-art.ts')).characterArtLoaded(other),
        other,
      );
      await page.waitForFunction((frame) => window.__game.game.loop.frame > frame + 2, ids.frame);
      const pending = await page.evaluate(async (blocked) => {
        const { characterArtLoaded } = await import('/src/game/character-art.ts');
        const { scene, model, game } = window.__game;
        scene.drawOverlay(200);
        return {
          shared: characterArtLoaded(),
          body: characterArtLoaded(blocked),
          waiting: scene.battleArtPending(),
          elapsed: model.battle.elapsed,
          gl: game.renderer.gl.getError(),
        };
      }, blocked);
      expect(pending).toEqual({ shared: true, body: false, waiting: true, elapsed: 0.2, gl: 0 });
      expect(errors).toEqual([]);
      release();
      await page.waitForFunction(
        () => !window.__game.scene.battleArtPending() && !window.__game.scene.lateArtLoading,
      );
      const visible = await page.evaluate((ids) => {
        const { scene, game } = window.__game;
        scene.drawOverlay(200);
        return {
          worker: scene.children.list.some(
            (object) =>
              object.visible &&
              object.alpha > 0 &&
              object.getData?.('defendingBuilder') === ids.worker,
          ),
          archer:
            scene.garrisonPresentation.defenders
              .get(ids.archer)
              ?.objects.some((object) => object.visible && object.alpha > 0) ?? false,
          gl: game.renderer.gl.getError(),
        };
      }, ids);
      expect(visible).toEqual({ worker: true, archer: true, gl: 0 });
      expect(errors).toEqual([]);
    } finally {
      release();
    }
  });
}

for (const payload of ['body', 'shared', 'projectile'])
  test(`a failed ${payload} graph retries after reconnecting without discarding ready graphs`, async ({
    page,
  }) => {
    test.setTimeout(180000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const suffix =
      payload === 'body'
        ? '/reference/characters/archer/archer9.json'
        : payload === 'shared'
          ? '/src/game/character-shared-graphs.ts'
          : '/reference/characters/projectiles/bowler.json';
    const animation = payload === 'projectile' ? 'Troll_lvl3' : 'Archer9';
    const path = '**' + suffix + '*';
    let requests = 0;
    page.on('request', (request) => {
      if (request.method() === 'GET' && new URL(request.url()).pathname === suffix) requests++;
    });
    await page.route(path, (route) =>
      route.fulfill({ status: 503, body: 'Temporary body graph outage' }),
    );
    await bootShared(page, payload !== 'shared');
    const ids = payload === 'projectile' ? await spawn(page, 'bowler', 4) : await spawn(page);
    await page.waitForFunction(
      () => window.__game.scene.lateArtFailure && !window.__game.scene.lateArtLoading,
    );
    await page.evaluate(async () => {
      const { scene, model } = window.__game;
      await Promise.all(Array.from({ length: 3 }, () => scene.loadLateAssets(true, model.battle)));
    });
    expect(requests).toBe(1);
    expect(
      await page.evaluate(async (animation) => {
        const { characterArtLoaded } = await import('/src/game/character-art.ts');
        return {
          shared: characterArtLoaded(),
          archer: characterArtLoaded(animation),
          waiting: window.__game.scene.battleArtPending(),
        };
      }, animation),
    ).toEqual({ shared: payload !== 'shared', archer: false, waiting: true });
    await page.unroute(path);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect.poll(() => requests).toBeGreaterThan(1);
    await page.waitForFunction(
      () => !window.__game.scene.battleArtPending() && !window.__game.scene.lateArtLoading,
    );
    expect(
      await page.evaluate((ids) => {
        const { scene } = window.__game;
        scene.drawOverlay(200);
        return (
          scene.garrisonPresentation.defenders
            .get(ids.archer)
            ?.objects.some((object) => object.visible && object.alpha > 0) ?? false
        );
      }, ids),
    ).toBe(true);
    expect(errors).toEqual([]);
  });

for (const actor of [
  { kind: 'bowler', level: 4, animation: 'Troll_lvl3', group: 'bowler', shot: 'trollBoulder_lvl3' },
  {
    kind: 'witch',
    level: 4,
    animation: 'Necromancer_lvl2',
    group: 'witch',
    shot: 'Witch_projectile',
  },
  {
    kind: 'lavahound',
    level: 6,
    animation: 'ADSeeker_lvl6',
    group: 'lava-hound',
    shot: 'hound_projectile',
  },
])
  test(`a recorded ${actor.kind} waits for its own projectile graph and guards pending shots`, async ({
    page,
  }) => {
    test.setTimeout(180000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.text().startsWith('Skipped drawing')) errors.push(message.text());
    });
    const groups: string[] = [];
    page.on('request', (request) => {
      const match = new URL(request.url()).pathname.match(
        /\/projectiles\/(bowler|witch|lava-hound)\.json$/,
      );
      if (match) groups.push(match[1]);
    });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let requested = false;
    await page.route(`**/reference/characters/projectiles/${actor.group}.json*`, async (route) => {
      requested = true;
      await gate;
      await route.continue();
    });
    try {
      await bootShared(page);
      const ids = await spawn(page, actor.kind, actor.level);
      await expect.poll(() => requested).toBe(true);
      await page.waitForFunction(async (animation) => {
        const art = await import('/src/game/character-art.ts');
        return !!art.characterArts()[animation];
      }, actor.animation);
      const pending = await page.evaluate(
        async ({ actor, id }) => {
          const art = await import('/src/game/character-art.ts');
          const { iso } = await import('/src/game/scene.ts');
          const { scene, model, game } = window.__game;
          scene.paused = true;
          const defender = model.battle.defenders.find((defender) => defender.id === id);
          defender.shots = [
            {
              n: 0,
              projectile: actor.shot,
              speed: 4.75,
              targetId: 9999,
              fromX: 33,
              fromY: 32,
              x: 36,
              y: 32,
              flight: { x: 34, y: 32, at: 0.2 },
              launched: 0,
              impact: 1,
              air: false,
              damage: 1,
              splash: 0.3,
            },
          ];
          scene.garrisonPresentation.render(model.battle, false, iso, 46);
          return {
            body: art.characterArtLoaded(actor.animation),
            shot: art.projectileArtLoaded(actor.shot, 'sc/characters.sc'),
            waiting: scene.battleArtPending(),
            shots: scene.garrisonPresentation.shots.size,
            elapsed: model.battle.elapsed,
            gl: game.renderer.gl.getError(),
          };
        },
        { actor, id: ids.archer },
      );
      expect(pending).toEqual({
        body: false,
        shot: false,
        waiting: true,
        shots: 0,
        elapsed: 0.2,
        gl: 0,
      });
      expect(groups).toEqual([actor.group]);
      expect(errors).toEqual([]);
      release();
      await page.waitForFunction(
        () => !window.__game.scene.battleArtPending() && !window.__game.scene.lateArtLoading,
      );
      const ready = await page.evaluate(
        async ({ actor, id }) => {
          const art = await import('/src/game/character-art.ts');
          const { iso } = await import('/src/game/scene.ts');
          const { scene, model, game } = window.__game;
          scene.garrisonPresentation.render(model.battle, false, iso, 46);
          return {
            body: art.characterArtLoaded(actor.animation),
            visible:
              scene.garrisonPresentation.defenders
                .get(id)
                ?.objects.some((object) => object.visible && object.alpha > 0) ?? false,
            shots: scene.garrisonPresentation.shots.size,
            gl: game.renderer.gl.getError(),
          };
        },
        { actor, id: ids.archer },
      );
      expect(ready).toEqual({
        body: true,
        visible: true,
        shots: actor.kind === 'bowler' ? 2 : 1,
        gl: 0,
      });
      expect(groups).toEqual([actor.group]);
      expect(errors).toEqual([]);
    } finally {
      release();
    }
  });
