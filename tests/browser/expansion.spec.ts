import { useDevelopedVillage } from './developed-village';
import { test, expect, type Page } from '@playwright/test';

/** Centres the battle camera on a tile, so the deploy edge the test uses is on screen. */
async function showTile(page: Page, x: number, y: number) {
  await page.evaluate(
    async ([x, y]) => {
      const scene = window.__game.scene;
      scene.cameras.main.centerOn(896 + (x - y) * 32, 112 + (x + y) * 16);
      scene.clampCamera();
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    },
    [x, y],
  );
}
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.evaluate(() => {
    window.__game.audio?.enabled && (window.__game.audio.enabled = false);
  });
});

test('edit mode drags a building, undoes it and stores a layout', async ({ page }) => {
  await useDevelopedVillage(page);
  await page.locator('[data-action="edit"]').click();
  await expect(page.locator('.edit-toolbar')).toBeVisible();
  await expect(page.locator('[data-action="undo"]')).toBeDisabled();
  const from = await page.evaluate(() => {
    const { model, scene } = window.__game;
    const b = model.state.buildings.find((v) => v.kind === 'laboratory');
    const p = scene.screenFor(b.x + 1.5, b.y + 1.5);
    return { id: b.id, x: b.x, y: b.y, sx: p.x, sy: p.y - 20 };
  });
  const to = await page.evaluate(() => {
    const p = window.__game.scene.screenFor(3.5, 3.5);
    return { x: p.x, y: p.y };
  });
  await page.mouse.move(from.sx, from.sy);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 14 });
  await page.mouse.up();
  const moved = await page.evaluate((id) => {
    const b = window.__game.model.state.buildings.find((v) => v.id === id);
    return { x: b.x, y: b.y };
  }, from.id);
  expect(moved).not.toEqual({ x: from.x, y: from.y });
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'output/playtest/edit-desktop.png' });

  await expect(page.locator('[data-action="undo"]')).toBeEnabled();
  await page.locator('[data-action="undo"]').click();
  expect(
    await page.evaluate((id) => {
      const b = window.__game.model.state.buildings.find((v) => v.id === id);
      return { x: b.x, y: b.y };
    }, from.id),
  ).toEqual({ x: from.x, y: from.y });
  await page.locator('[data-action="redo"]').click();
  expect(
    await page.evaluate(
      (id) => window.__game.model.state.buildings.find((v) => v.id === id).x,
      from.id,
    ),
  ).toBe(moved.x);

  await page.locator('[data-action="layouts"]').click();
  await expect(page.locator('#modal-title')).toHaveText('Saved layouts');
  await page.locator('[data-action="layout-save:0"]').click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'output/playtest/layouts-desktop.png' });
  expect(
    await page.evaluate(() => window.__game.model.state.layouts[0].slots.length),
  ).toBeGreaterThan(40);
  await page.locator('[data-action="close"]').click();
  await page.locator('[data-action="edit-done"]').click();
  await expect(page.locator('.edit-toolbar')).toHaveCount(0);
});

test('the building info sheet compares this level with the next', async ({ page }) => {
  await useDevelopedVillage(page);
  await page.evaluate(() => {
    window.__game.model.townhall.level = 3;
    window.__game.model.changed();
  });
  const point = await page.evaluate(() => {
    const { model, scene } = window.__game;
    const b = model.state.buildings.find((v) => v.kind === 'airdefense');
    const p = scene.screenFor(b.x + 1.5, b.y + 1.5);
    return { x: p.x, y: p.y - 20 };
  });
  await page.mouse.click(point.x, point.y);
  await expect(page.locator('.building-context h2')).toHaveText('Air Defense');
  await page.locator('[data-action="info"]').click();
  await expect(page.locator('#modal-title')).toHaveText('Building details');
  const rows = page.locator('.info-table tbody tr');
  await expect(rows.first()).toContainText('Hitpoints');
  // The upgrade improves health and both damage measures; range stays fixed.
  await expect(
    page
      .locator('.info-table tr')
      .filter({ has: page.locator('td.better') })
      .locator('td:first-child'),
  ).toHaveText(['Hitpoints', 'Damage per second', 'Damage per hit']);
  await expect(page.locator('.info-body')).toContainText('Town Hall 4');
  await expect(page.locator('.info-cost')).toHaveCount(0);
  await page.evaluate(() => {
    window.__game.model.townhall!.level = 4;
    window.__game.model.changed();
  });
  await expect(page.locator('.info-cost')).toContainText('2h');
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'output/playtest/info-desktop.png' });
  await page.locator('[data-action="close"]').click();
});

