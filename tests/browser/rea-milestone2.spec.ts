import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
});

test('uses native Wall & Hero Hall portraits and displays Clash stat progress bars in Troop, Spell, and Hero info modals', async ({
  page,
}) => {
  await page.evaluate(() => {
    const { model } = window.__game;
    model.state.townhall = 12;
    const th = model.state.buildings.find((b) => b.kind === 'townhall');
    if (th) th.level = 12;
    model.state.gold = 9_999_999;
    model.state.elixir = 9_999_999;
    model.state.dark = 999_999;
    model.changed();
  });

  // Wall Shop portrait uses native catalog PNG.
  await page.locator('.shop-btn').click();
  await page.getByRole('tab', { name: 'Defenses' }).click();
  await expect(page.locator('.shop-tile[data-drag="wall"] img')).toHaveAttribute(
    'src',
    '/assets/catalog-native/wall/level-1.png',
  );
  await page.locator('[data-action="close-drawer"]').click();

  // Troop Info and Spell Info modals render Clash two-tone stat progress bars.
  await page.locator('[data-action="army"]').first().click();
  await page.locator('[data-action="troop-info:swordsman"]').first().click();
  await expect(page.locator('.troop-info-body .stat-bar').first()).toBeVisible();
  await page.locator('.modal .close-btn').click();

  await page.locator('[data-action="spell-info:rage"]').first().click();
  await expect(page.locator('.spell-info-body .stat-bar').first()).toBeVisible();
  await page.locator('.modal .close-btn').click();
  await page.locator('[data-action="close-drawer"]').click();

  // Hero Hall renders native Queen roster icon while preserving King portrait & shows stat bars.
  await page.evaluate(() => {
    const { model, hud } = window.__game;
    let hall = model.state.buildings.find((b) => b.kind === 'herohall');
    if (!hall) {
      model.beginBuild('herohall');
      for (let x = 2; x < 24; x++) {
        let placed = false;
        for (let y = 2; y < 24; y++) {
          if (model.canPlace('herohall', x, y)) {
            model.place(x, y);
            placed = true;
            break;
          }
        }
        if (placed) break;
      }
      hall = model.state.buildings.find((b) => b.kind === 'herohall');
    }
    if (hall) {
      hall.level = 5;
      delete hall.constructing;
      delete hall.upgradeEnd;
    }
    model.state.king = { level: 5 };
    model.state.heroes = { ...(model.state.heroes ?? {}), queen: { level: 5 } };
    model.changed();
    hud.show('heroes');
  });
  await expect(page.locator('[data-hero="queen"] .hero-portrait img')).toHaveAttribute(
    'src',
    '/assets/catalog-native/roster/hero-archer-queen.png',
  );
  await expect(page.locator('[data-hero="king"] .hero-portrait img')).toHaveAttribute(
    'src',
    '/assets/characters/king-v1/portrait.webp',
  );
  await expect(page.locator('[data-hero="king"] .hero-stat-grid .stat-bar').first()).toBeVisible();
});

test('supports Clash green confirm button on placement banner and non-blocking cloud transitions', async ({
  page,
}) => {
  await page.evaluate(() => {
    const { model } = window.__game;
    model.state.townhall = 5;
    const th = model.state.buildings.find((b) => b.kind === 'townhall');
    if (th) th.level = 5;
    model.state.gold = 999_999;
    model.changed();
  });
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
  await expect(page.getByRole('button', { name: 'Confirm placement' })).toBeVisible();
  await page.getByRole('button', { name: 'Confirm placement' }).click();
  const afterWalls = await page.evaluate(
    () => window.__game.model.state.buildings.filter((b) => b.kind === 'wall').length,
  );
  expect(afterWalls).toBe(beforeWalls + 1);

  // Entering battle triggers the non-blocking cloud-parting transition and cleans it up.
  await page.evaluate(() => {
    const { model } = window.__game;
    model.state.army.swordsman = 10;
    model.startBattle(0, true);
  });
  const cloud = page.locator('.cloud-veil');
  await expect(cloud).toHaveCSS('pointer-events', 'none');
  await expect(cloud).toBeHidden({ timeout: 2500 });
});

test('shows live star callout, deployed army summary on results, and replay timeline markers', async ({
  page,
}) => {
  // Start a practice raid and wait for the battle HUD to settle at 0 stars.
  await page.evaluate(() => {
    const { model } = window.__game;
    model.state.army.swordsman = 8;
    model.startBattle(0, true);
    for (let x = 1; x < 24; x++) {
      if (!model.deployBlocked(x, 1)) {
        model.activeTroop = 'swordsman';
        model.deploy(x, 1);
        model.deploy(x + 0.5, 1);
        break;
      }
    }
    model.step(0.5);
  });
  await expect(page.locator('.battle-stars')).toBeVisible();

  // Earning the first star mid-battle pops the live Clash star celebration callout.
  await page.evaluate(() => {
    const { model } = window.__game;
    const b = model.battle!;
    b.stars = 1;
    b.destruction = 54;
    model.changed(true);
  });

  await expect(page.locator('#star-callout')).toBeVisible();
  await expect(page.locator('#star-callout')).toContainText('VICTORY!');

  // Finish battle and verify Deployed Army Summary strip on result modal.
  await page.evaluate(() => {
    window.__game.model.finishBattle();
  });
  await expect(page.locator('.result-army')).toBeVisible();
  await expect(page.locator('.result-army .result-unit')).toHaveCount(1);

  // Open replay from result screen and verify deployment timeline markers on scrub bar.
  await page.locator('[data-action^="replay:"]').first().click();
  await expect(page.locator('.replay-track-wrap .replay-markers .replay-marker').first()).toBeAttached();
});
