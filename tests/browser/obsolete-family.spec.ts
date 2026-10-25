import { expect, test, type Page } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

async function boot(page: Page) {
  await page.goto('/?lazyart');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
}

async function holdMortar(page: Page) {
  let release!: () => void;
  let requested = false;
  const gate = new Promise<void>((resolve) => (release = resolve));
  await page.route('**/reference/mortar/runtime.json*', async (route) => {
    requested = true;
    await gate;
    await route.continue();
  });
  return { release, wait: () => expect.poll(() => requested).toBe(true) };
}

const scout = (page: Page) =>
  page.evaluate(async () => {
    const { emptyArmy } = await import('/src/game/army.ts');
    const { freshNativeCampaign } = await import('/src/game/native-campaign.ts');
    const { model, scene } = window.__game;
    model.state.army = { ...emptyArmy(), swordsman: 20 };
    model.state.nativeCampaign = freshNativeCampaign();
    model.state.nativeCampaign.stars.fill(1);
    model.changed();
    model.startCampaign(40);
    scene.sync();
  });

const mortar = (page: Page) =>
  page.evaluate(() => {
    const { scene } = window.__game;
    const family = scene.deferredFamilies.find((family) => family.draws({ kind: 'mortar' }));
    return {
      requested: scene.requestedFamilies.has(family),
      loaded: scene.loadedFamilies.has(family),
      failed: scene.failedFamilies.has(family),
      keys: (scene.familyTextures.get(family) ?? []).filter((key) => scene.textures.exists(key)),
    };
  });

test('returning home before a graph arrives skips its images and a later battle can load it', async ({
  page,
}) => {
  const errors: string[] = [];
  const images: string[] = [];
  let returned = false;
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (returned && /\.(png|webp|jpg)$/.test(new URL(request.url()).pathname))
      images.push(request.url());
  });
  const gate = await holdMortar(page);
  try {
    await boot(page);
    await scout(page);
    await gate.wait();
    await page.locator('.end-battle[data-action="home"]').click();
    await page.waitForFunction(() => !window.__game.model.battle);
    returned = true;
    gate.release();
    await page.waitForFunction(() => window.__game.scene.artSettled);
    expect(await mortar(page)).toEqual({
      requested: false,
      loaded: false,
      failed: false,
      keys: [],
    });
    expect(images).toEqual([]);
    returned = false;
    await scout(page);
    await page.waitForFunction(() => window.__game.scene.artSettled);
    expect((await mortar(page)).loaded).toBe(true);
    await expect
      .poll(() => page.evaluate(() => window.__game.scene.mortarPresentation.towers.size))
      .toBeGreaterThan(0);
    expect(errors).toEqual([]);
  } finally {
    gate.release();
  }
});

test('a pending family still loads for a home building after returning from scouting', async ({
  page,
}) => {
  const gate = await holdMortar(page);
  try {
    await boot(page);
    const id = await page.evaluate(async () => {
      const { makeBuilding } = await import('/src/game/model.ts');
      const { model, scene } = window.__game;
      const building = makeBuilding(model.state.nextId++, 'mortar', 32, 32, 1);
      model.state.buildings.push(building);
      model.changed();
      scene.sync();
      return building.id;
    });
    await gate.wait();
    await scout(page);
    await page.locator('.end-battle[data-action="home"]').click();
    gate.release();
    await page.waitForFunction(() => window.__game.scene.artSettled);
    expect((await mortar(page)).loaded).toBe(true);
    await expect
      .poll(() => page.evaluate((id) => window.__game.scene.mortarPresentation.towers.has(id), id))
      .toBe(true);
  } finally {
    gate.release();
  }
});

test('a new battle can retain a family requested by the previous battle', async ({ page }) => {
  const gate = await holdMortar(page);
  try {
    await boot(page);
    await scout(page);
    await gate.wait();
    await page.locator('.end-battle[data-action="home"]').click();
    await scout(page);
    gate.release();
    await page.waitForFunction(() => window.__game.scene.artSettled);
    expect((await mortar(page)).loaded).toBe(true);
    await expect
      .poll(() => page.evaluate(() => window.__game.scene.mortarPresentation.towers.size))
      .toBeGreaterThan(0);
  } finally {
    gate.release();
  }
});

test('a prepared family waiting for another loader batch rechecks demand before image startup', async ({
  page,
}) => {
  let release!: () => void;
  let held = false;
  const gate = new Promise<void>((resolve) => (release = resolve));
  await page.route(/\/assets\/environment\/walls-v1\/level-8\.webp\?queue-hold$/, async (route) => {
    held = true;
    await gate;
    await route.continue();
  });
  try {
    await boot(page);
    const listeners = await page.evaluate(() => {
      const { scene } = window.__game;
      scene.load.image('probe:queue-hold', '/assets/environment/walls-v1/level-8.webp?queue-hold');
      scene.load.start();
      return scene.load.listenerCount('complete');
    });
    await expect.poll(() => held).toBe(true);
    await scout(page);
    await page.waitForFunction(() => {
      const family = window.__game.scene.deferredFamilies.find((family) =>
        family.draws({ kind: 'mortar' }),
      );
      return family.prepared();
    });
    await expect
      .poll(() => page.evaluate(() => window.__game.scene.load.listenerCount('complete')))
      .toBeGreaterThan(listeners);
    await page.locator('.end-battle[data-action="home"]').click();
    release();
    await page.waitForFunction(() => window.__game.scene.artSettled);
    expect(await mortar(page)).toEqual({
      requested: false,
      loaded: false,
      failed: false,
      keys: [],
    });
    expect(await page.evaluate(() => window.__game.scene.textures.exists('probe:queue-hold'))).toBe(
      true,
    );
  } finally {
    release();
  }
});

test('a canceled placement queued behind another graph skips its own graph import', async ({
  page,
}) => {
  let xbowRequests = 0;
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.endsWith('/reference/xbow/runtime.json')) xbowRequests++;
  });
  const gate = await holdMortar(page);
  try {
    await boot(page);
    await scout(page);
    await gate.wait();
    await page.locator('.end-battle[data-action="home"]').click();
    const placement = await page.evaluate(() => {
      const { model, scene } = window.__game;
      model.townhall!.level = 9;
      model.state.gold = 100_000_000;
      model.changed();
      model.beginBuild('xbow', false);
      scene.sync();
      const family = scene.deferredFamilies.find((family) => family.draws({ kind: 'xbow' }));
      return { kind: model.placement, requested: scene.requestedFamilies.has(family) };
    });
    expect(placement).toEqual({ kind: 'xbow', requested: true });
    await page.evaluate(() => {
      window.__game.model.cancel();
      window.__game.scene.sync();
    });
    gate.release();
    await page.waitForFunction(() => window.__game.scene.artSettled);
    expect(xbowRequests).toBe(0);
    expect(await page.evaluate(() => window.__game.scene.requestedFamilies.size)).toBe(0);
  } finally {
    gate.release();
  }
});
