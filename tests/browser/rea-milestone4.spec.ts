import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
});

test('shows Shop NEW badges on unlocked unbuilt tiles and Goblin Trail biome headers with star tallies', async ({
  page,
}) => {
  await page.evaluate(() => {
    const { model } = window.__game;
    const th = model.state.buildings.find((b) => b.kind === 'townhall');
    if (th) th.level = 8;
    model.state.gold = 9_999_999;
    model.state.elixir = 9_999_999;
    model.changed();
  });

  // Shop surfaces NEW badge on unlocked buildings not yet placed in the village.
  await page.locator('.shop-btn').click();
  await page.getByRole('tab', { name: 'Defenses' }).click();
  await expect(page.locator('.shop-tile .shop-new-badge').first()).toBeVisible();
  await page.locator('[data-action="close-drawer"]').click();

  // Campaign Goblin Trail Map groups stages into biome banners with star tallies & NEXT FRONTIER beacon.
  await page.locator('.attack-btn').click();
  await page.locator('[data-action="campaign-view:trail"]').click();
  const banners = page.locator('.campaign-trail-map .trail-biome-banner');
  expect(await banners.count()).toBeGreaterThanOrEqual(2);
  await expect(banners.first()).toContainText('Goblin Meadow');
  await expect(banners.first().locator('b')).toContainText('★');
  await expect(page.locator('.trail-frontier-pill')).toContainText('NEXT FRONTIER');
  // Every campaign star ribbon renders exactly 3 sculpted stars.
  expect(await page.locator('.trail-node').first().locator('.clash-star-svg').count()).toBe(3);
  await page.locator('.modal .close-btn').click();
});

test('renders scouting countdown bar, spell-armed banner, live star milestones, TH destruction & result breakdown', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.evaluate(() => {
    const { model } = window.__game;
    const th = model.state.buildings.find((b) => b.kind === 'townhall');
    if (th) th.level = 7;
    model.state.army.swordsman = 10;
    model.state.spells.lightning = 2;
    model.startLadder();
  });

  // During pre-deploy scouting, the scouting countdown bar is visible and battle star ribbon has 3 stars.
  await expect(page.locator('#battle-prep-bar')).toBeVisible();
  expect(await page.locator('#battle-stars .clash-star-svg').count()).toBe(3);

  // Selecting a spell highlights the deploy banner with .spell-armed.
  await page.locator('[data-action="spell:lightning"]').click();
  await expect(page.locator('.deploy-label.spell-armed')).toBeVisible();

  // Destroying the enemy Town Hall + enough buildings for >=50% (but <100%) updates live milestone chips.
  await page.evaluate(() => {
    const { model, scene, hud } = window.__game;
    const b = model.battle!;
    b.started = true;
    const th = b.buildings.find(
      (x) => x.kind === 'townhall' || x.npc === 'goblin-hall' || x.npc === 'goblin-townhall',
    )!;
    th.hp = 0;
    model.step(0.05);
    for (const target of b.buildings) {
      if (b.destruction >= 50) break;
      if (target.id === th.id || target.kind === 'wall' || target.hp <= 0) continue;
      target.hp = 0;
      model.step(0.05);
    }
    model.onEffect({
      type: 'destroy',
      x: th.x + 1.5,
      y: th.y + 1.5,
      source: th.kind,
    });
    hud.render();
    scene.sync();
  });

  await expect(page.locator('[data-milestone="half"].earned')).toBeVisible();
  await expect(page.locator('[data-milestone="th"].earned')).toBeVisible();
  await expect(page.locator('[data-milestone="full"]')).not.toHaveClass(/earned/);

  // Finishing opens Battle Result with 3 sculpted stars and earned milestone breakdown.
  await page.evaluate(() => {
    window.__game.model.finishBattle();
  });
  await expect(page.locator('.result-modal')).toBeVisible();
  expect(await page.locator('.result-stars .clash-star-svg').count()).toBe(3);
  await expect(page.locator('.result-milestones .result-milestone.earned')).toHaveCount(2);
  expect(errors).toEqual([]);
});

