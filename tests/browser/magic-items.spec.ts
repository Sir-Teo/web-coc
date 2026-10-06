import { test, expect } from '@playwright/test';

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
