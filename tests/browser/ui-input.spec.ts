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

test('a queued redraw cannot detach a pressed Save button or interrupt an army catalog jump', async ({
  page,
}) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.ready);
  await page.locator('[data-action="skip-tutorial"]').click();
  await page.locator('.train-add').click();
  await page.locator('[data-action="army-presets"]').click();
  await page.locator('#preset-name-0').fill('Keep this click');
  const save = page.locator('[data-action="preset-save:0"]');
  // Let the opening redraw settle before retaining a DOM node for the held press.
  await save.hover();
  const box = (await save.boundingBox())!;
  const node = await save.elementHandle();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.evaluate(() => window.__game.model.changed());
  await page.waitForTimeout(100);
  expect(await node!.evaluate((el) => el.isConnected)).toBe(true);
  await page.mouse.up();
  await expect
    .poll(() => page.evaluate(() => window.__game.model.state.armyPresets?.[0]?.name))
    .toBe('Keep this click');
  await page.keyboard.press('Escape');
  await page.locator('.train-add').click();
  await page.locator('[data-action="army-jump:spells"]').click();
  await page.evaluate(() => window.__game.model.changed());
  await expect(page.locator('[data-army-category="spells"]').first()).toBeInViewport();
  await page.locator('[data-action="army-jump:troops"]').click();
  await page.evaluate(() => window.__game.model.changed());
  await expect(page.locator('[data-army-category="troops"]').first()).toBeInViewport();
});
