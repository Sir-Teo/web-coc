import { test, expect, type Page } from '@playwright/test';

test.use({
  viewport: { width: 844, height: 390 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
});

async function openSettings(page: Page) {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  await expect(page.locator('#loading')).toBeHidden();
  await page.locator('[data-action="settings"]').first().tap();
  await expect(page.locator('.settings-body')).toBeVisible();
}

const inFullscreen = (page: Page) =>
  page.evaluate(() => document.fullscreenElement === document.documentElement);

test('the Settings switch takes a phone browser full screen and follows its exit', async ({
  page,
}) => {
  await openSettings(page);
  test.skip(
    !(await page.evaluate(() => document.fullscreenEnabled)),
    'This engine does not grant full screen to pages.',
  );
  const toggle = page.locator('[data-action="fullscreen"]');
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await toggle.tap();
  await expect.poll(() => inFullscreen(page)).toBe(true);
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await page.screenshot({ path: 'output/playtest/fullscreen-settings.png' });

  // The browser's own gesture (back, swipe, Escape) leaves; the switch follows it.
  await page.evaluate(() => document.exitFullscreen());
  await expect(toggle).toHaveAttribute('aria-checked', 'false');

  // On again, then off with the switch itself.
  await toggle.tap();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await toggle.tap();
  await expect.poll(() => inFullscreen(page)).toBe(false);
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  // Nothing about full screen is saved.
  expect(await page.evaluate(() => Object.keys(window.__game.model.state.settings))).not.toContain(
    'fullscreen',
  );
});

test('a refused request leaves the switch off and says so', async ({ page }) => {
  await page.addInitScript(() => {
    Element.prototype.requestFullscreen = () =>
      Promise.reject(new TypeError('Permissions check failed'));
    Object.defineProperty(Document.prototype, 'fullscreenEnabled', { get: () => true });
  });
  await openSettings(page);
  const toggle = page.locator('[data-action="fullscreen"]');
  await toggle.tap();
  await expect(page.locator('#toast')).toContainText('did not allow full screen');
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
});

test('rapid full-screen taps share one pending browser request', async ({ page }) => {
  await page.addInitScript(() => {
    let active: Element | null = null;
    let requests = 0;
    Object.defineProperty(Document.prototype, 'fullscreenEnabled', { get: () => true });
    Object.defineProperty(Document.prototype, 'fullscreenElement', { get: () => active });
    Element.prototype.requestFullscreen = () => {
      document.documentElement.dataset.fullscreenRequests = String(++requests);
      if (requests > 1) return Promise.reject(new TypeError('User activation already consumed'));
      return new Promise<void>((resolve) => {
        window.addEventListener(
          'complete-test-fullscreen',
          () => {
            active = document.documentElement;
            document.dispatchEvent(new Event('fullscreenchange'));
            resolve();
          },
          { once: true },
        );
      });
    };
  });
  await openSettings(page);
  const toggle = page.locator('[data-action="fullscreen"]');
  await toggle.tap();
  await toggle.tap();
  await expect(page.locator('html')).toHaveAttribute('data-fullscreen-requests', '1');
  await page.evaluate(() => window.dispatchEvent(new Event('complete-test-fullscreen')));
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('#toast')).not.toContainText('did not allow full screen');
});

test('iPhone Safari gets the Home Screen route instead of a switch', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Document.prototype, 'fullscreenEnabled', { get: () => false });
    Object.defineProperty(Document.prototype, 'webkitFullscreenEnabled', { get: () => false });
    Object.defineProperty(Navigator.prototype, 'standalone', { get: () => false });
  });
  await openSettings(page);
  await expect(page.locator('[data-action="fullscreen"]')).toHaveCount(0);
  const tip = page.locator('.setting-tip');
  await expect(tip).toContainText('Add to Home Screen');
  // The installed copy has its own storage, so the tip points at the backup.
  await expect(tip).toContainText('export your village');
});

test('browsers without full screen and outside Safari show neither', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Document.prototype, 'fullscreenEnabled', { get: () => false });
    Object.defineProperty(Navigator.prototype, 'standalone', { get: () => undefined });
  });
  await openSettings(page);
  await expect(page.locator('[data-action="fullscreen"]')).toHaveCount(0);
  await expect(page.locator('.setting-tip')).toHaveCount(0);
});
