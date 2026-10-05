import { test, expect, type Page } from '@playwright/test';

const drawn = (page: Page, kind: string) =>
  page.evaluate((kind) => {
    const { model, scene } = window.__game;
    const b = model.state.buildings.find((v) => v.kind === kind)!;
    return scene.children.list.filter(
      (o: { getData?: (k: string) => unknown }) => o.getData?.('nativeVillage') === b.id,
    ).length;
  }, kind);

test('a starter village draws its buildings from per-level packs', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (r) => requests.push(new URL(r.url()).pathname));
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  await page.locator('#loading').waitFor({ state: 'detached' });
  // Level 2 Town Hall: its own pack and cropped atlas, not the 3002×3066 family atlas.
  expect(requests).toContain('/assets/village-levels/townhall/2.json');
  expect(requests).toContain('/assets/village-levels/townhall/2-buildings-0.png');
  expect(requests).not.toContain('/assets/village-native/townhall/graph.json');
  expect(requests.some((r) => r.startsWith('/assets/village-native/townhall/buildings/'))).toBe(
    false,
  );
  for (const kind of ['townhall', 'builder', 'goldstorage', 'barracks'])
    await expect.poll(() => drawn(page, kind)).toBeGreaterThan(0);
  // Starting an upgrade needs the family's upgrade animation; the hall stays drawn meanwhile.
  await page.evaluate(() => {
    const m = window.__game.model;
    m.state.gold = m.state.elixir = 5_000_000;
    const th = m.state.buildings.find((b) => b.kind === 'townhall')!;
    m.upgrade(th.id);
    m.changed();
  });
  expect(await drawn(page, 'townhall')).toBeGreaterThan(0);
  await expect
    .poll(() => requests.includes('/assets/village-native/townhall/graph.json'))
    .toBe(true);
  await expect.poll(() => drawn(page, 'townhall')).toBeGreaterThan(0);
  await page.screenshot({ path: 'output/playtest/village-level-packs.png' });
});
