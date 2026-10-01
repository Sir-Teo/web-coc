import { test, expect, type Page } from '@playwright/test';

async function boot(page: Page) {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  await expect(page.locator('#loading')).toBeHidden();
}

const style = (page: Page, selector: string, property: string) =>
  page
    .locator(selector)
    .first()
    .evaluate((el, name) => getComputedStyle(el).getPropertyValue(name), property);

/** WebKit may expose text selection only under its prefixed name. */
const selection = (page: Page, selector: string) =>
  page
    .locator(selector)
    .first()
    .evaluate((el) => {
      const css = getComputedStyle(el);
      return css.getPropertyValue('user-select') || css.getPropertyValue('-webkit-user-select');
    });

const coarsePointer = (page: Page) => page.evaluate(() => matchMedia('(pointer: coarse)').matches);

test.describe('phone browser gestures', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });

  test('the page cannot refresh, zoom, select or open a menu under play', async ({ page }) => {
    await boot(page);
    // A swipe that starts on the HUD neither pulls to refresh nor bounces the page.
    for (const selector of ['html', 'body']) {
      expect(await style(page, selector, 'overscroll-behavior-y')).toBe('none');
      expect(await style(page, selector, 'overscroll-behavior-x')).toBe('none');
    }
    // Rapid taps on HUD buttons are presses, not a double-tap zoom; shop tiles keep their
    // horizontal-only scroll so a vertical drag still lifts the building.
    expect(await style(page, '.attack-btn', 'touch-action')).toBe('manipulation');
    expect(await style(page, '.train-add', 'touch-action')).toBe('manipulation');
    expect(await style(page, '#game', 'touch-action')).toBe('none');
    // A long press neither selects HUD text nor raises a callout.
    expect(await selection(page, 'body')).toBe('none');
    expect(await selection(page, '.army-tray')).toBe('none');
    // ...and the canvas swallows the contextmenu a long press fires.
    const prevented = await page.locator('#game canvas').evaluate((canvas) => {
      const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
      canvas.dispatchEvent(event);
      return event.defaultPrevented;
    });
    expect(prevented).toBe(true);

    await page.locator('.shop-btn').tap();
    await expect(page.locator('.shop-tile').first()).toBeVisible();
    expect(await style(page, '.shop-tile', 'touch-action')).toBe('pan-x');
    await page.locator('[data-action="close-drawer"]').tap();
  });

  test('form fields keep 16px text so focusing one does not zoom the page', async ({ page }) => {
    await boot(page);
    test.skip(!(await coarsePointer(page)), 'this engine does not emulate a coarse pointer');
    await page.locator('.train-add').tap();
    await expect(page.locator('#army-search')).toBeVisible();
    for (const selector of ['#army-search', '#army-show', '#army-family']) {
      expect(parseFloat(await style(page, selector, 'font-size'))).toBeGreaterThanOrEqual(16);
      expect(await selection(page, selector)).not.toBe('none');
    }
    // Typing still works with the page-wide selection lock.
    await page.locator('#army-search').fill('arch');
    await expect(page.locator('#army-search')).toHaveValue('arch');
    await page.locator('[data-action="close-drawer"]').tap();

    await page.locator('.attack-btn').tap();
    await expect(page.locator('#campaign-filter')).toBeVisible();
    for (const selector of ['#campaign-filter', '#campaign-section'])
      expect(parseFloat(await style(page, selector, 'font-size'))).toBeGreaterThanOrEqual(16);
  });
});

test('a mouse keeps the compact desktop field text', async ({ page }) => {
  await boot(page);
  test.skip(await coarsePointer(page), 'this engine reports a coarse pointer without touch');
  await page.locator('.train-add').click();
  await expect(page.locator('#army-search')).toBeVisible();
  expect(parseFloat(await style(page, '#army-search', 'font-size'))).toBe(13);
});
