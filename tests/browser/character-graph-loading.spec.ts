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

async function spawn(page: Page) {
  return page.evaluate(async () => {
    const { spawnDefendingBuilder } = await import('/src/game/defending-builder.ts');
    const { spawnGarrisonDefender } = await import('/src/game/garrison-combat.ts');
    const { model, scene, game } = window.__game;
    model.startBattle(0, true);
    const battle = model.battle;
    const hut = battle.buildings.find((building) => building.id === window.__partialGraphHut);
    const worker = spawnDefendingBuilder(battle, hut, 0);
    const archer = spawnGarrisonDefender(battle, 'archer', 9, hut.id, 33, 32, 0);
    battle.elapsed = 0.2;
    model.changed();
    scene.sync();
    scene.drawOverlay(200);
    return { worker: worker.id, archer: archer.id, frame: game.loop.frame };
  });
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

for (const payload of ['body', 'shared'])
  test(`a failed ${payload} graph retries after reconnecting without discarding ready graphs`, async ({
    page,
  }) => {
    test.setTimeout(180000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const suffix =
      payload === 'body'
        ? '/reference/characters/archer/archer9.json'
        : '/src/game/character-shared-graphs.ts';
    const path = '**' + suffix + '*';
    let requests = 0;
    page.on('request', (request) => {
      if (request.method() === 'GET' && new URL(request.url()).pathname === suffix) requests++;
    });
    await page.route(path, (route) =>
      route.fulfill({ status: 503, body: 'Temporary body graph outage' }),
    );
    await bootShared(page, payload === 'body');
    const ids = await spawn(page);
    await page.waitForFunction(
      () => window.__game.scene.lateArtFailure && !window.__game.scene.lateArtLoading,
    );
    await page.evaluate(async () => {
      const { scene, model } = window.__game;
      await Promise.all(Array.from({ length: 3 }, () => scene.loadLateAssets(true, model.battle)));
    });
    expect(requests).toBe(1);
    expect(
      await page.evaluate(async () => {
        const { characterArtLoaded } = await import('/src/game/character-art.ts');
        return {
          shared: characterArtLoaded(),
          archer: characterArtLoaded('Archer9'),
          waiting: window.__game.scene.battleArtPending(),
        };
      }),
    ).toEqual({ shared: payload === 'body', archer: false, waiting: true });
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