test('a raid scouts first, then deploys by drag and casts a spell', async ({ page }) => {
  // The village below brings a hundred buildings' art.
  test.slow();
  await useDevelopedVillage(page);
  // The first fan-made village, opened by stars along the map: big enough to outlast the test
  // (the first goblin villages fall to this army within seconds), and fought with the
  // village's own army (the Practice levels before it bring their own).
  const stage = await page.evaluate(async () => {
    const { NATIVE_CAMPAIGN, freshNativeCampaign } = await import('/src/game/native-campaign.ts');
    const m = window.__game.model;
    m.state.nativeCampaign = freshNativeCampaign();
    m.state.nativeCampaign.stars.fill(1);
    m.changed();
    return NATIVE_CAMPAIGN.findIndex((v) => v.family === 'forged');
  });
  await page.locator('.attack-btn').click();
  await page.locator(`[data-action="attack:${stage}"]`).first().click();
  await expect(page.locator('.prep-banner')).toBeVisible();
  await expect(page.locator('.battle-clock')).toHaveClass(/prep/);
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'output/playtest/battle-prep-desktop.png' });

  // Hold, then drag: troops are painted along the path instead of panning.
  await page.locator('[data-action="troop:swordsman"]').click();
  await showTile(page, 3, 12);
  const a = await page.evaluate(() => window.__game.scene.screenFor(3, 9));
  const b = await page.evaluate(() => window.__game.scene.screenFor(3, 16));
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  // Past the hold delay (260 ms), measured by the scene's own frames, before the drag starts.
  await page.waitForFunction(() => window.__game.model.battle.units.length > 0);
  await page.mouse.move(b.x, b.y, { steps: 24 });
  await page.mouse.up();
  const deployed = await page.evaluate(() => window.__game.model.battle.units.length);
  expect(deployed).toBeGreaterThan(2);
  expect(await page.evaluate(() => window.__game.model.battle.started)).toBe(true);
  await expect(page.locator('.prep-banner')).toHaveCount(0);

  // Balloons fly, so they are worth their own pass.
  await page.locator('[data-action="troop:balloon"]').click();
  const air = await page.evaluate(() => window.__game.scene.screenFor(4, 12));
  await page.mouse.click(air.x, air.y);
  expect(
    await page.evaluate(
      () => window.__game.model.battle.units.filter((u) => u.kind === 'balloon').length,
    ),
  ).toBe(1);

  await page.locator('[data-action="spell:rage"]').click();
  const spot = await page.evaluate(() => window.__game.scene.screenFor(4, 13));
  await page.mouse.click(spot.x, spot.y);
  // Current battles cast from the client's spell rows: a native cast, not a legacy aura.
  expect(
    await page.evaluate(() =>
      window.__game.model.battle.nativeSpells?.map((s) => [Math.round(s.x), Math.round(s.y)]),
    ),
  ).toEqual([[4, 13]]);
  await page.evaluate(() => window.advanceTime(3000));
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'output/playtest/battle-spells-desktop.png' });

  await page.locator('[data-action="surrender"]').click();
  await expect(page.locator('#modal-title')).toHaveText('End this battle?');
  await page.getByRole('button', { name: 'Keep fighting' }).click();
  await expect(page.locator('#modal-title')).toHaveCount(0);
  await page.locator('[data-action="surrender"]').click();
  await page.locator('[data-action="end"]').click();
  await expect(page.locator('#result-title')).toBeVisible();
});

