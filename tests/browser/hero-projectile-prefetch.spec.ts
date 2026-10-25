import { expect, test, type Page } from '@playwright/test';

const frost = 'assets/projectiles-native/queenfrostyprojectile/graph.json';
const monolith = [1, 2, 3].map(
  (tier) => `assets/projectiles-native/archerqueenmonolithprojectile${tier}/graph.json`,
);

async function waitForPacks(page: Page, paths: string[]) {
  await page.waitForFunction(
    (paths) => paths.every((path) => window.__game.scene.nativeProjectiles.packs.packs.has(path)),
    paths,
  );
}

async function firstShot(page: Page, replay = false) {
  return page.evaluate(async (replay) => {
    const { model, scene } = window.__game;
    if (replay) {
      model.seekReplay(0.15);
      while (model.replay.seeking) model.step(0.05);
    } else {
      if (!model.deployNativeHero('queen', 6.9, 11.5)) throw Error('Warm Queen deployment failed');
      for (let i = 0; i < 3; i++) model.step(0.05);
    }
    model.changed();
    scene.sync();
    const { iso } = await import('/src/game/scene.ts');
    const point = iso(10.25, 11.5);
    scene.cameras.main.setZoom(innerWidth === 390 ? 1.3 : 2).centerOn(point.x, point.y - 30);
    scene.drawOverlay(0);
    const queenId = model.battle.nativeHeroes[0].unitId;
    const shot = model.battle.projectiles.find((shot) => shot.sourceId === queenId);
    const entry = scene.nativeProjectiles.views.get(shot.id);
    return {
      name: shot.native.name,
      frost: shot.native.frost,
      covered: scene.nativeProjectiles.covers(shot.id),
      drawn:
        !!entry &&
        entry.view.objects.some(
          (object) =>
            object.visible &&
            object.alpha > 0 &&
            object.texture?.key &&
            object.texture.key !== '__MISSING' &&
            object.texture.key !== '__DEFAULT',
        ),
    };
  }, replay);
}

test('warms home equipment projectiles again when the Queen loadout changes', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1440, height: 960 });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const requested = new Map<string, number>();
  let releaseFrost!: () => void;
  let releaseMonolith!: () => void;
  const heldFrost = new Promise<void>((resolve) => (releaseFrost = resolve));
  const heldMonolith = new Promise<void>((resolve) => (releaseMonolith = resolve));
  await page.route('**/assets/projectiles-native/*/graph.json', async (route) => {
    const path = new URL(route.request().url()).pathname.slice(1);
    if (path === frost || monolith.includes(path)) {
      requested.set(path, (requested.get(path) ?? 0) + 1);
      await (path === frost ? heldFrost : heldMonolith);
    }
    await route.continue();
  });
  await page.goto('/?lazyart');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  await page.evaluate(async () => {
    const { makeBuilding } = await import('/src/game/model.ts');
    const { model, scene } = window.__game;
    scene.paused = true;
    model.clearArmy();
    model.state.obstacles = [];
    model.state.buildings = [
      makeBuilding(1, 'townhall', 36, 36, 18),
      makeBuilding(2, 'goldstorage', 12, 10, 15),
      makeBuilding(3, 'herohall', 30, 2, 13),
      makeBuilding(4, 'blacksmith', 30, 10, 9),
    ];
    model.state.nextId = 100;
    model.state.king = undefined;
    model.state.heroes = { queen: { level: 1 } };
    model.state.heroLineup = ['queen'];
    model.state.gear = { levels: { 'frozen-arrow': 1 }, loadouts: { queen: ['frozen-arrow'] } };
    model.changed();
    scene.sync();
  });
  await expect.poll(() => requested.get(frost)).toBe(1);
  expect(monolith.some((path) => requested.has(path))).toBe(false);
  releaseFrost();
  await waitForPacks(page, [frost]);
  await page.evaluate(() => {
    const { model, scene } = window.__game;
    model.startBattle(0, true);
    scene.sync();
  });
  await page.waitForFunction(() => !window.__game.scene.battleArtPending());
  expect(await firstShot(page)).toEqual({
    name: 'QueenFrostyProjectile',
    frost: { seconds: 0.75, percent: 0.25 },
    covered: true,
    drawn: true,
  });
  await page.evaluate(() => {
    const { model, scene } = window.__game;
    model.finishBattle();
    model.returnHome();
    model.state.gear.levels['monolith-arrow'] = 1;
    model.state.gear.loadouts.queen = ['frozen-arrow', 'monolith-arrow'];
    model.changed();
    scene.sync();
  });
  await expect.poll(() => monolith.filter((path) => requested.get(path) === 1).length).toBe(3);
  releaseMonolith();
  await waitForPacks(page, monolith);
  await page.evaluate(() => {
    const { model, scene } = window.__game;
    model.startBattle(0, true);
    scene.sync();
  });
  await page.waitForFunction(() => !window.__game.scene.battleArtPending());
  expect(await firstShot(page)).toEqual({
    name: 'ArcherQueenMonolithProjectile3',
    frost: { seconds: 0.75, percent: 0.25 },
    covered: true,
    drawn: true,
  });
  expect(requested.get(frost)).toBe(1);
  expect(monolith.map((path) => requested.get(path))).toEqual([1, 1, 1]);
  await page.screenshot({ path: 'output/playtest/hero-projectile-prefetch-home.png' });
  expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
  expect(errors).toEqual([]);
});

test('warms recorded equipment before an imported Queen fires her first shot', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 390, height: 844 });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const requested = new Set<string>();
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route('**/assets/projectiles-native/*/graph.json', async (route) => {
    const path = new URL(route.request().url()).pathname.slice(1);
    if (path === frost || monolith.includes(path)) {
      requested.add(path);
      await held;
    }
    await route.continue();
  });
  await page.goto('/?lazyart');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  const before = await page.evaluate(async () => {
    const { frozenArrowBattle } = await import('/tests/fixtures/frozen-arrow-impact.ts');
    const { model: recorder } = frozenArrowBattle([
      { slug: 'frozen-arrow', level: 1 },
      { slug: 'monolith-arrow', level: 1 },
    ]);
    for (let i = 0; i < 50; i++) recorder.step(0.05);
    recorder.finishBattle();
    const data = JSON.parse(JSON.stringify(recorder.state.raidLog[0].replay));
    const { model, scene } = window.__game;
    scene.paused = true;
    model.clearArmy();
    if (!model.openReplay(data)) throw Error('Equipment projectile replay rejected');
    scene.sync();
    return { time: model.replay.time, projectiles: model.battle.projectiles?.length ?? 0 };
  });
  expect(before).toEqual({ time: 0, projectiles: 0 });
  await expect.poll(() => requested.size).toBe(4);
  release();
  await waitForPacks(page, [frost, ...monolith]);
  await page.waitForFunction(() => !window.__game.scene.battleArtPending());
  expect(await firstShot(page, true)).toEqual({
    name: 'ArcherQueenMonolithProjectile3',
    frost: { seconds: 0.75, percent: 0.25 },
    covered: true,
    drawn: true,
  });
  await page.screenshot({ path: 'output/playtest/hero-projectile-prefetch-replay.png' });
  expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
  expect(errors).toEqual([]);
});
