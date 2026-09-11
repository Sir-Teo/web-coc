import { test, expect, type Page } from '@playwright/test';
async function boot(page: Page, enabled = true) {
  await page.goto(enabled ? '/?devtools=1' : '/');
  await page.waitForFunction(() => window.__game?.scene.ready);
  await page.locator('[data-action="skip-tutorial"]').click();
}
async function open(page: Page) {
  await page.getByRole('button', { name: 'Open developer tools' }).click();
  await expect(page.getByRole('dialog', { name: 'Developer tools' })).toBeVisible();
}
test('tools are absent by default, opted in explicitly, and edits/checkpoints survive reload', async ({
  page,
}) => {
  await boot(page, false);
  await expect(page.locator('.developer-launch')).toHaveCount(0);
  expect(await page.evaluate(() => '__dev' in window)).toBe(false);
  await page.goto('/?devtools=1');
  await page.waitForFunction(() => window.__game?.scene.ready);
  await open(page);
  const initial = await page.evaluate(() => window.__game.model.state.gold);
  await page.locator('.developer-panel input[name="gold"]').fill('9876543');
  await page.getByRole('button', { name: 'Set balances' }).click();
  await expect(page.locator('.developer-status')).toHaveText('Applied.');
  await expect(page.getByRole('button', { name: 'Set balances' })).toBeFocused();
  await page.getByRole('button', { name: '20 of each troop + 5 of each spell' }).click();
  expect(await page.evaluate(() => window.__game.model.state.army.giant)).toBe(20);
  await page.waitForTimeout(1200);
  await page.reload();
  await page.waitForFunction(() => window.__game?.scene.ready);
  await open(page);
  await expect(page.locator('.developer-panel input[name="gold"]')).toHaveValue('9876543');
  await page.getByRole('button', { name: 'Restore checkpoint', exact: true }).click();
  expect(await page.evaluate(() => window.__game.model.state.gold)).toBe(initial);
  expect(await page.evaluate(() => window.__game.model.state.army.giant)).toBe(0);
  await page.screenshot({ animations: 'disabled', path: 'output/playtest/developer-desktop.png' });
});
test('progression controls unlock and level the King, and keyboard input stays in the dialog', async ({
  page,
}) => {
  await boot(page);
  await open(page);
  await page.getByRole('button', { name: 'Unlock King (TH4+)', exact: true }).click();
  await page.locator('.developer-panel input[name="townhall"]').fill('8');
  await page.getByRole('button', { name: 'Set Town Hall', exact: true }).click();
  await page.getByRole('button', { name: 'Max existing buildings at this TH' }).click();
  await page.locator('.developer-panel input[name="kingLevel"]').fill('20');
  await page.getByRole('button', { name: 'Set King level', exact: true }).click();
  expect(await page.evaluate(() => window.__game.model.state.king!.level)).toBe(20);
  const camera = await page.evaluate(() => window.__game.scene.cameras.main.scrollX);
  await page.locator('.developer-panel input[name="gold"]').focus();
  await page.keyboard.press('d');
  await page.keyboard.press('h');
  expect(await page.evaluate(() => window.__game.scene.cameras.main.scrollX)).toBe(camera);
  await page.keyboard.press('Escape');
  await expect(page.locator('.developer-panel')).not.toBeVisible();
  await page.keyboard.press('Control+Shift+D');
  await expect(page.locator('.developer-panel')).toBeVisible();
});
test('opening the toolbox pauses attacks and completion uses the normal results screen', async ({
  page,
}) => {
  await boot(page);
  await page.locator('.train-add').click();
  await page.locator('[data-action="practice"]').click();
  await open(page);
  const elapsed = await page.evaluate(() => window.__game.model.battle!.prep);
  await page.waitForTimeout(350);
  expect(await page.evaluate(() => window.__game.model.battle!.prep)).toBe(elapsed);
  await page.getByRole('button', { name: 'Fill storage + 10,000 gems' }).click();
  await expect(page.locator('.developer-status')).toContainText('Return home');
  await page.getByRole('button', { name: 'Finish with 3 stars' }).click();
  await page.locator('.developer-panel [data-dev="close"]').click();
  await expect(page.locator('#result-title')).toBeVisible();
  expect(await page.evaluate(() => window.__game.model.battle!.stars)).toBe(3);
  await expect.poll(() => page.evaluate(() => window.__game.scene.sys.isActive())).toBe(true);
});
test('phone toolbox scrolls to every control without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await boot(page);
  await open(page);
  await page.getByRole('button', { name: 'Unlock campaign', exact: true }).click();
  await page.getByRole('button', { name: 'End with current result' }).scrollIntoViewIfNeeded();
  await expect(page.getByRole('button', { name: 'End with current result' })).toBeInViewport();
  expect(
    await page.locator('.developer-panel').evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
  await page.screenshot({ animations: 'disabled', path: 'output/playtest/developer-mobile.png' });
  await page.setViewportSize({ width: 844, height: 390 });
  await page.getByRole('button', { name: 'Refresh values' }).click();
  await page.getByRole('button', { name: 'Fill storage + 10,000 gems' }).click();
  await expect(page.locator('.developer-status')).toHaveText('Done.');
});
