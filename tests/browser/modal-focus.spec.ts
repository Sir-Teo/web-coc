import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.ready);
  await page.locator('[data-action="skip-tutorial"]').click();
  await expect(page.locator('#loading')).toBeHidden();
});

test('a click that does not move browser focus still returns to the actual dialog opener', async ({
  page,
}) => {
  await page.locator('[data-action="shop"]').last().focus();
  // WebKit mouse activation can leave focus elsewhere; reproduce that explicitly
  // in every engine rather than relying on platform-specific click defaults.
  await page.evaluate(() =>
    document.querySelector<HTMLButtonElement>('[data-action="settings"]')!.click(),
  );
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('switch', { name: 'Sound effects' }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('[data-action="settings"]')).toBeFocused();
});

test('pointer opening, switch rerenders and the close button preserve the Settings opener', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('[data-action="settings"]').click();
  await page.getByRole('switch', { name: 'Reduced motion' }).click();
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await expect(page.locator('[data-action="settings"]')).toBeFocused();
});

test('keyboard activation and focus trapping return to the launching control', async ({ page }) => {
  await page.locator('[data-action="settings"]').focus();
  await page.keyboard.press('Enter');
  const close = page.getByRole('button', { name: 'Close dialog', exact: true });
  await expect(close).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(
    true,
  );
  await page.keyboard.press('Tab');
  await expect(close).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-action="settings"]')).toBeFocused();
});

test('building Info returns focus to its recreated context button without losing selection', async ({
  page,
}) => {
  const id = await page.evaluate(() => {
    const m = window.__game.model;
    m.selected = m.state.buildings.find((b) => b.kind === 'cannon')!.id;
    m.changed();
    return m.selected;
  });
  const info = page.locator('.building-context [data-action="info"]');
  await expect(info).toBeVisible();
  await page.locator('[data-action="settings"]').focus();
  await info.evaluate((button: HTMLButtonElement) => button.click());
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await expect(info).toBeFocused();
  expect(await page.evaluate(() => window.__game.model.selected)).toBe(id);
});

test('dialog content updates remain fully visible on their first frame while new openings still animate', async ({
  page,
}) => {
  const watchNextPaint = async () =>
    page.evaluate(() => {
      window.__dialogPaint = null;
      const observer = new MutationObserver(() => {
        observer.disconnect();
        requestAnimationFrame(() => {
          const panel = document.querySelector<HTMLElement>('.modal')!;
          const backdrop = document.querySelector<HTMLElement>('.modal-backdrop')!;
          const style = getComputedStyle(panel);
          window.__dialogPaint = {
            animation: style.animationName,
            opacity: style.opacity,
            transform: style.transform,
            backdropAnimation: getComputedStyle(backdrop).animationName,
            backdropOpacity: getComputedStyle(backdrop).opacity,
          };
        });
      });
      observer.observe(document.querySelector('#modal-root')!, { childList: true });
    });
  await watchNextPaint();
  await page.locator('[data-action="settings"]').click();
  await page.waitForFunction(() => window.__dialogPaint !== null);
  expect(await page.evaluate(() => window.__dialogPaint.animation)).toBe('modal-in');
  await page.locator('.modal').evaluate(async (el) => {
    await Promise.all(el.getAnimations().map((a) => a.finished));
  });
  await watchNextPaint();
  await page.getByRole('switch', { name: 'Sound effects' }).click();
  await page.waitForFunction(() => window.__dialogPaint !== null);
  expect(await page.evaluate(() => window.__dialogPaint)).toEqual({
    animation: 'none',
    opacity: '1',
    transform: 'none',
    backdropAnimation: 'none',
    backdropOpacity: '1',
  });
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await watchNextPaint();
  await page.locator('[data-action="settings"]').click();
  await page.waitForFunction(() => window.__dialogPaint !== null);
  expect(await page.evaluate(() => window.__dialogPaint.animation)).toBe('modal-in');
});
