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
