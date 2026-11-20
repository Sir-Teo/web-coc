import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
});

test('a touch interrupted by the Builder menu cannot select a building after close', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'Native touch injection requires CDP.');
  await page.setViewportSize({ width: 390, height: 650 });
  const { id, x, y } = await page.evaluate(() => {
    const { model, scene, game } = window.__game;
    for (const building of model.buildings) {
      const point = scene.screenFor(building.x + 0.5, building.y + 0.5);
      if (
        point.y > 170 &&
        point.y < 415 &&
        document.elementFromPoint(point.x, point.y) === game.canvas
      )
        return { id: building.id, x: point.x, y: point.y };
    }
    throw Error('No visible building on the canvas');
  });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ id: 1, x, y }],
  });
  await page.getByRole('button', { name: /^Builders:/ }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.builder-menu')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.builder-menu')).toHaveCount(0);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  // Wait for the scene to process the release before checking selection.
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  expect(await page.evaluate(() => window.__game.model.selected)).toBeNull();
  await page.touchscreen.tap(x, y);
  await expect.poll(() => page.evaluate(() => window.__game.model.selected)).toBe(id);
});

test('the builder counter opens the builder menu, whose suggestions show each building in turn', async ({
  page,
  browserName,
}) => {
  const village = await page.evaluate(() => {
    const m = window.__game.model;
    m.townhall!.level = 5;
    m.state.gold = m.state.elixir = 1_000_000;
    const cannons = m.state.buildings.filter((b) => b.kind === 'cannon');
    for (const b of cannons) b.level = 2;
    // One builder at work on the Gold Storage.
    const storage = m.state.buildings.find((b) => b.kind === 'goldstorage')!;
    m.upgrade(storage.id);
    m.changed();
    return { storage: storage.id, cannons: cannons.map((b) => b.id) };
  });
  await page.locator('.status-chips [data-action="builders"]').tap();
  await expect(page.locator('#modal-title')).toHaveText('Builders');
  const menu = page.locator('.builder-menu');
  await expect(menu.locator('h3')).toHaveText([
    'Upgrades in progress:',
    'Suggested upgrades:',
    'Other upgrades:',
  ]);
  await expect(menu.locator('.working')).toContainText('Gold Storage');
  // Measured in one pass: the window redraws each second for its countdowns.
  const heights = await menu
    .locator('.builder-option')
    .evaluateAll((rows) => rows.map((row) => row.getBoundingClientRect().height));
  expect(heights.length).toBeGreaterThan(0);
  expect(Math.min(...heights)).toBeGreaterThanOrEqual(44);
  await page.screenshot({ path: `output/playtest/builder-menu-390-${browserName}.png` });
  // The Cannons share one row; each tap shows the next of them.
  const cannons = menu.locator('[data-action="builder-option:cannon,2"]');
  await expect(cannons).toContainText(`×${village.cannons.length}`);
  await expect(menu.locator('[data-action^="builder-option:wall,"]')).toHaveCount(0);
  const seen: number[] = [];
  for (let i = 0; i < 2; i++) {
    if (i) await page.locator('.status-chips [data-action="builders"]').tap();
    await page.locator('[data-action="builder-option:cannon,2"]').tap();
    await expect(page.locator('#modal-title')).toHaveCount(0);
    seen.push(await page.evaluate(() => window.__game.model.selected!));
  }
  expect(village.cannons).toContain(seen[0]);
  expect(village.cannons).toContain(seen[1]);
  expect(seen[1]).not.toBe(seen[0]);
  // The work in progress opens its building, and More builders opens the Shop.
  await page.locator('.status-chips [data-action="builders"]').tap();
  await menu.locator('.working').first().tap();
  expect(await page.evaluate(() => window.__game.model.selected)).toBe(village.storage);
  await page.locator('.status-chips [data-action="builders"]').tap();
  await page.locator('[data-action="builder-hut"]').tap();
  await expect(page.locator('.drawer-sheet')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test('a Gear Up keeps its own job label through reload and frees the builder for construction', async ({
  page,
}, info) => {
  const before = await page.evaluate(() => {
    const m = window.__game.model;
    m.townhall!.level = 8;
    m.state.gold = 2_000_000;
    const cannon = m.state.buildings.find((b) => b.kind === 'cannon')!;
    cannon.level = 7;
    m.changed();
    return { id: cannon.id, gold: m.state.gold };
  });
  const menu = page.locator('.builder-menu');
  const counter = page.locator('.status-chips [data-action="builders"]');
  await counter.tap();
  await menu.locator('[data-action="builder-option:cannon,7"]').tap();
  await page.locator(`[data-action="gear-up:${before.id}"]`).tap();
  const state = () =>
    page.evaluate((id) => {
      const m = window.__game.model;
      const b = m.state.buildings.find((row) => row.id === id)!;
      return {
        level: b.level,
        upgrading: b.improving,
        geared: !!b.geared,
        end: b.upgradeEnd,
        gold: m.state.gold,
        busy: m.busy,
        xp: m.state.xp,
      };
    }, before.id);
  const pending = await state();
  expect(pending).toMatchObject({
    level: 7,
    upgrading: 'gearup',
    geared: false,
    gold: before.gold - 1_000_000,
    busy: 1,
  });
  expect(pending.end).toBeDefined();
  await page.reload();
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  expect(await state()).toEqual(pending);
  await counter.tap();
  const job = menu.locator('.working');
  await expect(job).toContainText('Cannon');
  await expect(job).toContainText('Gear Up');
  await page.screenshot({ path: info.outputPath('builder-gear-up.png') });
  await job.tap();
  await expect(page.locator(`[data-action="finish:${before.id}"]`)).toBeVisible();

  await page.goto('about:blank');
  await page.clock.setFixedTime(pending.end! + 1);
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  const completed = await state();
  expect(completed).toMatchObject({ level: 7, geared: true, gold: pending.gold, busy: 0 });
  expect(completed.end).toBeUndefined();
  expect(completed.xp).toBeGreaterThan(pending.xp);
  await page.reload();
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  expect(await state()).toEqual(completed);

  await counter.tap();
  await expect(menu.locator('.working')).toHaveCount(0);
  await menu.locator('[data-action="builder-option:mortar,0"]').tap();
  await page.locator('[data-action="build:mortar"]').tap();
  const point = await page.evaluate(() => {
    const { model, scene } = window.__game;
    for (let y = 3; y < 42; y++)
      for (let x = 3; x < 42; x++) {
        if (!model.canPlace('mortar', x, y)) continue;
        const point = scene.screenFor(x + 0.5, y + 0.5);
        if (document.elementFromPoint(point.x, point.y) === scene.game.canvas) return point;
      }
    throw Error('No visible valid construction site');
  });
  await page.touchscreen.tap(point.x, point.y);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const m = window.__game.model;
        return {
          constructing: m.state.buildings.some((b) => b.kind === 'mortar' && b.constructing),
          busy: m.busy,
        };
      }),
    )
    .toEqual({ constructing: true, busy: 1 });
});

