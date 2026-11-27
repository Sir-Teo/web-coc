import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
});

test('renders sculpted Clash emblems across Home HUD and floating world-space building nameplate on selection', async ({
  page,
}) => {
  // Sculpted XP star, league badge, builder/shield medallions, and resource emblems.
  await expect(page.locator('.level-shield.clash-xp-shield .xp-star-svg')).toBeVisible();
  await expect(page.locator('.trophy-pill .league-badge-svg')).toBeVisible();
  await expect(page.locator('.status-chips .builder-badge-svg')).toBeVisible();
  await expect(page.locator('.status-chips .shield-badge-svg')).toBeVisible();
  await expect(page.locator('.resource-bar .resource-svg').first()).toBeVisible();

  // Selecting the Town Hall surfaces the floating world-space nameplate above it.
  const label = await page.evaluate(() => {
    const { model, scene } = window.__game;
    const th = model.state.buildings.find((b) => b.kind === 'townhall')!;
    model.selected = th.id;
    model.changed();
    scene.sync();
    scene.drawOverlay(performance.now());
    return scene.selectedNameplateText;
  });
  expect(label).toContain('Town Hall');
  expect(label).toContain('Level ');
});

test('supports on-canvas floating placement buttons and Edit Mode Scout View + Photo Mode', async ({
  page,
}) => {
  await page.evaluate(() => {
    const { model } = window.__game;
    const th = model.state.buildings.find((b) => b.kind === 'townhall');
    if (th) th.level = 6;
    model.state.gold = 999_999;
    model.changed();
  });

  // Floating on-canvas checkmark confirms placement right beside the ghost.
  await page.locator('.shop-btn').click();
  await page.getByRole('tab', { name: 'Defenses' }).click();
  await page.locator('[data-action="build:wall"]').click();

  await page.evaluate(() => {
    const { model, scene } = window.__game;
    for (let x = 3; x < 22; x++) {
      for (let y = 3; y < 22; y++) {
        if (model.canPlace('wall', x, y)) {
          const p = scene.screenFor(x + 0.5, y + 0.5);
          scene.trackGhost(p.x, p.y);
          scene.drawOverlay(performance.now());
          return;
        }
      }
    }
  });

  const beforeWalls = await page.evaluate(
    () => window.__game.model.state.buildings.filter((b) => b.kind === 'wall').length,
  );
  const placeHere = page.getByRole('button', { name: 'Place here' });
  await expect(placeHere).toBeVisible();
  await placeHere.click();
  const afterWalls = await page.evaluate(
    () => window.__game.model.state.buildings.filter((b) => b.kind === 'wall').length,
  );
  expect(afterWalls).toBe(beforeWalls + 1);

  // Cancel any remaining wall-chain placement and enter Village Edit Mode -> toggle Scout View and Photo Mode.
  const discardBtn = page.getByRole('button', { name: 'Discard placement' });
  if (await discardBtn.isVisible()) await discardBtn.click();
  await page.locator('[data-action="edit"]').click();
  await page.locator('[data-action="edit-scout"]').click();
  expect(await page.evaluate(() => window.__game.model.editScoutView)).toBe(true);

  await page.locator('[data-action="edit-photo"]').click();
  await expect(page.locator('.photo-exit-btn')).toBeVisible();
  await expect(page.locator('.edit-toolbar')).toBeHidden();
  await page.locator('.photo-exit-btn').click();
  await expect(page.locator('.edit-toolbar')).toBeVisible();
  await page.locator('[data-action="edit-done"]').click();
});

test('shows sticky Army overview bar with 1-tap remove, Blacksmith stat bars, Ladder Next, and Campaign Goblin Trail Map', async ({
  page,
}) => {
  await page.evaluate(() => {
    const { model } = window.__game;
    const th = model.state.buildings.find((b) => b.kind === 'townhall');
    if (th) th.level = 10;
    model.state.gold = 9_999_999;
    model.state.elixir = 9_999_999;
    model.state.army.swordsman = 6;
    model.changed();
  });

  // Army drawer shows sticky live overview bar with 1-tap removal chip while preserving 3-child sheet structure.
  await page.locator('[data-action="army"]').first().click();
  const overview = page.locator('.army-overview-bar');
  await expect(overview).toBeVisible();
  const chip = overview.locator('.army-chip').first();
  await expect(chip).toContainText('×6');
  await chip.click();
  await expect(overview.locator('.army-chip').first()).toContainText('×5');
  await page.locator('[data-action="close-drawer"]').click();

  // Blacksmith equipment modal shows two-tone Clash stat bars.
  await page.evaluate(() => {
    const { model, hud } = window.__game;
    model.state.king = { level: 5 };
    model.changed();
    hud.show('blacksmith');
  });
  await expect(page.locator('.equipment-stats .stat-bar').first()).toBeVisible();
  await page.locator('.modal .close-btn').click();

  // Campaign defaults to List view and switches smoothly to the winding Goblin Trail Map.
  await page.locator('.attack-btn').click();
  await expect(page.locator('.campaign-card').first()).toBeVisible();
  await page.locator('[data-action="campaign-view:trail"]').click();
  await expect(page.locator('.campaign-trail-map')).toBeVisible();
  await expect(page.locator('.trail-node').first()).toBeVisible();
  await page.locator('[data-action="campaign-view:list"]').click();
  await expect(page.locator('.campaign-card').first()).toBeVisible();
  await page.locator('.modal .close-btn').click();

  // Ladder scouting exposes the orange Next button before first deploy and hides it once battle starts.
  await page.evaluate(() => {
    const { model } = window.__game;
    model.state.army.swordsman = 8;
    model.startLadder();
  });
  const nextBtn = page.locator('[data-action="next-ladder"]');
  await expect(nextBtn).toBeVisible();
  const seedBefore = await page.evaluate(() => window.__game.model.state.ladderSeed ?? 0);
  await nextBtn.click();
  const seedAfter = await page.evaluate(() => window.__game.model.state.ladderSeed ?? 0);
  expect(seedAfter).toBe(seedBefore + 1);

  // Deploy 1 troop -> Next button disappears and sculpted battle stars remain visible.
  await page.evaluate(() => {
    const { model } = window.__game;
    for (let x = 1; x < 24; x++) {
      if (!model.deployBlocked(x, 1)) {
        model.activeTroop = 'swordsman';
        model.deploy(x, 1);
        break;
      }
    }
  });
  await expect(nextBtn).toBeHidden();
  await expect(page.locator('.battle-stars .clash-star-svg').first()).toBeVisible();
});

test('keeps Milestone 3 HUD and Trail Map clean on mobile portrait (390x844) and landscape (844x390)', async ({
  page,
}) => {
  for (const vp of [
    { width: 390, height: 844 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(vp);
    await expect(page.locator('.level-shield.clash-xp-shield')).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);
  }
});