test('a double tap commits a squad of five', async ({ page }) => {
  await useDevelopedVillage(page);
  await page.locator('.attack-btn').click();
  await page.locator('[data-action="attack:0"]').click();
  await page.locator('[data-action="troop:swordsman"]').click();
  await showTile(page, 3, 12);
  const p = await page.evaluate(() => window.__game.scene.screenFor(3, 12));
  // Two taps within the 380 ms window: one troop, then four more around it. Sent as one
  // action, so tracing between actions cannot stretch the gap.
  await page.mouse.click(p.x, p.y, { clickCount: 2 });
  await expect.poll(() => page.evaluate(() => window.__game.model.battle.units.length)).toBe(5);
});

test('the town hall gate holds buildings back until it is upgraded', async ({ page }) => {
  await page.locator('[data-action="shop"]').last().click();
  await page.locator('[data-action="tab:Defenses"]').click();
  await expect(page.locator('[data-action="build:mortar"]')).toBeDisabled();
  await expect(page.locator('[data-drag="mortar"]')).toHaveCount(0);
  await page.evaluate(() => {
    const m = window.__game.model;
    m.townhall.level = 3;
    m.changed();
  });
  await expect(page.locator('[data-action="build:mortar"]')).toBeEnabled();
  await expect(page.locator('[data-drag="mortar"]')).toHaveCount(1);
});

test('first-run coaching walks the loop, rings its target, and can be skipped', async ({
  page,
}) => {
  const banner = page.locator('.coach-banner');
  await expect(banner).toContainText('Goblins are raiding!');
  await expect(page.locator('.coach-watch.coach-target')).toBeVisible();
  await page.locator('.coach-watch').click();
  await expect(page.locator('.battle-enemy .eyebrow')).toHaveText('GOBLIN RAID');
  await page.locator('[data-action="replay-exit"]').click();
  await expect(banner).toContainText('Collect what your village made');
  await expect(page.locator('.collect-btn.coach-target')).toBeVisible();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'output/playtest/coach-desktop.png' });

  await page.locator('[data-action="collect"]').last().click();
  await expect(banner).toContainText('Put up a new building');
  await expect(page.locator('.shop-btn.coach-target')).toBeVisible();
  await expect(page.locator('.collect-btn.coach-target')).toHaveCount(0);

  // A storage at capacity says so rather than silently swallowing collections.
  await page.evaluate(() => {
    const m = window.__game.model;
    m.state.gold = m.resourceCap('gold');
    m.changed();
  });
  await expect(page.locator('.resource-bar.gold.full')).toBeVisible();

  await page.locator('[data-action="skip-tutorial"]').click();
  await expect(banner).toHaveCount(0);
  await page.waitForTimeout(1500);
  await page.reload();
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await expect(page.locator('.coach-banner')).toHaveCount(0);
});

test('a run of walls is laid without returning to the shop', async ({ page }) => {
  await page.evaluate(() => {
    const m = window.__game.model;
    m.townhall!.level = 3; // TH2 already contains its full allowance of 25 walls.
    // The coaching banner catches taps; keep it off the tiles this run is laid on.
    m.state.tutorial = true;
    m.changed();
  });
  await page.locator('[data-action="shop"]').last().click();
  await page.locator('[data-action="tab:Defenses"]').click();
  await page.locator('[data-action="build:wall"]').click();
  await expect(page.locator('.placement-banner')).toBeVisible();
  const before = await page.evaluate(() => window.__game.model.state.buildings.length);
  for (const [x, y] of [
    [2.5, 6.5],
    [3.5, 6.5],
    [4.5, 6.5],
  ]) {
    const p = await page.evaluate(([gx, gy]) => window.__game.scene.screenFor(gx, gy), [x, y]);
    await page.mouse.click(p.x, p.y);
  }
  expect(await page.evaluate(() => window.__game.model.state.buildings.length)).toBe(before + 3);
  await expect(page.locator('.placement-banner')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.placement-banner')).toHaveCount(0);
});