test('a shrinking Builder suggestion continues at the next eligible building', async ({
  page,
}, info) => {
  const ids = await page.evaluate(async () => {
    const { makeBuilding } = await import('/src/game/model.ts');
    const m = window.__game.model;
    m.townhall!.level = 6;
    m.state.gold = 100_000;
    m.state.obstacles = [];
    const cannons = m.state.buildings.filter((b) => b.kind === 'cannon');
    for (const cannon of cannons) cannon.level = 2;
    const third = makeBuilding(m.state.nextId++, 'cannon', 32, 32, 2);
    m.state.buildings.push(third);
    m.changed();
    return [...cannons, third].map((cannon) => cannon.id);
  });
  const counter = page.locator('.status-chips [data-action="builders"]');
  const row = page.locator('[data-action="builder-option:cannon,2"]');
  const selected = () => page.evaluate(() => window.__game.model.selected);
  await counter.tap();
  await expect(row).toContainText('×3');
  await row.tap();
  expect(await selected()).toBe(ids[0]);
  await page.locator(`[data-action="upgrade:${ids[0]}"]`).tap();
  await counter.tap();
  await expect(row).toContainText('×2');
  await expect(page.locator('.builder-menu .working')).toContainText('Cannon');
  await page.screenshot({ path: info.outputPath('shrinking-builder-row.png') });
  for (const id of [ids[1], ids[2], ids[1]]) {
    await row.tap();
    expect(await selected()).toBe(id);
    await counter.tap();
  }
  expect(await page.evaluate(() => window.__game.model.busy)).toBe(1);
});

test('a normal offline upgrade frees the sole builder for the next affordable suggestion', async ({
  page,
}) => {
  const fixture = await page.evaluate(() => {
    const m = window.__game.model;
    m.townhall!.level = 5;
    m.state.gold = 100_000;
    m.state.elixir = 100_000;
    const hut = m.state.buildings.find((b) => b.kind === 'builder')!;
    m.state.buildings = m.state.buildings.filter((b) => b.kind !== 'builder' || b.id === hut.id);
    const cannon = m.state.buildings.find((b) => b.kind === 'cannon')!;
    const storage = m.state.buildings.find((b) => b.kind === 'goldstorage')!;
    cannon.level = storage.level = 1;
    m.changed();
    return {
      cannon: cannon.id,
      storage: storage.id,
      initialGold: m.state.gold,
      initialElixir: m.state.elixir,
    };
  });
  const counter = page.locator('.status-chips [data-action="builders"]');
  const upgrade = (id: number) => page.locator(`[data-action="upgrade:${id}"]`);
  const read = () =>
    page.evaluate(({ cannon, storage }) => {
      const m = window.__game.model;
      const a = m.state.buildings.find((b) => b.id === cannon)!;
      const b = m.state.buildings.find((b) => b.id === storage)!;
      return {
        builders: m.builders,
        busy: m.busy,
        gold: m.state.gold,
        elixir: m.state.elixir,
        xp: m.state.xp,
        cannon: a.level,
        cannonEnd: a.upgradeEnd,
        cannonStart: a.upgradeStart,
        storageEnd: b.upgradeEnd,
        storageCost: m.upgradeCost(b),
      };
    }, fixture);
  await counter.tap();
  await page.locator('[data-action="builder-option:cannon,1"]').tap();
  await upgrade(fixture.cannon).tap();
  const active = await read();
  expect(active).toMatchObject({
    builders: 1,
    busy: 1,
    cannon: 1,
    gold: fixture.initialGold - 1000,
    elixir: fixture.initialElixir,
  });
  expect(active.cannonEnd).toBeGreaterThan(active.cannonStart!);
  await page.goto('about:blank');
  await page.clock.setFixedTime(active.cannonEnd! + 1);
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  const complete = await read();
  expect(complete).toEqual({
    ...active,
    busy: 0,
    cannon: 2,
    cannonEnd: undefined,
    cannonStart: undefined,
    xp: active.xp + Math.floor(Math.sqrt((active.cannonEnd! - active.cannonStart!) / 1000)),
  });
  await counter.tap();
  await page.locator('[data-action="builder-option:goldstorage,1"]').tap();
  await upgrade(fixture.storage).tap();
  await page.reload();
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  const next = await read();
  expect(next).toMatchObject({
    busy: 1,
    cannon: 2,
    gold: complete.gold,
    elixir: complete.elixir - complete.storageCost,
    xp: complete.xp,
  });
  expect(next.storageEnd).toBeDefined();
});
