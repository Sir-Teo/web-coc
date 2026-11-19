import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test('the first Town Hall upgrade unlocks the Laboratory, and Barracks completion unlocks Giants', async ({
  page,
}, info) => {
  test.setTimeout(150000);
  await page.clock.setFixedTime(Date.now());
  const boot = () => expect(page.locator('#loading')).toBeHidden({ timeout: 30000 });
  const reload = async () => {
    await page.reload();
    await boot();
  };
  const advanceOffline = async (end: number) => {
    await page.goto('about:blank');
    await page.clock.setFixedTime(end + 1);
    await page.goto('/?lazyart');
    await boot();
  };
  const state = () =>
    page.evaluate(() => {
      const { model } = window.__game;
      const { gold, elixir, xp, gems, starter, buildings } = model.state;
      const building = (kind: string) => {
        const b = buildings.find((b) => b.kind === kind);
        return b && { id: b.id, level: b.level, start: b.upgradeStart, end: b.upgradeEnd };
      };
      return {
        gold,
        elixir,
        xp,
        gems,
        starter,
        busy: model.busy,
        hall: building('townhall')!,
        barracks: building('barracks')!,
        lab: building('laboratory'),
        giant: model.state.army.giant,
      };
    });
  const select = async (id: number) => {
    await page.keyboard.press('b');
    await page.locator(`[data-action="select-building:${id}"]`).tap();
  };
  const closeBuilding = () => page.getByRole('button', { name: 'Close building' }).tap();
  const upgrade = (id: number) => page.locator(`[data-action="upgrade:${id}"]`);
  const lab = page.locator('[data-action="build:laboratory"]');
  const giant = page.locator('[data-action="train:giant"]');
  const shop = async () => {
    await page.locator('.shop-btn').tap();
    await page.locator('[data-action="tab:Army"]').tap();
  };
  const closeDrawer = () => page.locator('[data-action="close-drawer"]').tap();

  await page.goto('/?lazyart');
  await boot();
  await page.locator('[data-action="skip-tutorial"]').tap();
  await page.locator('.collect-btn').tap();
  await shop();
  await expect(lab).toBeDisabled();
  await closeDrawer();
  const before = await state();
  await select(before.barracks.id);
  // The pinned Barracks level 3 row already permits this upgrade at Town Hall 2.
  await expect(upgrade(before.barracks.id)).toBeEnabled();
  await expect(upgrade(before.barracks.id)).toContainText('2,500');
  await closeBuilding();
  await select(before.hall.id);
  await expect(upgrade(before.hall.id)).toContainText('4,000');
  await upgrade(before.hall.id).tap();
  const pending = await state();
  expect(pending).toMatchObject({
    gold: before.gold - 4000,
    elixir: before.elixir,
    xp: before.xp,
    busy: 1,
  });
  expect(pending.hall.end! - pending.hall.start!).toBe(1800000);
  await reload();
  expect(await state()).toEqual(pending);
  await advanceOffline(pending.hall.end!);
  const builtHall = await state();
  expect(builtHall).toEqual({
    ...pending,
    hall: { id: pending.hall.id, level: 3 },
    busy: 0,
    xp: pending.xp + 42,
  });
  await reload();
  expect(await state()).toEqual(builtHall);

  // Funds from later collection, seeded once to keep the fixture bounded.
  await page.evaluate(() => {
    window.__game.model.state.elixir = 7500;
    window.__game.model.changed();
  });
  await shop();
  await expect(lab).toBeEnabled();
  await expect(lab).toContainText('5,000');
  await lab.tap();
  const spot = await page.evaluate(() => {
    const { model, scene, game } = window.__game;
    for (let x = 2; x < 44; x++)
      for (let y = 2; y < 44; y++) {
        if (!model.canPlace('laboratory', x, y)) continue;
        const p = scene.screenFor(x + 0.5, y + 0.5);
        if (
          p.y > innerHeight * 0.25 &&
          p.y < innerHeight * 0.65 &&
          document.elementFromPoint(p.x, p.y) === game.canvas
        )
          return p;
      }
    throw Error('No Laboratory placement point');
  });
  await page.touchscreen.tap(spot.x, spot.y);
  await expect.poll(async () => (await state()).elixir).toBe(2500);
  const pendingLab = (await state()).lab!;
  expect(pendingLab.end! - pendingLab.start!).toBe(60000);
  await closeBuilding();
  await select(before.barracks.id);
  await upgrade(before.barracks.id).tap();
  const pendingArmy = await state();
  expect(pendingArmy).toMatchObject({ elixir: 0, busy: 2, xp: builtHall.xp });
  expect(pendingArmy.barracks.end! - pendingArmy.barracks.start!).toBe(120000);
  await closeBuilding();
  await page.getByRole('button', { name: 'Train troops' }).tap();
  await expect(giant).toBeDisabled();
  await expect(giant).toContainText('Barracks 3');
  await advanceOffline(pendingArmy.barracks.end!);
  const completed = await state();
  expect(completed).toEqual({
    ...pendingArmy,
    busy: 0,
    xp: pendingArmy.xp + 17,
    lab: { id: pendingLab.id, level: 1 },
    barracks: { id: before.barracks.id, level: 3 },
  });
  await reload();
  expect(await state()).toEqual(completed);
  await page.getByRole('button', { name: 'Train troops' }).tap();
  await expect(giant).toBeEnabled();
  await giant.tap();
  await expect(giant).toBeDisabled();
  await expect(giant).toHaveText('2 more spaces');
  expect(await state()).toEqual({ ...completed, giant: 1 });
  await page.screenshot({ path: info.outputPath('first-town-hall-army.png') });
  await reload();
  expect(await state()).toEqual({ ...completed, giant: 1 });
  await page.locator('.attack-btn').tap();
  await page.locator('[data-action="attack:0"]').tap();
  await page.waitForFunction(() => !window.__game.scene.battleArtPending());
  const card = page.locator('[data-action="troop:giant"]');
  await expect(card.locator('.troop-count')).toHaveText('x1');
  await card.tap();
  const landing = await page.evaluate(() => {
    const { model, scene, game } = window.__game;
    for (let x = 1.5; x < 44; x++)
      for (let y = 1.5; y < 44; y++) {
        if (model.deployBlocked(x, y)) continue;
        const p = scene.screenFor(x, y);
        if (
          p.y > innerHeight * 0.3 &&
          p.y < innerHeight * 0.65 &&
          document.elementFromPoint(p.x, p.y) === game.canvas
        )
          return p;
      }
    throw Error('No visible Giant deployment point');
  });
  await page.touchscreen.tap(landing.x, landing.y);
  await expect(card.locator('.troop-count')).toHaveText('x0');
  // The pinned Giant row prefers Defense. Payback has one weapon, the Cannon.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const battle = window.__game.model.battle!;
        const giant = battle.units.find((unit) => unit.kind === 'giant');
        return battle.buildings.find((b) => b.id === giant?.target)?.kind;
      }),
    )
    .toBe('cannon');
  await page.locator('[data-action="surrender"]').tap();
  await page.locator('[data-action="end"]').tap();
  await page.locator('.result-modal [data-action="home"]').tap();
  await reload();
  expect((await state()).giant).toBe(0);
  await page.locator('[data-action="battle-log"]').tap();
  await page.getByRole('button', { name: 'Watch replay' }).tap();
  await expect(page.getByRole('slider', { name: 'Replay position' })).toBeVisible();
  await page.getByRole('button', { name: 'First deployment' }).tap();
  await expect
    .poll(() =>
      page.evaluate(() => window.__game.model.battle!.units.some((unit) => unit.kind === 'giant')),
    )
    .toBe(true);
});
