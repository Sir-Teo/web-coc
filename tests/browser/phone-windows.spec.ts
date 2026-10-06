import { test, expect, type Page } from '@playwright/test';

test.use({ isMobile: true, hasTouch: true });

/** Touch rules key on (pointer: coarse), which not every engine's touch emulation reports. */
const coarsePointer = (page: Page) => page.evaluate(() => matchMedia('(pointer: coarse)').matches);

async function boot(page: Page) {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  await expect(page.locator('#loading')).toBeHidden();
}

/**
 * The shortest of the matching controls (its laid-out height: a window scales slightly as it
 * opens), and how far any of them reaches past the screen.
 */
const controls = (page: Page, selector: string) =>
  page.evaluate((selector) => {
    const found = [...document.querySelectorAll<HTMLElement>(selector)];
    return {
      count: found.length,
      shortest: Math.min(...found.map((e) => e.offsetHeight)),
      beyond: Math.max(0, ...found.map((e) => e.getBoundingClientRect().right - innerWidth)),
    };
  }, selector);

test('phone windows fit the screen and their controls take a finger', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await boot(page);
  // The Laboratory's two columns of cards stay on screen.
  await page.evaluate(() => window.__game.hud.show('research'));
  const research = await controls(page, '.research-grid .training-card');
  expect(research.count).toBeGreaterThan(2);
  expect(research.beyond).toBe(0);
  // All three backup buttons in Settings can be reached.
  await page.evaluate(() => window.__game.hud.show('settings'));
  const backup = await controls(page, '.save-section .game-btn');
  expect(backup.count).toBeGreaterThanOrEqual(3);
  expect(backup.beyond).toBe(0);
  await expect(page.locator('[data-action="import"]')).toBeInViewport();
  test.skip(!(await coarsePointer(page)), 'This engine does not emulate a coarse pointer.');
  expect((await controls(page, '.modal .game-btn')).shortest).toBeGreaterThanOrEqual(44);
  await page.evaluate(() => window.__game.hud.show('research'));
  expect((await controls(page, '.training-card .game-btn')).shortest).toBeGreaterThanOrEqual(44);
  // The campaign's pickers and Attack buttons.
  await page.evaluate(() => window.__game.hud.show('campaign'));
  expect((await controls(page, '.modal select')).shortest).toBeGreaterThanOrEqual(44);
  expect((await controls(page, '.campaign-card .game-btn')).shortest).toBeGreaterThanOrEqual(44);
  // A Quick army's name field.
  await page.evaluate(() => window.__game.hud.show('army-presets'));
  expect((await controls(page, '.preset-title input')).shortest).toBeGreaterThanOrEqual(44);
  // The Shop's price buttons, inside their tiles.
  await page.locator('.modal [data-action="close"]').tap();
  await page.locator('.shop-btn').tap();
  const prices = await page.evaluate(() => {
    const tiles = [...document.querySelectorAll('.shop-tile')].filter((t) =>
      t.querySelector('.shop-buy'),
    );
    const price = (t: Element) => t.querySelector('.shop-buy')!.getBoundingClientRect();
    return {
      shortest: Math.min(
        ...tiles.map((t) => t.querySelector<HTMLElement>('.shop-buy')!.offsetHeight),
      ),
      spilled: tiles.filter((t) => price(t).bottom > t.getBoundingClientRect().bottom + 0.5).length,
    };
  });
  expect(prices.shortest).toBeGreaterThanOrEqual(44);
  expect(prices.spilled).toBe(0);
});

for (const viewport of [
  { width: 844, height: 390 },
  { width: 667, height: 375 },
]) {
  test(`at ${viewport.width}×${viewport.height} every Shop price shows without scrolling the strip`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await boot(page);
    await page.locator('.shop-btn').tap();
    for (const tab of ['All', 'Decorations', 'Treasure']) {
      await page.locator(`[data-action="tab:${tab}"]`).tap();
      const shown = await page.evaluate(() => {
        const strip = document.querySelector('.drawer-body')!;
        const box = strip.getBoundingClientRect();
        const prices = [...strip.querySelectorAll('.shop-tile .shop-buy')].map((b) =>
          b.getBoundingClientRect(),
        );
        return {
          prices: prices.length,
          hidden: prices.filter((r) => r.top < box.top || r.bottom > box.bottom).length,
          scrolls: strip.scrollHeight > strip.clientHeight,
        };
      });
      expect(shown.prices, tab).toBeGreaterThan(0);
      expect(shown, tab).toMatchObject({ hidden: 0, scrolls: false });
    }
    await page.screenshot({
      path: `output/playtest/shop-landscape-${viewport.width}x${viewport.height}.png`,
    });
  });
}
