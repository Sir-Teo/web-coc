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
  await page.screenshot({ path: info.outputPath('mine-context.png'), animations: 'disabled' });
  await collect.tap();
  const afterTap = { gold: 12, elixir: 0, stored: [0, 8, 18] };
  expect(await balances()).toEqual(afterTap);

  await page.reload();
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  expect(await balances()).toEqual(afterTap);
  await page.locator('.collect-btn').tap();
  expect(await balances()).toEqual({ gold: 20, elixir: 18, stored: [0, 0, 0] });
});
