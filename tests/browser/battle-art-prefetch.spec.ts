import { test, expect, type Page } from '@playwright/test';

async function boot(page: Page) {
  await page.goto('/?lazyart');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
}

test('Practice scouting warms its provided troops before the first deployment', async ({
  page,
}) => {
  const requested = new Set<string>();
  const provided = ['giant', 'goblin', 'wallbreaker'];
  page.on('request', (request) => {
    const kind = /\/assets\/troops-native\/([^/]+)\/graph\.json$/.exec(
      new URL(request.url()).pathname,
    )?.[1];
    if (kind && provided.includes(kind)) requested.add(kind);
  });
  await boot(page);
  await page.evaluate(() => {
    const { model, scene } = window.__game;
    model.clearArmy();
    model.townhall!.level = 4;
    model.startCampaign(90, true);
    scene.sync();
  });
  await expect.poll(() => [...requested].sort()).toEqual(provided);
  await page.waitForFunction(() => {
    const art = window.__game.scene.troopNativePresentation;
    return !art.pending.size && !art.pendingLevels.size;
  });
  const first = await page.evaluate(() => {
    const { model, scene } = window.__game;
    if (model.battle!.started) throw Error('The battle started during scouting');
    const spot = model.practiceGuide!.spot!;
    if (!model.deploy(spot.x, spot.y)) throw Error('Could not deploy the guided Giant');
    const unit = model.battle!.units[0];
    scene.sync();
    scene.drawOverlay();
    return {
      drawn: scene.troopNativePresentation.drewUnit(unit.id),
      level: unit.level ?? model.troopLevel('giant'),
    };
  });
  expect(first).toEqual({ drawn: true, level: 2 });
  await page.screenshot({ path: 'output/playtest/practice-native-prefetch.png' });
});

test('rewinding a Practice replay retains its provided hero atlas', async ({ page }) => {
  let requests = 0;
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/assets/characters/king-v1/atlas.json') requests++;
  });
  await boot(page);
  await page.evaluate(() => {
    const { model, scene } = window.__game;
    model.townhall!.level = 13;
    model.startCampaign(93, false);
    if (!model.deployNativeHero('king', 1, 1)) throw Error('Could not deploy the provided King');
    for (let i = 0; i < 40; i++) model.step(0.05);
    model.finishBattle();
    const id = model.state.raidLog![0].id;
    model.returnHome();
    scene.sync();
    if (!model.startReplay(id)) throw Error('Could not open the recorded Practice attack');
    model.toggleReplay();
    model.seekReplay(model.replay!.duration);
    scene.sync();
    scene.heroNativePresentation.prefetch(['heroes-native/king']);
  });
  const key = 'baked:heroes-native/king/front-right.webp';
  await page.waitForFunction((key) => {
    const { model, scene, game } = window.__game;
    return (
      !model.replay!.seeking &&
      !scene.heroNativePresentation.pending.size &&
      game.textures.exists(key)
    );
  }, key);
  const before = requests;
  await page.evaluate((key) => {
    window.__cachedReplayHeroTexture = window.__game.game.textures.get(key);
    window.__game.model.seekReplay(0);
  }, key);
  await page.waitForFunction(
    () => !window.__game.model.replay!.seeking && window.__game.model.replay!.time === 0,
  );
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  expect(
    await page.evaluate(
      (key) => window.__game.game.textures.get(key) === window.__cachedReplayHeroTexture,
      key,
    ),
  ).toBe(true);
  expect(requests).toBe(before);
});

test('home prefetch loads pets for the selected heroes', async ({ page }) => {
  const requested = new Set<string>();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => requested.add(new URL(request.url()).pathname));
  await boot(page);
  const lineup = await page.evaluate(async () => {
    const { makeBuilding } = await import('/src/game/model.ts');
    const { HERO_KINDS } = await import('/src/game/native-hero-data.ts');
    const { model, scene } = window.__game;
    model.state.obstacles = [];
    model.state.buildings = [
      makeBuilding(1, 'townhall', 22, 22, 18),
      makeBuilding(2, 'herohall', 15, 15, 12),
      makeBuilding(3, 'pethouse', 30, 30, 8),
    ];
    model.state.nextId = 4;
    model.state.king = { level: 20 };
    model.state.heroes = Object.fromEntries(
      HERO_KINDS.filter((kind) => kind !== 'king').map((kind) => [kind, { level: 20 }]),
    );
    model.state.heroLineup = ['king', 'queen', 'warden', 'duke'];
    model.state.pets = {
      levels: { lassi: 1, phoenix: 1 },
      assigned: { king: 'lassi', prince: 'phoenix' },
    };
    model.changed();
    scene.sync();
    return model.heroLineup;
  });
  expect(lineup).not.toContain('prince');
  await expect.poll(() => requested.has('/assets/heroes-native/lassi/atlas.json')).toBe(true);
  await page.waitForFunction(() => !window.__game.scene.heroNativePresentation.pending.size);
  expect(requested.has('/assets/heroes-native/phoenix/atlas.json')).toBe(false);
  expect(errors).toEqual([]);
});
