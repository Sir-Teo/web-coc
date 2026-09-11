import { test, expect, type Page } from '@playwright/test';

async function boot(page: Page) {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.ready);
  await page.locator('[data-action="skip-tutorial"]').click();
}
async function placeBomb(page: Page) {
  await page.evaluate(() => {
    const m = window.__game.model;
    m.townhall.level = 3;
    m.changed();
  });
  await page.locator('.shop-btn').click();
  await page.locator('[data-action="tab:Traps"]').click();
  await page.locator('[data-action="build:bomb"]').click();
  const point = await page.evaluate(() => window.__game.scene.screenFor(2.5, 13.5));
  await page.mouse.click(point.x, point.y);
  const id = await page.evaluate(() => {
    const m = window.__game.model;
    const bomb = m.state.buildings.find((b) => b.kind === 'bomb')!;
    m.changed();
    return bomb.id;
  });
  await page.keyboard.press('Escape');
  return id;
}

test('all defense artwork loads and locked buildings show their actual unlock', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('response', (r) => {
    if (r.status() >= 400 && r.url().includes('/assets/')) errors.push(r.url());
  });
  await boot(page);
  await page.locator('.shop-btn').click();
  await page.locator('[data-action="tab:Traps"]').click();
  await expect(page.locator('.shop-tile')).toHaveCount(4);
  await expect(page.locator('.shop-tile').filter({ hasText: 'Giant Bomb' })).toContainText(
    'Town Hall 6',
  );
  await expect(page.locator('[data-action="build:airbomb"]')).toBeDisabled();
  await page.screenshot({ animations: 'disabled', path: 'output/playtest/traps-shop-desktop.png' });
  await page.locator('[data-action="tab:Defenses"]').click();
  await expect(page.locator('.shop-tile').filter({ hasText: 'Wizard Tower' })).toContainText(
    'Town Hall 5',
  );
  expect(
    await page.evaluate(() =>
      ['bomb', 'giantbomb', 'airbomb', 'springtrap', 'wizardtower'].every((k) =>
        window.__game.scene.textures.exists(k),
      ),
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test('build, inspect, upgrade and reload a trap through the village controls', async ({ page }) => {
  await boot(page);
  const id = await placeBomb(page);
  const p = await page.evaluate(() => window.__game.scene.screenFor(2.5, 13.5));
  await page.mouse.click(p.x, p.y - 8);
  await expect(page.locator('.building-context')).toContainText('Armed');
  await page.locator('[data-action="info"]').click();
  await expect(page.locator('.info-table')).toContainText('Trigger radius');
  await expect(page.locator('.info-table')).not.toContainText('Hitpoints');
  await expect(page.locator('.trap-note')).toContainText('automatically armed');
  await page.screenshot({ animations: 'disabled', path: 'output/playtest/trap-info-desktop.png' });
  await page.locator(`.info-body [data-action="upgrade:${id}"]`).click();
  await page.evaluate((id) => {
    const m = window.__game.model;
    m.tick(m.state.buildings.find((b) => b.id === id)!.upgradeEnd! + 1);
    m.changed();
  }, id);
  await page.waitForTimeout(300);
  await page.reload();
  await page.waitForFunction(() => window.__game?.scene.ready);
  expect(
    await page.evaluate(
      (id) => window.__game.model.state.buildings.find((b) => b.id === id)?.level,
      id,
    ),
  ).toBe(2);
});

test('practice conceals traps, reveals a pointer-triggered bomb, and rearms on repeat', async ({
  page,
}) => {
  await boot(page);
  const id = await placeBomb(page);
  const army = await page.evaluate(() => window.__game.model.state.army);
  await page.locator('.train-add').click();
  await page.locator('[data-action="practice"]').click();
  await expect
    .poll(() => page.evaluate((id) => window.__game.scene.sprites.get(id)?.visible, id))
    .toBe(false);
  expect(
    await page.evaluate(
      (id) => JSON.parse(window.render_game_to_text()).buildings.some((b) => b.id === id),
      id,
    ),
  ).toBe(false);
  await page.locator('[data-action="troop:swordsman"]').click();
  const point = await page.evaluate(() => window.__game.scene.screenFor(2.5, 13.5));
  await page.mouse.click(point.x, point.y);
  await expect
    .poll(() => page.evaluate((id) => window.__game.model.battle!.traps[id]?.resolved, id))
    .toBe(true);
  expect(await page.evaluate((id) => window.__game.scene.sprites.get(id)?.visible, id)).toBe(true);
  await page.screenshot({
    animations: 'disabled',
    path: 'output/playtest/trap-trigger-practice.png',
  });
  await page.locator('[data-action="surrender"]').click();
  await page.locator('[data-action="end"]').click();
  await page.locator('[data-action="raid-again"]').click();
  await expect
    .poll(() => page.evaluate((id) => window.__game.scene.sprites.get(id)?.visible, id))
    .toBe(false);
  expect(await page.evaluate(() => window.__game.model.battle!.traps)).toEqual({});
  expect(await page.evaluate(() => window.__game.model.state.army)).toEqual(army);
});

test('phone shop categories and trap info stay usable in portrait and landscape', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await boot(page);
  await page.evaluate(() => {
    const camera = window.__game.scene.cameras.main;
    camera.centerOn(896 + (2.5 - 13.5) * 32, 112 + (2.5 + 13.5) * 16);
  });
  const id = await placeBomb(page);
  // Select the placed object at phone camera scale, then use its real context control.
  const p = await page.evaluate(() => window.__game.scene.screenFor(2.5, 13.5));
  await page.mouse.click(p.x, p.y - 3);
  await page.locator('[data-action="info"]').click();
  await expect(page.locator('.info-table')).toContainText('Ground only');
  await page.screenshot({ animations: 'disabled', path: 'output/playtest/trap-info-mobile.png' });
  await page.setViewportSize({ width: 844, height: 390 });
  await page.locator(`.info-body [data-action="upgrade:${id}"]`).scrollIntoViewIfNeeded();
  await expect(page.locator(`.info-body [data-action="upgrade:${id}"]`)).toBeInViewport();
  await page.screenshot({
    animations: 'disabled',
    path: 'output/playtest/trap-info-landscape.png',
  });
  await page.locator('[data-action="close"]').click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.shop-btn').click();
  await page.locator('[data-action="tab:Traps"]').click();
  await expect(page.locator('.shop-tile')).toHaveCount(4);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(
    await page.evaluate(() => {
      const bounds = document.querySelector('.shop-tabs')!.getBoundingClientRect();
      const active = document.querySelector('.shop-tabs .active')!.getBoundingClientRect();
      return active.left >= bounds.left - 1 && active.right <= bounds.right + 1;
    }),
  ).toBe(true);
  await page.screenshot({ animations: 'disabled', path: 'output/playtest/traps-shop-mobile.png' });
});

test('campaign overview hides traps and scouting shows the new Wizard Tower', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => {
    window.__game.model.state.stars.fill(1);
    window.__game.model.changed();
  });
  await page.locator('.attack-btn').click();
  const rects = await page.locator('.campaign-map').nth(5).locator('rect').count();
  await page.locator('[data-action="attack:5"]').click();
  const counts = await page.evaluate(() => {
    const m = window.__game.model;
    return {
      visible: m.buildings.filter((b) => m.visibleBuilding(b)).length,
      tower: m.buildings.find((b) => b.kind === 'wizardtower')?.id,
    };
  });
  expect(rects).toBe(counts.visible + 1);
  expect(counts.tower).toBeDefined();
  await expect
    .poll(() => page.evaluate((id) => window.__game.scene.sprites.get(id!)?.visible, counts.tower))
    .toBe(true);
  await page.screenshot({
    animations: 'disabled',
    path: 'output/playtest/wizard-tower-campaign.png',
  });
});
