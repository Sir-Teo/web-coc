import { test, expect } from '@playwright/test';

for (const viewport of [
  { width: 1440, height: 960 },
  { width: 390, height: 844 },
]) {
  test(`achievements are claimed from the Awards button at ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').click();
    await page.locator('#loading').waitFor({ state: 'detached' });
    const awards = page.locator('.left-tools [data-action="achievements"]');
    const ready = await page.evaluate(() => window.__game.model.achievementsReady);
    expect(ready).toBeGreaterThan(0);
    await expect(awards.locator('.notification')).toHaveText(String(ready));
    await awards.click();
    const card = page.locator('.achievement[data-achievement="victory_points"]');
    await expect(card).toContainText('Sweet Victory');
    // Claimable tiers sort to the top of the list.
    const first = page.locator('.achievement').first();
    expect(await first.locator('.quest-claim').isEnabled()).toBe(true);
    const gems = await page.evaluate(() => window.__game.model.state.gems);
    await card.locator('.quest-claim').click();
    await expect(card.locator('.achievement-stars .won')).toHaveCount(1);
    expect(await page.evaluate(() => window.__game.model.state.gems)).toBe(gems + 5);
    // Nothing in the list pushes the dialog sideways on a phone.
    expect(
      await page
        .locator('.achievement')
        .evaluateAll((cards) => cards.every((c) => c.scrollWidth <= c.clientWidth + 1)),
    ).toBe(true);
    await page.screenshot({ path: `output/playtest/achievements-${viewport.width}.png` });
  });
}
