import { test, expect } from '@playwright/test';

test.use({ hasTouch: true });

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.ready);
  await page.locator('#loading').waitFor({ state: 'detached' });
  await page.locator('[data-action="skip-tutorial"]').click();
});

test('shop gates both defenses and loads every direction and mine state', async ({ page }) => {
  await page.locator('.shop-btn').click();
  await page.locator('[data-action="tab:Defenses"]').click();
  await expect(page.locator('[data-action="build:airsweeper"]')).toBeDisabled();
  await expect(page.locator('.shop-tile').filter({ hasText: 'Air Sweeper' })).toContainText(
    'Town Hall 6',
  );
  await page.locator('[data-action="tab:Traps"]').click();
  await expect(page.locator('[data-action="build:seekingairmine"]')).toBeDisabled();
  await expect(page.locator('.shop-tile').filter({ hasText: 'Seeking Air Mine' })).toContainText(
    'Town Hall 7',
  );
  const ready = await page.evaluate(() => {
    const textures = window.__game.scene.textures;
    return (
      Array.from({ length: 56 }, (_, i) =>
        textures.exists(`airsweeper-${Math.floor(i / 8) + 1}-${i % 8}`),
      ).every(Boolean) &&
      ['seekingairmine', ...[1, 3, 5, 7].map((level) => `seeking-mine-setup-${level}`)].every((k) =>
        textures.exists(k),
      )
    );
  });
  expect(ready).toBe(true);
});

