import { test, expect, type Page } from '@playwright/test';

async function scout(page: Page) {
  await page.goto('/?lazyart');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  const id = await page.evaluate(async () => {
    const { freshNativeCampaign } = await import('/src/game/native-campaign.ts');
    const { emptyArmy } = await import('/src/game/army.ts');
    const { model, scene } = window.__game;
    model.state.nativeCampaign = freshNativeCampaign();
    model.state.nativeCampaign.stars.fill(1);
    model.state.army = { ...emptyArmy(), giant: 1 };
    model.startCampaign(75);
    scene.sync();
    if (model.battle.buildings.some((building) => building.kind === 'skeletontrap'))
      throw Error('This village must load Ghost coffins without a Skeleton Trap');
    return model.battle.buildings.find((building) => building.npc === 'ghost-trap').id;
  });
  await page.waitForFunction(
    () => window.__game.scene.lateAssetsReady && window.__game.scene.artSettled,
  );
  return id;
}

async function reveal(page: Page, id: number) {
  // Hold a recorded trigger state to inspect the coffin; combat timing has its own tests.
  await page.evaluate((id) => {
    const { model, scene } = window.__game;
    const battle = model.battle;
    const trap = battle.buildings.find((building) => building.id === id);
    battle.started = true;
    battle.prep = 0;
    battle.elapsed = 0.4;
    battle.traps[id] = {
      activatedAt: 0,
      resolved: true,
      targetId: 0,
      x: trap.x + 0.5,
      y: trap.y + 0.5,
      spawned: 1,
    };
    (battle.late.ghostTrap ??= { traps: {} }).traps[id] = {
      trapId: id,
      activatedAt: 0,
      spawned: [0],
    };
    model.changed();
    scene.sync();
    scene.drawOverlay(400);
  }, id);
}

async function nativeCoffin(page: Page, id: number) {
  return page.evaluate(
    (id) =>
      window.__game.scene.children.list.some(
        (object) =>
          object.visible &&
          object.alpha > 0 &&
          object.getData?.('ghostTrap')?.id === id &&
          object.texture.key === 'skeletontrap-native-1',
      ),
    id,
  );
}

test('a cold Go to Bat visit loads Ghost coffins and keeps shared home art after returning', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const id = await scout(page);
  await expect
    .poll(() =>
      page.evaluate(() =>
        [1, 3].every((tier) => window.__game.scene.textures.exists(`skeletontrap-native-${tier}`)),
      ),
    )
    .toBe(true);
  await reveal(page, id);
  await expect.poll(() => nativeCoffin(page, id)).toBe(true);
  await page.screenshot({ path: 'output/playtest/ghost-trap-cold.png' });
  await page.evaluate(async () => {
    const { makeBuilding } = await import('/src/game/model.ts');
    const { model, scene } = window.__game;
    model.state.buildings = [
      makeBuilding(5000, 'townhall', 20, 20, 8),
      makeBuilding(5001, 'builder', 25, 25),
      makeBuilding(5002, 'skeletontrap', 10, 10, 1),
    ];
    model.state.nextId = 5003;
    model.returnHome();
    scene.sync();
  });
  await page.waitForFunction(() => window.__game.scene.artSettled);
  const retained = await page.evaluate(() => {
    const { scene } = window.__game;
    scene.lateIdleSince = undefined;
    scene.releaseLateAssetsWhenIdle(1e9);
    scene.releaseLateAssetsWhenIdle(1e9 + 100000);
    scene.familyIdleSince = undefined;
    scene.releaseIdleFamilies(1e9);
    scene.releaseIdleFamilies(1e9 + 100000);
    return {
      late: scene.lateAssetsReady,
      coffins: [1, 3].every((tier) => scene.textures.exists(`skeletontrap-native-${tier}`)),
      home: scene.sprites.get(5002)?.texture.key,
    };
  });
  expect(retained).toEqual({ late: false, coffins: true, home: 'skeletontrap-native-1' });
  expect(errors).toEqual([]);
});

test('a failed Ghost coffin keeps its fallback and recovers on reconnect', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const path = '/assets/buildings/skeleton-trap-native/1-atlas.png';
  const pattern = '**' + path;
  let attempts = 0;
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === path) attempts++;
  });
  await page.route(pattern, (route) => {
    return route.fulfill({ status: 503, body: 'Temporary coffin outage' });
  });
  const id = await scout(page);
  await reveal(page, id);
  await expect
    .poll(() =>
      page.evaluate((id) => {
        const { model, scene } = window.__game;
        const trap = model.battle.buildings.find((building) => building.id === id);
        const fallback = scene.sprites.get(id);
        return {
          handled: scene.lateCampaign.handles(trap),
          visible: fallback?.visible,
          alpha: fallback?.alpha,
          texture: fallback?.texture.key,
        };
      }, id),
    )
    .toEqual({
      handled: false,
      visible: true,
      alpha: 0.35,
      texture: 'skeletontrap-native-3-ground',
    });
  expect(await nativeCoffin(page, id)).toBe(false);
  const failed = attempts;
  await page.unroute(pattern);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect.poll(() => attempts, { timeout: 2000 }).toBeGreaterThan(failed);
  await expect.poll(() => nativeCoffin(page, id), { timeout: 20000 }).toBe(true);
  await expect
    .poll(() => page.evaluate((id) => window.__game.scene.sprites.get(id)?.alpha, id))
    .toBe(0);
  expect(errors).toEqual([]);
  await page.screenshot({ path: 'output/playtest/ghost-trap-recovered.png' });
});
