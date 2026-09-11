import { test, expect, type Page } from '@playwright/test';
test.use({ hasTouch: true });

async function selectWall(page: Page) {
  const point = await page.evaluate(async () => {
    const { scene, model } = window.__game;
    const w = model.state.buildings.find((b) => b.kind === 'wall' && b.x === 11 && b.y === 19)!;
    scene.cameras.main.centerOn(896 + (w.x - w.y) * 32, 112 + (w.x + w.y + 1) * 16);
    scene.clampCamera();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return scene.screenFor(w.x + 0.5, w.y + 0.5);
  });
  await page.touchscreen.tap(point.x, point.y);
  await expect(page.locator('.wall-context h2')).toHaveText('Wall');
  await expect
    .poll(() =>
      page
        .locator('.wall-context .context-art')
        .evaluate((im: HTMLImageElement) => im.complete && im.naturalWidth > 0),
    )
    .toBe(true);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.ready);
  await page.locator('[data-action="skip-tutorial"]').click();
  await expect(page.locator('#loading')).toBeHidden();
  await page.evaluate(() => {
    const m = window.__game.model;
    m.townhall!.level = 8;
    m.changed();
  });
});

test('a touched wall selects its connected row, upgrades it instantly and survives reload', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => window.__game.scene.cameras.main.width === 390);
  await selectWall(page);
  await page.locator('[data-action="wall-row"]').tap();
  const before = await page.evaluate(() => {
    const m = window.__game.model,
      ids = m.selectedWalls.map((b) => b.id);
    return { ids, gold: m.state.gold, cost: m.wallUpgradeQuote(ids, 'gold').cost, busy: m.busy };
  });
  expect(before.ids).toHaveLength(5);
  await expect(page.locator('.wall-context h2')).toHaveText('5 Walls');
  await page.screenshot({ path: `output/playtest/wall-row-phone-${test.info().project.name}.png` });
  await page.locator('[data-action="wall-upgrade:gold"]').tap();
  const after = await page.evaluate((ids) => {
    const m = window.__game.model;
    return {
      gold: m.state.gold,
      busy: m.busy,
      walls: m.state.buildings
        .filter((b) => ids.includes(b.id))
        .map((b) => ({ level: b.level, timer: !!b.upgradeEnd })),
    };
  }, before.ids);
  expect(after.gold).toBe(before.gold - before.cost);
  expect(after.busy).toBe(before.busy);
  expect(after.walls).toEqual(Array(5).fill({ level: 3, timer: false }));
  await page.reload();
  await page.waitForFunction(() => window.__game?.scene.ready);
  expect(
    await page.evaluate(
      (ids) =>
        window.__game.model.state.buildings.filter((b) => ids.includes(b.id)).map((b) => b.level),
      before.ids,
    ),
  ).toEqual(Array(5).fill(3));
  expect(await page.evaluate(() => window.__game.model.selectedWalls)).toEqual([]);
});

test('same-level controls respect the budget and wait for a free builder', async ({ page }) => {
  await selectWall(page);
  await page.evaluate(() => {
    const m = window.__game.model;
    m.state.gold = m.upgradeCost(m.selectedWalls[0]) * 11;
    m.state.elixir = 0;
    m.changed();
  });
  await page.locator('[data-action="wall-count:10"]').tap();
  await expect(page.locator('.wall-context h2')).toHaveText('11 Walls');
  await expect(page.locator('[data-action="wall-count:1"]')).toBeDisabled();
  await page.locator('[data-action="wall-count:-10"]').tap();
  await expect(page.locator('.wall-context h2')).toHaveText('Wall');
  await page.locator('[data-action="wall-count:10"]').tap();
  const ids = await page.evaluate(() => {
    const m = window.__game.model;
    for (const b of m.state.buildings.filter((b) => b.kind === 'cannon'))
      b.upgradeEnd = m.clock + 3600000;
    m.changed();
    return m.selectedWalls.map((b) => b.id);
  });
  await expect(page.locator('[data-action="wall-upgrade:gold"]')).toBeDisabled();
  await expect(page.locator('.wall-note')).toContainText('free builder');
  await page.evaluate(() => {
    const m = window.__game.model;
    delete m.state.buildings.find((b) => b.kind === 'cannon')!.upgradeEnd;
    m.changed();
  });
  await page.locator('[data-action="wall-upgrade:gold"]').tap();
  expect(await page.evaluate(() => window.__game.model.state.gold)).toBe(0);
  expect(
    await page.evaluate(
      (ids) =>
        window.__game.model.state.buildings.filter((b) => ids.includes(b.id)).map((b) => b.level),
      ids,
    ),
  ).toEqual(Array(11).fill(3));
});