for (const width of [390, 320])
  test(`mine Info shows source level two and the TH9 gate at ${width}px`, async ({
    page,
    browserName,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.evaluate(async () => {
      const { makeBuilding } = await import('/src/game/model.ts');
      const { model: m, scene } = window.__game;
      m.townhall.level = 8;
      m.state.obstacles = [];
      m.state.buildings.push(makeBuilding(m.state.nextId++, 'seekingairmine', 6, 10));
      m.selected = m.state.buildings.at(-1).id;
      m.changed();
      scene.sync();
    });
    await page.locator('[data-action="info"]').click();
    await expect(page.locator('.info-hero')).toContainText('LEVEL 1 OF 8');
    await expect(page.locator('.info-table')).toContainText('Level 2');
    for (const value of ['1,500', '1,800', '3.5 tiles/s'])
      await expect(page.locator('.info-table')).toContainText(value);
    await expect(page.locator('.info-upgrade')).toContainText('Requires Town Hall 9');
    expect(await page.locator('.info-upgrade button').count()).toBe(0);
    const bounds = await page.locator('.info-table').boundingBox();
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    await page.screenshot({
      path: `output/playtest/seeking-mine-th9-gate-${width}-${browserName}.png`,
      animations: 'disabled',
    });
  });

for (const width of [1440, 390, 320])
  test(`rotate, inspect and restore Sweeper at ${width}px`, async ({ page, browserName }) => {
    await page.setViewportSize({ width, height: width === 1440 ? 960 : 844 });
    await page.evaluate(async () => {
      const { makeBuilding } = await import('/src/game/model.ts');
      const { model: m, scene } = window.__game;
      m.state.obstacles = [];
      const b = makeBuilding(3, 'airsweeper', 10, 8, 2);
      m.state.buildings = [
        makeBuilding(1, 'townhall', 15, 15, 8),
        makeBuilding(2, 'builder', 25, 25),
        b,
      ];
      m.state.nextId = 4;
      m.selected = b.id;
      m.changed();
      scene.sync();
      scene.cameras.main.centerOn(896 + 2 * 32, 112 + 20 * 16);
    });
    const rotate = page.getByRole('button', { name: 'Rotate Air Sweeper 45 degrees' });
    await expect(rotate).toBeVisible();
    await rotate.tap();
    await page.keyboard.press('r');
    expect(
      await page.evaluate(
        () => window.__game.model.state.buildings.find((b) => b.kind === 'airsweeper').direction,
      ),
    ).toBe(2);
    await page.evaluate(() => {
      const m = window.__game.model;
      m.saveLayout(0);
      m.rotateSweeper();
      m.loadLayout(0);
    });
    expect(
      await page.evaluate(
        () => window.__game.model.state.buildings.find((b) => b.kind === 'airsweeper').direction,
      ),
    ).toBe(2);
    await page.screenshot({
      path: `output/playtest/air-control-rotation-${width}-${browserName}.png`,
    });
    const box = await rotate.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    await page.locator('[data-action="info"]').click();
    await expect(page.locator('.info-table')).toContainText('Push strength');
    await expect(page.locator('.info-table')).toContainText('2.0 tiles');
    await expect(page.locator('.info-table')).not.toContainText('Damage per second');
    await page.screenshot({ path: `output/playtest/air-control-info-${width}-${browserName}.png` });
    await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
    await page.waitForTimeout(800);
    await page.reload();
    await page.waitForFunction(() => window.__game?.scene.ready);
    expect(
      await page.evaluate(
        () => window.__game.model.state.buildings.find((b) => b.kind === 'airsweeper').direction,
      ),
    ).toBe(2);
  });

test('mine flight and wind render, then replay seeking reconstructs their states', async ({
  page,
  browserName,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.evaluate(async () => {
    const { makeBuilding } = await import('/src/game/model.ts');
    const { model: m, scene } = window.__game;
    m.state.obstacles = [];
    m.state.buildings = [
      makeBuilding(1, 'townhall', 15, 15),
      makeBuilding(2, 'builder', 25, 25),
      { ...makeBuilding(3, 'airsweeper', 6, 10, 4), direction: 4 },
      makeBuilding(4, 'seekingairmine', 4, 10),
    ];
    m.state.nextId = 5;
    m.state.army.dragon = 3;
    m.startBattle(0, true);
    m.activeTroop = 'dragon';
    m.deploy(1, 11);
    scene.scene.pause();
    for (let i = 0; i < 15; i++) m.step(0.05);
    m.changed();
    scene.sync();
    scene.drawOverlay();
    scene.cameras.main.centerOn(896 - 6 * 32, 112 + 16 * 16);
  });
  await page.screenshot({ path: `output/playtest/air-control-flight-${browserName}.png` });
  expect(await page.evaluate(() => window.__game.model.battle.traps[4].resolved)).toBe(false);
  expect(await page.evaluate(() => window.__game.model.battle.gusts.length)).toBe(1);
  await page.evaluate(() => {
    const { model: m, scene } = window.__game;
    for (let i = 0; i < 300; i++) m.step(0.05);
    m.finishBattle();
    m.returnHome();
    m.startReplay(m.state.raidLog[0].id);
    m.seekReplay(0.75);
    for (let i = 0; i < 30 && m.replay.seeking; i++) m.step(0.05);
    scene.sync();
    scene.drawOverlay();
  });
  await page.screenshot({ path: `output/playtest/air-control-replay-${browserName}.png` });
  expect(await page.evaluate(() => window.__game.model.battle.traps[4].resolved)).toBe(false);
  expect(errors).toEqual([]);
});

test('touch placement builds a Sweeper and instantly arms a Seeking Air Mine', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(async () => {
    const { makeBuilding } = await import('/src/game/model.ts');
    const { model: m, scene } = window.__game;
    m.state.obstacles = [];
    m.state.buildings = [
      makeBuilding(1, 'townhall', 20, 20, 6),
      makeBuilding(2, 'builder', 26, 26),
    ];
    m.state.nextId = 3;
    m.state.gold = 500000;
    m.changed();
    scene.sync();
    scene.cameras.main.centerOn(960, 432);
  });
  await page.locator('.shop-btn').tap();
  await page.locator('[data-action="tab:Defenses"]').tap();
  await page.locator('[data-action="build:airsweeper"]').tap();
  await expect(page.locator('.drawer-sheet')).toBeHidden();
  let point = await page.evaluate(() => window.__game.scene.screenFor(11, 9));
  await page.touchscreen.tap(point.x, point.y);
  expect(
    await page.evaluate(() => {
      const m = window.__game.model,
        b = m.state.buildings.find((v) => v.kind === 'airsweeper');
      return [b.constructing, (b.upgradeEnd - b.upgradeStart) / 1000, m.busy];
    }),
  ).toEqual([true, 14400, 1]);
  await page.evaluate(() => {
    const m = window.__game.model,
      b = m.state.buildings.find((v) => v.kind === 'airsweeper');
    m.tick(b.upgradeEnd + 1);
    m.selected = b.id;
    m.changed();
  });
  await page.getByRole('button', { name: 'Rotate Air Sweeper 45 degrees' }).tap();
  expect(
    await page.evaluate(
      () => window.__game.model.state.buildings.find((b) => b.kind === 'airsweeper').direction,
    ),
  ).toBe(1);
  await page.evaluate(() => {
    const m = window.__game.model;
    m.townhall.level = 7;
    m.cancel();
    m.changed();
  });
  await page.locator('.shop-btn').tap();
  await page.locator('[data-action="tab:Traps"]').tap();
  await page.locator('[data-action="build:seekingairmine"]').tap();
  await expect(page.locator('.drawer-sheet')).toBeHidden();
  point = await page.evaluate(() => window.__game.scene.screenFor(14.5, 8.5));
  await page.touchscreen.tap(point.x, point.y);
  const result = await page.evaluate(() => {
    const m = window.__game.model,
      b = m.state.buildings.find((v) => v.kind === 'seekingairmine');
    m.selected = b.id;
    m.changed();
    return [!!b.upgradeEnd, m.busy, m.countOf('seekingairmine')];
  });
  expect(result).toEqual([false, 0, 1]);
  await page.locator('[data-action="info"]').tap();
  await expect(page.locator('.info-table')).toContainText('Single target');
  await expect(page.locator('.info-table')).toContainText('3.5 tiles/s');
  await expect(page.locator('.info-table')).not.toContainText('Blast radius');
});
