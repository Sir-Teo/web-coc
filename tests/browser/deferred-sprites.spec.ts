import { test, expect } from '@playwright/test';

test('per-level fallback sprites load when a level first draws, not at boot', async ({ page }) => {
  const requested: string[] = [];
  page.on('request', (r) => requested.push(new URL(r.url()).pathname));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  // Boot loads Level 1 and the levels the village owns, and no other wall, camp, Cannon or
  // tier-3 level.
  const owned = await page.evaluate(() => {
    const levels = (kind: string) =>
      window.__game.model.state.buildings.filter((b) => b.kind === kind).map((b) => b.level);
    return { wall: levels('wall'), camp: levels('camp'), cannon: levels('cannon') };
  });
  const level = (path: string, family: RegExp) => Number(family.exec(path)?.[1] ?? 0);
  const deferred = (path: string) =>
    /tier3/.test(path) ||
    [
      [/walls-v1\/level-(\d+)\./, owned.wall],
      [/camp-levels-v1\/level-(\d+)\./, owned.camp],
      [/cannon-native\/level-(\d+)\./, owned.cannon],
    ].some(([family, levels]) => {
      const n = level(path, family as RegExp);
      return n > 1 && !(levels as number[]).includes(n);
    });
  expect(requested.filter(deferred)).toEqual([]);
  const keys = await page.evaluate(async () => {
    const { model: m, scene } = window.__game;
    const wall = m.state.buildings.find((b) => b.kind === 'wall')!;
    const mine = m.state.buildings.find((b) => b.kind === 'goldmine')!;
    wall.level = 6;
    mine.level = 8;
    m.changed();
    scene.sync();
    // Drawn as Level 1 while the sprites load: never the missing-texture placeholder.
    const first = [
      scene.sprites.get(wall.id)!.texture.key,
      scene.sprites.get(mine.id)!.texture.key,
    ];
    await scene.prefetchDeferredArt([wall, mine]);
    return { first, ids: [wall.id, mine.id] };
  });
  expect(keys.first).toEqual(['wall-level-1', 'goldmine']);
  await expect
    .poll(() =>
      page.evaluate(
        (ids) => ids.map((id) => window.__game.scene.sprites.get(id)!.texture.key),
        keys.ids,
      ),
    )
    .toEqual(['wall-level-6', 'goldmine-tier3']);
  expect(requested.filter(deferred).length).toBe(2);
});

test('a kind the village lacks loads its base sprite when one first draws', async ({ page }) => {
  const requested: string[] = [];
  page.on('request', (r) => requested.push(new URL(r.url()).pathname));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  const kinds = await page.evaluate(
    () => new Set(window.__game.model.state.buildings.map((b) => b.kind)).size,
  );
  expect(kinds).toBeGreaterThan(5);
  // No Blacksmith, Laboratory, Air Defense or Crafting Station art for a starter village.
  const lacking = (path: string) =>
    /\/assets\/buildings\/(blacksmith|laboratory|airdefense-v2)\.|\/assets\/crafted\/|crafting-station/.test(
      path,
    );
  expect(requested.filter(lacking)).toEqual([]);
  const ids = await page.evaluate(async () => {
    const { model: m, scene } = window.__game;
    const { makeBuilding } = await import('/src/game/model.ts');
    const spot = (size: number) => {
      for (let y = 4; y < 40; y++)
        for (let x = 4; x < 40; x++) if (m.canPlace('craftingstation', x, y)) return { x, y, size };
      throw new Error('No room');
    };
    const smith = makeBuilding(m.state.nextId++, 'blacksmith', 0, 0, 1);
    Object.assign(smith, spot(3));
    m.state.buildings.push(smith);
    const station = makeBuilding(m.state.nextId++, 'craftingstation', 0, 0, 1);
    Object.assign(station, spot(3));
    station.crafted = 'cake';
    m.state.buildings.push(station);
    m.changed();
    scene.sync();
    return [smith.id, station.id];
  });
  // Drawn blank while loading, never as the missing-texture placeholder, then from its art.
  const keys = () =>
    page.evaluate((ids) => ids.map((id) => window.__game.scene.sprites.get(id)!.texture.key), ids);
  expect((await keys()).every((key) => key !== '__MISSING')).toBe(true);
  await expect.poll(keys).toEqual(['blacksmith', 'crafted-cake']);
  expect(requested.filter(lacking).length).toBe(2);
});

test('campaign scenery and hero portraits load when a battle shows them', async ({ page }) => {
  const requested: string[] = [];
  page.on('request', (r) => requested.push(new URL(r.url()).pathname));
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  // The starter village has no hero and shows no campaign scenery.
  expect(requested.filter((p) => /environment\/campaign\/|hero-redesign-v1\//.test(p))).toEqual([]);
  const count = await page.evaluate(() => {
    const m = window.__game.model;
    m.state.army.swordsman = Math.max(1, m.state.army.swordsman);
    m.startBattle(0, false, 'goblin-v1');
    return m.battle!.scenery?.length ?? 0;
  });
  expect(count).toBeGreaterThan(0);
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.__game.scene.campaignScenery.every(
          (im) => im.visible && im.texture.key.startsWith('campaign-'),
        ),
      ),
    )
    .toBe(true);
});