test('supports interactive Replay Next event jump and marker tooltips', async ({ page }) => {
  await page.evaluate(() => {
    const { model } = window.__game;
    model.state.army.swordsman = 8;
    model.startBattle(0, true);
    for (let i = 0; i < 20; i++) model.step(0.05);
    for (let x = 1; x < 24; x++) {
      if (!model.deployBlocked(x, 1)) {
        model.activeTroop = 'swordsman';
        model.deploy(x, 1);
        break;
      }
    }
    for (let i = 0; i < 60; i++) model.step(0.05);
    for (let x = 1; x < 24; x++) {
      if (!model.deployBlocked(x, 2)) {
        model.activeTroop = 'swordsman';
        model.deploy(x, 2);
        break;
      }
    }
    for (let i = 0; i < 40; i++) model.step(0.05);
    model.finishBattle();
    model.returnHome();
  });

  await page.locator('[data-action="battle-log"]').click();
  await page.getByRole('button', { name: 'Watch replay' }).click();
  await expect(page.locator('.replay-controls')).toBeVisible();
  await page.locator('[data-action="replay-pause"]').click();
  const markers = page.locator('.replay-marker');
  expect(await markers.count()).toBeGreaterThanOrEqual(2);
  const titleAttr = await markers.first().getAttribute('title');
  expect(titleAttr).toContain('Troop deployment');

  // Seek to 0, then click Next event and confirm playback seeks forward to each recorded event.
  await page.evaluate(() => window.__game.model.seekReplay(0));
  await page.waitForFunction(() => !window.__game.model.replay?.seeking);
  const nextEventBtn = page.locator('[data-action="replay-next-event"]');
  await expect(nextEventBtn).toBeVisible();
  await nextEventBtn.click();
  await page.waitForFunction(
    () => !window.__game.model.replay?.seeking && (window.__game.model.replay?.time ?? 0) > 0,
  );
  const afterFirstJump = await page.evaluate(() => window.__game.model.replay?.time ?? 0);
  await nextEventBtn.click();
  await page.waitForFunction((prev) => {
    const r = window.__game.model.replay;
    return Boolean(r && !r.seeking && r.time !== prev);
  }, afterFirstJump);
  const afterSecondJump = await page.evaluate(() => window.__game.model.replay?.time ?? 0);
  expect(afterSecondJump).toBeGreaterThan(afterFirstJump);
});

test('keeps Milestone 4 layouts overflow-free on 390x844 mobile portrait and 568x320 compact landscape', async ({
  page,
}) => {
  // Compact landscape 568x320: Practice Result hides .result-milestones so all 4 action buttons stay unclipped.
  await page.setViewportSize({ width: 568, height: 320 });
  await page.evaluate(() => {
    const { model } = window.__game;
    model.state.army.swordsman = 5;
    model.startBattle(0, true);
    const b = model.battle!;
    b.started = true;
    for (const target of b.buildings) {
      if (b.destruction >= 50) break;
      if (target.kind === 'wall' || target.hp <= 0) continue;
      target.hp = 0;
      model.step(0.05);
    }
    model.finishBattle();
  });
  await expect(page.locator('.result-modal')).toBeVisible();
  await expect(page.locator('.result-milestones')).toBeHidden();
  const returnBtn = page.locator('.result-actions button', { hasText: 'Return to village' });
  const box = await returnBtn.boundingBox();
  expect(box).toBeTruthy();
  expect(box!.y + box!.height).toBeLessThanOrEqual(320);

  // Mobile portrait 390x844: Goblin Trail Map biome banners have zero horizontal overflow.
  await page.setViewportSize({ width: 390, height: 844 });
  await returnBtn.click();
  await page.locator('.attack-btn').click();
  await page.locator('[data-action="campaign-view:trail"]').click();
  await expect(page.locator('.trail-biome-banner').first()).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});
