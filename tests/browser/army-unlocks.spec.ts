import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.ready);
  await page.locator('[data-action="skip-tutorial"]').click();
});

test('a new village unlocks Giants only after its Barracks upgrade finishes', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.train-add').click();
  await expect(page.locator('[data-action="train:archer"]')).toBeEnabled();
  await expect(page.locator('[data-action="train:giant"]')).toBeDisabled();
  await expect(page.locator('[data-action="train:giant"]')).toContainText('Barracks 3');
  await expect(page.locator('[data-action="brew:lightning"]')).toBeDisabled();
  await page.locator('[data-action="progression"]').click();
  await expect(
    page
      .locator('.progression-tier')
      .filter({ has: page.getByRole('heading', { name: 'Town Hall 2 · Current', exact: true }) }),
  ).toContainText('Giant');
  await page.keyboard.press('Escape');
  const id = await page.evaluate(() => {
    const m = window.__game.model;
    const b = m.state.buildings.find((b) => b.kind === 'barracks');
    m.selected = b.id;
    window.__game.scene.cameras.main.centerOn(896 + (b.x - b.y) * 32, 112 + (b.x + b.y + 3) * 16);
    m.changed();
    return m.selected;
  });
  await page.locator('[data-action="info"]').click();
  await expect(page.locator('.upgrade-unlocks')).toContainText('Giant');
  await page.locator(`.info-upgrade [data-action="upgrade:${id}"]`).click();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.locator('.train-add').click();
  await expect(page.locator('[data-action="train:giant"]')).toBeDisabled();
  await expect(page.locator('[data-action="train:archer"]')).toBeEnabled();
  await page.locator('[data-action="close-drawer"]').click();
  await page.evaluate((id) => {
    const m = window.__game.model;
    m.selected = id;
    const b = m.state.buildings.find((b) => b.id === id);
    window.__game.scene.cameras.main.centerOn(896 + (b.x - b.y) * 32, 112 + (b.x + b.y + 3) * 16);
    m.changed();
  }, id);
  await expect(page.locator('.context-actions [data-action="army"]')).toBeVisible();
  await expect(page.locator('.building-context')).toBeInViewport({ ratio: 1 });
  await page.screenshot({
    path: `output/playtest/army-unlocks-building-phone-${test.info().project.name}.png`,
  });
  await page.locator(`[data-action="finish:${id}"]`).click();
  await page.keyboard.press('Escape');
  await page.locator('.train-add').click();
  await page.locator('[data-action="train:giant"]').click();
  expect(await page.evaluate(() => window.__game.model.state.army.giant)).toBe(1);
  await expect(page.locator('[data-action="train:goblin"]')).toBeDisabled();
  await page.reload();
  await page.waitForFunction(() => window.__game?.scene.ready);
  await page.locator('.train-add').click();
  // The first Giant leaves 27/30 spaces occupied. It stays unlocked, but a
  // second five-space Giant cannot fit until the player makes room.
  await expect(page.locator('[data-action="train:giant"]')).toBeDisabled();
  await page.locator('[data-action="remove-troop:giant"]').click();
  await expect(page.locator('[data-action="train:giant"]')).toBeEnabled();
  await page.locator('[data-action="train:giant"]').scrollIntoViewIfNeeded();
  await expect(page.locator('.drawer-foot')).toBeInViewport({ ratio: 1 });
  await page.screenshot({
    path: `output/playtest/army-unlocks-phone-${test.info().project.name}.png`,
  });
});

test('factory construction and each completed upgrade unlock the next spell', async ({ page }) => {
  const id = await page.evaluate(() => {
    const m = window.__game.model;
    m.townhall.level = 7;
    m.state.buildings.find((b) => b.kind === 'elixirstorage').level = 11;
    m.state.elixir = 1500000;
    m.state.gems = 1000;
    m.placement = 'spellfactory';
    m.place(21, 23);
    const factory = m.state.buildings.find((b) => b.kind === 'spellfactory');
    m.selected = factory.id;
    m.changed();
    return factory.id;
  });
  for (let level = 1; level <= 3; level++) {
    await page.locator(`[data-action="finish:${id}"]`).click();
    await page.keyboard.press('Escape');
    await page.locator('.train-add').click();
    await expect(page.locator('[data-action="brew:lightning"]')).toBeEnabled();
    if (level >= 2) await expect(page.locator('[data-action="brew:heal"]')).toBeEnabled();
    else await expect(page.locator('[data-action="brew:heal"]')).toBeDisabled();
    if (level === 3) await expect(page.locator('[data-action="brew:rage"]')).toBeEnabled();
    else await expect(page.locator('[data-action="brew:rage"]')).toBeDisabled();
    await page.locator('[data-action="close-drawer"]').click();
    if (level < 3) {
      await page.evaluate((id) => {
        const m = window.__game.model;
        m.selected = id;
        m.changed();
      }, id);
      await page.locator(`[data-action="upgrade:${id}"]`).click();
    }
  }
});
