import { test, expect, type Page } from '@playwright/test';

test.use({ isMobile: true, hasTouch: true });

type Insets = { top: number; right: number; bottom: number; left: number };

/** Chromium reports these through env(safe-area-inset-*), as a notched phone would. */
async function emulateInsets(page: Page, insets: Insets) {
  const session = await page.context().newCDPSession(page);
  await session.send('Emulation.setSafeAreaInsetsOverride' as never, { insets } as never);
}

async function boot(page: Page) {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').tap();
  await expect(page.locator('#loading')).toBeHidden();
}

/** How far each box reaches into the unsafe margins (0 when it stays clear). */
const intrusion = (page: Page, selectors: string[], insets: Insets) =>
  page.evaluate(
    ({ selectors, insets }) =>
      Object.fromEntries(
        selectors.map((selector) => {
          const r = document.querySelector(selector)!.getBoundingClientRect();
          return [
            selector,
            Math.round(
              Math.max(
                0,
                insets.top - r.top,
                insets.left - r.left,
                r.right - (innerWidth - insets.right),
                r.bottom - (innerHeight - insets.bottom),
              ),
            ),
          ];
        }),
      ),
    { selectors, insets },
  );

const CASES: [string, { width: number; height: number }, Insets][] = [
  ['portrait', { width: 390, height: 844 }, { top: 59, right: 0, bottom: 34, left: 0 }],
  ['landscape', { width: 844, height: 390 }, { top: 0, right: 59, bottom: 21, left: 59 }],
];

for (const [name, viewport, insets] of CASES)
  test(`${name}: a full-height dialog and its close button stay clear of the notch and home indicator`, async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'Safe-area emulation requires CDP.');
    await page.setViewportSize(viewport);
    await emulateInsets(page, insets);
    await boot(page);
    // The campaign list is taller than any phone, so its dialog fills the allowed height.
    await page.locator('.attack-btn').tap();
    await expect(page.locator('.modal .campaign-list')).toBeVisible();
    expect(await intrusion(page, ['.modal', '.modal [data-action="close"]'], insets)).toEqual({
      '.modal': 0,
      '.modal [data-action="close"]': 0,
    });
    // Still closable with a finger.
    await page.locator('.modal [data-action="close"]').tap();
    await expect(page.locator('.modal')).toHaveCount(0);
  });

test('without insets, dialogs keep their previous size', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Safe-area emulation requires CDP.');
  await page.setViewportSize({ width: 390, height: 844 });
  await boot(page);
  await page.locator('.attack-btn').tap();
  await expect(page.locator('.modal .campaign-list')).toBeVisible();
  const box = (await page.locator('.modal').boundingBox())!;
  // 12 pixels of backdrop on every side, as before.
  expect(Math.round(box.y)).toBe(12);
  expect(Math.round(box.height)).toBe(844 - 24);
});
