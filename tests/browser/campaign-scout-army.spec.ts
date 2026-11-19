import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test('training from a campaign scout returns to the same opponent', async ({ page }) => {
  await page.goto('/?lazyart');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').tap();
  await page.locator('.train-add').tap();
  await page.locator('[data-action="clear-army"]').tap();
  await page.locator('[data-action="close-drawer"]').tap();
  await page.locator('.attack-btn').tap();
  await page.locator('[data-action="campaign-scout:0"]').tap();
  const scout = page.locator('.campaign-scout');
  await expect(scout.getByRole('heading', { name: 'Payback' })).toBeVisible();
  await scout.getByRole('button', { name: 'Prepare army' }).tap();
  await expect(page.locator('.drawer-sheet')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__game.model.battle)).toBeNull();
  await page.locator('[data-action="close-drawer"]').tap();
  await expect(scout.getByRole('heading', { name: 'Payback' })).toBeVisible();
  await scout.getByRole('button', { name: 'Prepare army' }).tap();
  await page.locator('[data-action="train:swordsman"]').tap();
  await page.locator('[data-action="close-drawer"]').tap();
  await expect(scout.getByRole('heading', { name: 'Payback' })).toBeVisible();
  await scout.getByRole('button', { name: 'Attack', exact: true }).tap();
  await expect(page.locator('.battle-enemy h2')).toHaveText('Payback');
  await expect(page.locator('.prep-banner')).toBeVisible();
  await page.locator('.end-battle[data-action="home"]').tap();
  await expect
    .poll(() =>
      page.evaluate(() => ({
        troops: window.__game.model.state.army.swordsman,
        raids: window.__game.model.state.raidLog?.length ?? 0,
      })),
    )
    .toEqual({ troops: 1, raids: 0 });
});
