import { test, expect, type Page } from '@playwright/test';

test.use({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
});

const loop = (page: Page) =>
  page.evaluate(() => {
    const { game, model } = window.__game;
    return {
      fpsLimit: game.loop.fpsLimit,
      width: game.canvas.width,
      saver: model.state.settings.batterySaver ?? false,
    };
  });

test('battery saver caps play at 30 FPS and 2× density, and turning it off restores both', async ({
  page,
}) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  await page.locator('#loading').waitFor({ state: 'detached' });

  await page.locator('[data-action="settings"]').first().tap();
  const toggle = page.locator('[data-action="battery"]');
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  // The open dialog counts as activity, so this is the play rate: uncapped by default.
  await expect.poll(async () => (await loop(page)).fpsLimit).toBe(0);

  await toggle.tap();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await expect.poll(() => loop(page)).toEqual({ fpsLimit: 30, width: 2 * 390, saver: true });

  // A raid under the saver keeps the cap; adaptive density may only go lower.
  await page.locator('[data-action="close"]').first().tap();
  await page.evaluate(() => {
    const m = window.__game.model;
    m.state.army.swordsman = 10;
    m.changed();
    m.startCampaign(0);
  });
  await expect(page.locator('.battle-enemy')).toBeVisible();
  const raid = await loop(page);
  expect(raid.fpsLimit).toBe(30);
  expect(raid.width).toBeLessThanOrEqual(2 * 390);
  await page.evaluate(() => {
    const m = window.__game.model;
    m.finishBattle();
    m.returnHome();
  });

  // Off: native 3× density at full scale and no cap in play.
  await page.locator('[data-action="settings"]').first().tap();
  await page.locator('[data-action="battery"]').tap();
  await expect.poll(() => loop(page)).toEqual({ fpsLimit: 0, width: 3 * 390, saver: false });
});
