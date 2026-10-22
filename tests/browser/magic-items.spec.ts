import { test, expect } from '@playwright/test';
import { useDevelopedVillage } from './developed-village';

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
});

test('the Town Hall keeps magic items to use or sell at phone size', async ({ page }) => {
  await page.evaluate(() => {
    const m = window.__game.model;
    m.state.elixir = 100;
    m.state.gems = 0;
    m.addMagicItem('rune-of-elixir');
    m.addMagicItem('wall-ring', 3);
    m.addMagicItem('builder-potion');
    m.selected = m.state.buildings.find((b) => b.kind === 'townhall')!.id;
    m.changed();
  });
  await page.locator('.building-context [data-action="magic-items"]').click();
  const panel = page.locator('.magic-items-body');
  await expect(panel.locator('[data-item="rune-of-elixir"] h3')).toContainText('1/1');
  await expect(panel.locator('[data-item="wall-ring"] h3')).toContainText('3/25');
  // Held items come first, each with the client's own icon.
  await expect(panel.locator('.magic-item').first()).not.toHaveClass(/empty/);
  await expect
    .poll(() =>
      panel
        .locator('[data-item="wall-ring"] img')
        .evaluate((im: HTMLImageElement) => im.complete && im.naturalWidth > 0),
    )
    .toBe(true);
  await panel.locator('[data-action="item-rune:rune-of-elixir"]').click();
  const cap = await page.evaluate(() => window.__game.model.resourceCap('elixir'));
  expect(await page.evaluate(() => window.__game.model.state.elixir)).toBe(cap);
  await panel.locator('[data-action="item-sell:wall-ring"]').click();
  expect(
    await page.evaluate(() => [
      window.__game.model.magicItemCount('wall-ring'),
      window.__game.model.state.gems,
    ]),
  ).toEqual([2, 5]);
  const potion = panel.locator('[data-action="item-potion:builder-potion"]');
  await expect(potion).toBeInViewport();
  const box = (await potion.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(44);
  await potion.click();
  await expect(panel.locator('[data-item="builder-potion"]')).toContainText('1h left');
});

test('a building card finishes with a Book and upgrades with a Hammer', async ({ page }) => {
  const id = await page.evaluate(() => {
    const m = window.__game.model;
    m.state.gold = m.state.elixir = 1_000_000;
    const mine = m.state.buildings.find((b) => b.kind === 'goldmine')!;
    m.upgrade(mine.id);
    m.addMagicItem('book-of-building');
    m.selected = mine.id;
    m.changed();
    return mine.id;
  });
  const before = await page.evaluate(
    (id) => window.__game.model.state.buildings.find((b) => b.id === id)!.level,
    id,
  );
  await page.locator(`[data-action="book-building:${id}"]`).click();
  const after = await page.evaluate((id) => {
    const b = window.__game.model.state.buildings.find((b) => b.id === id)!;
    return { level: b.level, upgrading: b.upgradeEnd !== undefined };
  }, id);
  expect(after).toEqual({ level: before + 1, upgrading: false });
  const gold = await page.evaluate(() => {
    const m = window.__game.model;
    m.addMagicItem('hammer-of-building');
    m.changed();
    return m.state.gold;
  });
  await page.locator(`[data-action="hammer-building:${id}"]`).click();
  expect(
    await page.evaluate((id) => {
      const m = window.__game.model;
      const b = m.state.buildings.find((b) => b.id === id)!;
      return [b.level, m.state.gold, m.magicItemCount('hammer-of-building')];
    }, id),
  ).toEqual([before + 2, gold, 0]);
});

test('a Shovel makes an obstacle movable, and a tap moves it', async ({ page }) => {
  const id = await page.evaluate(() => {
    const m = window.__game.model;
    m.addMagicItem('shovel-of-obstacles');
    const o = m.obstacles[0];
    m.selected = -o.id;
    m.changed();
    return o.id;
  });
  await page.locator(`[data-action="obstacle-shovel:${id}"]`).click();
  await page.locator(`[data-action="obstacle-move:${id}"]`).click();
  await expect(page.locator('.placement-banner')).toContainText('Move');
  const target = await page.evaluate(async (id) => {
    const { model: m, scene } = window.__game;
    let spot: { x: number; y: number } | undefined;
    for (let y = 30; y < 40 && !spot; y++)
      for (let x = 14; x < 24 && !spot; x++) if (m.canPlaceObstacle(id, x, y)) spot = { x, y };
    scene.cameras.main.centerOn(896 + (spot!.x - spot!.y) * 32, 112 + (spot!.x + spot!.y) * 16);
    scene.clampCamera();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return { spot: spot!, screen: scene.screenFor(spot!.x + 0.5, spot!.y + 0.5) };
  }, id);
  await page.mouse.click(target.screen.x, target.screen.y);
  expect(
    await page.evaluate((id) => {
      const o = window.__game.model.obstacles.find((v) => v.id === id)!;
      return { x: o.x, y: o.y, movable: o.movable };
    }, id),
  ).toEqual({ ...target.spot, movable: true });
  await expect(page.locator(`[data-action="obstacle-move:${id}"]`)).toBeVisible();
});

test('the Trader’s Weekly Deals open from the items and give the free Glowy Ore', async ({
  page,
}) => {
  await page.evaluate(() => {
    const m = window.__game.model;
    m.state.buildings.find((b) => b.kind === 'townhall')!.level = 8;
    m.selected = m.state.buildings.find((b) => b.kind === 'townhall')!.id;
    m.changed();
  });
  await page.locator('.building-context [data-action="magic-items"]').click();
  await page.locator('[data-action="trader"]').click();
  await expect(page.locator('#modal-title')).toHaveText('Weekly Deals');
  await expect(page.locator('.modal-header p')).toContainText('New deals in');
  const deals = page.locator('.trader-deal');
  await expect(deals).toHaveCount(7);
  const free = page.locator('[data-action="trader-buy:free-glowy-ore"]');
  await expect(free).toHaveText('Free');
  await expect(free).toBeInViewport();
  const glowy = await page.evaluate(() => window.__game.model.ores.glowy);
  await free.click();
  expect(await page.evaluate(() => window.__game.model.ores.glowy)).toBe(glowy + 10);
  await expect(page.locator('[data-deal="free-glowy-ore"]')).toContainText('Out of stock');
});

test('a Super Potion boosts the army card without dark elixir and survives reload', async ({
  page,
  browserName,
}) => {
  await useDevelopedVillage(page);
  await page.evaluate(async () => {
    const { superMinimum } = await import('/src/game/special-troops.ts');
    const { TROOP_KEYS } = await import('/src/game/data.ts');
    const m = window.__game.model;
    m.townhall!.level = 11;
    m.state.buildings.find((b) => b.kind === 'laboratory')!.level = m.maxLevel('laboratory');
    m.state.troopLevels = Object.fromEntries(
      TROOP_KEYS.map((kind) => [
        kind,
        kind === 'swordsman' ? superMinimum('superbarbarian') : m.troopLevel(kind),
      ]),
    );
    m.state.dark = 0;
    m.clearArmy();
    m.addMagicItem('super-potion', 1);
    m.changed();
  });
  await page.locator('.train-add').click();
  await page.locator('#army-search').fill('Super Barbarian');
  const tile = page
    .locator('.army-tile')
    .filter({ has: page.locator('[data-action="troop-info:superbarbarian"]') });
  const potion = tile.locator('[data-action="super-potion:superbarbarian"]');
  await expect(potion).toBeEnabled();
  await potion.click();
  await expect(tile.locator('.boost-left')).toContainText('Boosted');
  await expect(potion).toHaveCount(0);
  expect(
    await page.evaluate(() => ({
      dark: window.__game.model.state.dark,
      items: window.__game.model.magicItemCount('super-potion'),
    })),
  ).toEqual({ dark: 0, items: 0 });
  await tile.locator('[data-action="train:superbarbarian"]').click();
  await expect(tile.locator('[data-army-count="troop:superbarbarian"]')).toHaveText('1');
  await expect
    .poll(() =>
      tile
        .locator('.shop-tile-art img')
        .evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0),
    )
    .toBe(true);
  await tile.screenshot({ path: `output/playtest/super-potion-card-${browserName}.png` });
  await page.reload();
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  expect(
    await page.evaluate(() => {
      const m = window.__game.model;
      return {
        dark: m.state.dark,
        items: m.magicItemCount('super-potion'),
        army: m.state.army.superbarbarian,
        boosted: (m.state.superBoosts?.superbarbarian ?? 0) > m.clock,
      };
    }),
  ).toEqual({ dark: 0, items: 0, army: 1, boosted: true });
});
