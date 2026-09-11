import { test, expect } from '@playwright/test';

test('a canvas press released onto a DOM control cancels the village gesture', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.ready);
  await page.locator('[data-action="skip-tutorial"]').click();
  await page.mouse.move(700, 400);
  await page.mouse.down();
  expect(await page.evaluate(() => !!window.__game.scene.down)).toBe(true);
  // A drawer or dialog can move under a held pointer as it opens or rerenders.
  await page.evaluate(() => {
    const control = document.createElement('button');
    control.id = 'gesture-control';
    control.textContent = 'Control';
    control.style.cssText =
      'position:fixed;left:650px;top:350px;width:100px;height:100px;z-index:99999';
    document.body.append(control);
  });
  await page.mouse.up();
  const cancelled = await page.evaluate(() => {
    const scene = window.__game.scene;
    document.querySelector('#gesture-control').remove();
    return { held: !!scene.down, gesture: scene.gesture };
  });
  expect(cancelled).toEqual({ held: false, gesture: 'none' });
  await page.locator('[data-action="shop"]').last().click();
  await page.locator('[data-action="tab:Army"]').click();
  await expect(page.locator('[data-drag="barracks"]')).toBeVisible();
});