test('mixed rows disclose capped walls and unlock elixir after every piece reaches level five', async ({
  page,
}) => {
  await page.evaluate(() => {
    const m = window.__game.model;
    m.state.elixir = 200000; // Four eligible pieces cost 180,000 on the second upgrade.
    const row = m.state.buildings
      .filter((b) => b.kind === 'wall' && b.y === 19 && b.x <= 12)
      .sort((a, b) => a.x - b.x);
    row.forEach((b, i) => {
      b.level = [5, 5, 4, 8, 5][i];
      b.hp = b.maxHp = 500 * (1 + (b.level - 1) * 0.25);
    });
    m.changed();
  });
  await selectWall(page);
  await page.locator('[data-action="wall-row"]').tap();
  await expect(page.locator('[data-action="wall-upgrade:elixir"]')).toHaveCount(0);
  await expect(page.locator('.wall-note')).toContainText('4 of 5 walls');
  await page.locator('[data-action="wall-upgrade:gold"]').tap();
  await expect(page.locator('[data-action="wall-upgrade:elixir"]')).toBeEnabled();
  const before = await page.evaluate(() => {
    const m = window.__game.model;
    return {
      elixir: m.state.elixir,
      cost: m.wallUpgradeQuote(
        m.selectedWalls.map((b) => b.id),
        'elixir',
      ).cost,
    };
  });
  await page.locator('[data-action="wall-upgrade:elixir"]').tap();
  expect(await page.evaluate(() => window.__game.model.state.elixir)).toBe(
    before.elixir - before.cost,
  );
  expect(
    await page.evaluate(() => window.__game.model.selectedWalls.map((b) => b.level).sort()),
  ).toEqual([6, 7, 7, 7, 8]);
});

test('wall tools keep resource costs and touch controls reachable on narrow and landscape phones', async ({
  page,
}) => {
  await page.evaluate(() => {
    const m = window.__game.model;
    m.state.gold = m.state.elixir = 1000000;
    for (const b of m.state.buildings.filter((b) => b.kind === 'wall')) {
      b.level = 5;
      b.hp = b.maxHp = 1000;
    }
    m.changed();
  });
  for (const [width, height] of [
    [320, 740],
    [844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    await page.waitForFunction((width) => window.__game.scene.cameras.main.width === width, width);
    await selectWall(page);
    await page.locator('[data-action="wall-count:10"]').tap();
    const card = page.locator('.wall-context');
    for (const action of [
      'wall-upgrade:gold',
      'wall-upgrade:elixir',
      'wall-count:1',
      'wall-count:-1',
      'cancel',
    ]) {
      const button = card.locator(`[data-action="${action}"]`);
      await expect(button).toBeInViewport({ ratio: 1 });
      expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    for (const purchase of await card.locator('.wall-upgrade-actions > button').all()) {
      const rect = (await purchase.boundingBox())!;
      for (const child of await purchase.locator(':scope > span, :scope > small').all()) {
        const content = (await child.boundingBox())!;
        expect(content.x).toBeGreaterThanOrEqual(rect.x);
        expect(content.x + content.width).toBeLessThanOrEqual(rect.x + rect.width);
      }
    }
    const box = (await card.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    expect(box.y + box.height).toBeLessThanOrEqual(height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    if (height > 600)
      expect(box.y).toBeGreaterThan(
        (await page.locator('.resources').boundingBox())!.y +
          (await page.locator('.resources').boundingBox())!.height,
      );
    await page.screenshot({
      path: `output/playtest/wall-tools-${width}-${test.info().project.name}.png`,
    });
    await card.locator('[data-action="cancel"]').tap();
    await expect(card).toHaveCount(0);
  }
});

test('the Info panel upgrades only its displayed wall when a row is selected', async ({ page }) => {
  await selectWall(page);
  await page.locator('[data-action="wall-row"]').tap();
  const before = await page.evaluate(() => {
    const m = window.__game.model;
    const anchor = m.selectedWalls.find((b) => b.id === m.selected)!;
    return {
      id: anchor.id,
      cost: m.upgradeCost(anchor),
      gold: m.state.gold,
      walls: m.selectedWalls.map((b) => ({ id: b.id, level: b.level })),
    };
  });
  await page.locator('.wall-context').getByRole('button', { name: 'Info', exact: true }).tap();
  await expect(page.locator('.info-cost')).toContainText('Instant');
  await page.locator(`[data-action="wall-info-upgrade:${before.id}"]`).tap();
  const after = await page.evaluate((ids) => {
    const m = window.__game.model;
    return {
      gold: m.state.gold,
      walls: m.state.buildings.filter((b) => ids.includes(b.id)).map((b) => ({ id: b.id, level: b.level })),
    };
  }, before.walls.map((b) => b.id));
  expect(after.gold).toBe(before.gold - before.cost);
  expect(after.walls).toEqual(
    before.walls.map((b) => ({ ...b, level: b.level + Number(b.id === before.id) })),
  );
});
