import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test('the building card collects only from the selected mine', async ({ page }, info) => {
  await page.clock.setFixedTime(Date.now());
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').tap();
  const ids = await page.evaluate(async () => {
    const { makeBuilding } = await import('/src/game/model.ts');
    const m = window.__game.model;
    for (const building of m.state.buildings) building.stored = 0;
    m.state.gold = m.state.elixir = 0;
    const mine = makeBuilding(m.state.nextId++, 'goldmine', 24, 14);
    const otherMine = makeBuilding(m.state.nextId++, 'goldmine', 28, 14);
    const collector = makeBuilding(m.state.nextId++, 'collector', 32, 14);
    mine.stored = 12;
    otherMine.stored = 8;
    collector.stored = 18;
    m.state.buildings.push(mine, otherMine, collector);
    m.selected = mine.id;
    m.changed();
    return [mine.id, otherMine.id, collector.id];
  });
  const balances = () =>
    page.evaluate((ids) => {
      const { state } = window.__game.model;
      return {
        gold: state.gold,
        elixir: state.elixir,
        stored: ids.map((id) => state.buildings.find((building) => building.id === id)!.stored),
      };
    }, ids);
  const collect = page
    .locator('.building-context')
    .getByRole('button', { name: 'Collect', exact: true });
  await expect(collect).toBeVisible();
  await expect(collect.locator('.resource-icon')).toHaveClass(/coin/);
  await expect(page.locator('.building-context .context-art')).toHaveAttribute(
    'src', '/assets/catalog-native/gold-mine/level-1.png',
  );
  await page.screenshot({ path: info.outputPath('mine-context.png'), animations: 'disabled' });
  await collect.tap();
  const afterTap = { gold: 12, elixir: 0, stored: [0, 8, 18] };
  expect(await balances()).toEqual(afterTap);

  await page.reload();
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  expect(await balances()).toEqual(afterTap);
  await page.locator('.collect-btn').tap();
  expect(await balances()).toEqual({ gold: 20, elixir: 18, stored: [0, 0, 0] });
  await page.keyboard.press('b');
  await page.locator(`[data-action="select-building:${ids[2]}"]`).tap();
  const context = page.locator('.building-context');
  const collectorArt = '/assets/catalog-native/elixir-collector/level-1.png';
  await expect(context.locator('.context-art')).toHaveAttribute('src', collectorArt);
  await expect(context.getByRole('button', { name: 'Collect', exact: true }).locator('.resource-icon')).toHaveClass(/elixir/);
  await context.locator('[data-action="info"]').tap();
  await expect(page.locator('.info-hero img')).toHaveAttribute('src', collectorArt);

});

test('full Gold Storage leaves legacy mine overflow available after an upgrade', async ({
  page,
}, info) => {
  await page.clock.setFixedTime(Date.now());
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').tap();
  const fixture = await page.evaluate(async () => {
    const { collectorProduction } = await import('/src/game/collector-production.ts');
    const m = window.__game.model;
    m.townhall!.level = 5;
    const mine = m.state.buildings.find((b) => b.kind === 'goldmine')!;
    const storage = m.state.buildings.find((b) => b.kind === 'goldstorage')!;
    mine.level = storage.level = 1;
    const overflow = collectorProduction('goldmine', 1).capacity + 500;
    const cap = m.resourceCap('gold');
    mine.stored = overflow;
    m.state.gold = cap - 7;
    m.state.elixir = m.upgradeCost(storage);
    m.addMagicItem('book-of-building');
    m.selected = mine.id;
    m.changed();
    return {
      mine: mine.id,
      storage: storage.id,
      overflow,
      cap,
      collected: m.state.stats.collected,
    };
  });
  const read = () =>
    page.evaluate(({ mine, storage }) => {
      const m = window.__game.model;
      return {
        gold: m.state.gold,
        cap: m.resourceCap('gold'),
        stored: m.state.buildings.find((b) => b.id === mine)!.stored,
        level: m.state.buildings.find((b) => b.id === storage)!.level,
        collected: m.state.stats.collected,
      };
    }, fixture);
  const collect = page.locator(`[data-action="collect-building:${fixture.mine}"]`);
  await collect.tap();
  const full = {
    gold: fixture.cap,
    cap: fixture.cap,
    stored: fixture.overflow - 7,
    level: 1,
    collected: fixture.collected + 7,
  };
  expect(await read()).toEqual(full);
  await collect.tap();
  expect(await read()).toEqual(full);
  await page.screenshot({ path: info.outputPath('full-gold-storage.png'), animations: 'disabled' });

  await page.reload();
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  expect(await read()).toEqual(full);
  await page.locator('.status-chips [data-action="builders"]').tap();
  await page.locator('[data-action="builder-option:goldstorage,1"]').tap();
  await page.locator(`[data-action="upgrade:${fixture.storage}"]`).tap();
  expect(await read()).toEqual(full);
  await page.locator(`[data-action="book-building:${fixture.storage}"]`).tap();
  const upgraded = await read();
  expect(upgraded).toEqual({ ...full, level: 2, cap: expect.any(Number) });
  expect(upgraded.cap - full.cap).toBeGreaterThanOrEqual(full.stored);

  await page.evaluate((id) => {
    const m = window.__game.model;
    m.selected = id;
    m.changed();
  }, fixture.mine);
  await collect.tap();
  const drained = {
    ...upgraded,
    gold: full.gold + full.stored,
    stored: 0,
    collected: fixture.collected + fixture.overflow,
  };
  expect(await read()).toEqual(drained);
  await collect.tap();
  await page.reload();
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  expect(await read()).toEqual(drained);
});
