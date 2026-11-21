import { expect, test } from '@playwright/test';

test.use({ isMobile: true, hasTouch: true });

for (const viewport of [
  { width: 320, height: 568 },
  { width: 390, height: 650 },
  { width: 650, height: 390 },
]) {
  test(`campaign actions fit the list at ${viewport.width}×${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto('/?lazyart');
    await page.locator('[data-action="skip-tutorial"]').tap();
    await page.locator('.attack-btn').tap();
    const list = page.locator('.campaign-list');
    await expect(list).toBeVisible();
    await expect(list.locator('[data-action="attack:0"]')).toBeEnabled();
    await expect(list.locator('[data-action="attack:2"]')).toBeDisabled();
    const layout = await list.evaluate((element) => {
      const list = element.getBoundingClientRect();
      return {
        overflow: element.scrollWidth - element.clientWidth,
        clipped: [...element.querySelectorAll('.campaign-card button')].filter((button) => {
          const { left, right } = button.getBoundingClientRect();
          return (
            left < list.left ||
            right > list.right ||
            button.offsetHeight < 44 ||
            button.offsetWidth < 44
          );
        }).length,
      };
    });
    expect(layout).toEqual({ overflow: 0, clipped: 0 });
    await list.locator('[data-action="campaign-scout:0"]').tap();
    await expect(page.locator('.campaign-scout h2')).toHaveText('Payback');
  });
}

test('Continue reveals the next encounter when the current Campaign filter hides it', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/?lazyart');
  await page.locator('[data-action="skip-tutorial"]').tap();
  await page.evaluate(async () => {
    const { freshNativeCampaign } = await import('/src/game/native-campaign.ts');
    const model = window.__game.model;
    const progress = freshNativeCampaign();
    progress.stars[0] = 3;
    progress.remaining[0] = { gold: 0, elixir: 0, dark: 0 };
    model.state.nativeCampaign = progress;
    model.changed();
  });
  await page.locator('.attack-btn').tap();
  const filter = page.getByLabel('Show villages');
  const next = page.getByRole('button', { name: 'Continue · Goblin Forest' });
  const attack = page.locator('#campaign-stage-1 [data-action="attack:1"]');

  await filter.selectOption('open');
  await next.tap();
  await expect(filter).toHaveValue('open');
  await expect(attack).toBeFocused();

  await filter.selectOption('done');
  await expect(attack).toHaveCount(0);
  await next.tap();
  await expect(filter).toHaveValue('all');
  await expect(attack).toBeFocused();
  await expect(attack).toBeInViewport({ ratio: 0.95 });
  await page.locator('[data-action="campaign-scout:1"]').tap();
  await expect(page.locator('.campaign-scout h2')).toHaveText('Goblin Forest');
});

test('locked Campaign cards and scouting name the source prerequisite', async ({ page }) => {
  await page.setViewportSize({ width: 568, height: 320 });
  await page.goto('/?lazyart');
  await page.locator('[data-action="skip-tutorial"]').tap();
  await page.locator('.attack-btn').tap();
  const outpost = page.locator('#campaign-stage-2');
  await expect(outpost).toContainText('Earn a star in Goblin Forest to unlock.');
  await expect(outpost.getByRole('img', { name: '0 of 3 stars' })).toBeAttached();
  await expect(outpost.getByRole('button', { name: 'Locked' })).toBeDisabled();
  await expect(page.locator('#campaign-stage-16')).toContainText(
    'Earn a star in Fort Knobs or M is for Mortar to unlock.',
  );
  await outpost.getByRole('button', { name: 'Scout Goblin Outpost' }).tap();
  const scout = page.locator('.campaign-scout');
  await expect(scout).toContainText('Earn a star in Goblin Forest to unlock.');
  const locked = scout.getByRole('button', { name: 'Locked' });
  await expect(locked).toBeDisabled();
  await expect(locked).toBeInViewport({ ratio: 1 });
  await scout.getByRole('button', { name: 'Back to campaign' }).tap();
  await expect(outpost.getByRole('button', { name: 'Scout Goblin Outpost' })).toBeFocused();
  await expect(page.locator('[data-action="attack:1"]')).toBeEnabled();
});

test('short landscape leaves room to scroll and restores a distant scout row', async ({ page }) => {
  await page.setViewportSize({ width: 568, height: 320 });
  await page.goto('/?lazyart');
  await page.locator('[data-action="skip-tutorial"]').tap();
  await page.locator('.attack-btn').tap();
  const list = page.locator('.campaign-list');
  const scout = list.locator('[data-action="campaign-scout:107"]');
  expect(await list.evaluate((el) => el.clientHeight)).toBeGreaterThanOrEqual(100);
  await expect(scout.locator('img')).not.toHaveAttribute('src', /.+/);
  await scout.scrollIntoViewIfNeeded();
  await expect(scout.locator('img')).toHaveAttribute('src', /^(blob:|data:image)/);
  const scroll = await list.evaluate((el) => el.scrollTop);
  await scout.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.campaign-scout h2')).toHaveText('Gravelmarch');
  await page.keyboard.press('Escape');
  await expect(scout).toBeFocused();
  expect(await list.evaluate((el) => el.scrollTop)).toBe(scroll);
});

test('scouting lists pinned armed buildings and keeps concealed defenses out', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?lazyart');
  await page.locator('[data-action="skip-tutorial"]').tap();
  await page.evaluate(async () => {
    const { freshNativeCampaign } = await import('/src/game/native-campaign.ts');
    const model = window.__game.model;
    model.state.nativeCampaign = freshNativeCampaign();
    model.state.nativeCampaign.stars.fill(1, 0, 84);
    model.changed();
  });
  await page.locator('.attack-btn').tap();
  await page.locator('[data-action="campaign-scout:84"]').tap();
  const list = page.locator('.campaign-scout-defenses');
  await expect(list.getByText('36× Builder’s Hut', { exact: true })).toBeVisible();
  await expect(list.getByText('1× Goblin Hall', { exact: true })).toBeVisible();
  await expect(list).not.toContainText(/Tesla|Trap/);
  await page.getByRole('button', { name: 'Back to campaign' }).tap();
  await page.locator('[data-action="campaign-scout:1"]').tap();
  await expect(list.locator('li')).toHaveText(['1× Archer Tower']);
});

test('compact landscape reaches deployment, results and replay by touch', async ({ page }) => {
  await page.setViewportSize({ width: 568, height: 320 });
  await page.goto('/?lazyart');
  await page.locator('[data-action="skip-tutorial"]').tap();
  await page.evaluate(async () => {
    const { makeBuilding } = await import('/src/game/model.ts');
    const model = window.__game.model;
    model.townhall!.level = 4;
    model.state.buildings.push(makeBuilding(model.state.nextId++, 'herohall', 35, 20, 1));
    model.state.king = { level: 1 };
    model.state.heroLineup = ['king'];
    model.changed();
  });
  await page.locator('.train-add').tap();
  await page.locator('[data-action="close-drawer"]').tap();
  await page.locator('.attack-btn').tap();
  await page.locator('[data-action="campaign-scout:0"]').tap();
  const scout = page.locator('.campaign-scout');
  const attack = scout.getByRole('button', { name: 'Attack', exact: true });
  await expect(attack).toHaveCount(1);
  await expect(attack).toBeInViewport({ ratio: 1 });
  await expect(scout.getByText('Defenses on show')).toBeInViewport({ ratio: 1 });
  await expect(scout.locator('.campaign-scout-map')).toBeInViewport({ ratio: 1 });
  const spot = (await attack.boundingBox())!;
  await page.touchscreen.tap(spot.x + spot.width / 2, spot.y + spot.height / 2);
  await page.waitForFunction(() => !window.__game.scene.battleArtPending());
  await expect(page.locator('.deploy-tray [data-action="hero-select:king"] img')).toHaveAttribute(
    'src',
    '/assets/catalog-native/roster/hero-barbarian-king.png',
  );
  await page.locator('[data-action="troop:swordsman"]').tap();
  const point = await page.evaluate(() => {
    const { model, scene } = window.__game;
    scene.cameras.main.preRender();
    for (let y = 80; y < innerHeight - 90; y += 8) {
      for (let x = 120; x < innerWidth - 130; x += 8) {
        if (document.elementFromPoint(x, y) !== scene.game.canvas) continue;
        const tile = scene.gridAtScreen(x, y);
        if (!model.deployBlocked(tile.x, tile.y)) return { x, y };
      }
    }
    throw Error('No visible legal deployment tile');
  });
  await page.touchscreen.tap(point.x, point.y);
  await expect.poll(() => page.evaluate(() => window.__game.model.battle!.units.length)).toBe(1);
  await page.locator('[data-action="surrender"]').tap();
  await page.locator('[data-action="end"]').tap();
  await expect(page.locator('#result-title')).toBeVisible();
  await page.getByRole('button', { name: 'Watch replay', exact: true }).tap();
  await expect(page.locator('.replay-status')).toBeVisible();
});

test('short landscape keeps Practice scout actions visible while details scroll', async ({ page }) => {
  await page.setViewportSize({ width: 650, height: 390 });
  await page.goto('/?lazyart');
  await page.locator('[data-action="skip-tutorial"]').tap();
  await page.evaluate(() => {
    const { model } = window.__game;
    model.townhall!.level = 8;
    model.changed();
  });
  await page.locator('.attack-btn').tap();
  const row = page.locator('[data-action="campaign-scout:92"]');
  await row.tap();
  const scout = page.locator('.campaign-scout');
  await expect(scout.getByRole('heading', { name: 'Meat Shield' })).toBeVisible();
  const attack = scout.getByRole('button', { name: 'Attack', exact: true });
  const close = page.getByRole('button', { name: 'Close dialog' });
  const content = scout.locator('.campaign-scout-content');
  expect(await content.evaluate((el) => el.scrollTop)).toBe(0);
  await expect(attack).toBeInViewport({ ratio: 1 });
  await expect(close).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(attack).toBeFocused();
  expect(await content.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
    return el.scrollTop;
  })).toBeGreaterThan(0);
  await expect(attack).toBeInViewport({ ratio: 1 });
  await expect(close).toBeInViewport({ ratio: 1 });
  await page.keyboard.press('Escape');
  await expect(row).toBeFocused();
});
