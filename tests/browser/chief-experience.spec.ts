import { test, expect } from '@playwright/test';

for (const viewport of [
  { width: 1440, height: 960 },
  { width: 390, height: 844 },
]) {
  test(`the level shield and profile show chief XP at ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').click();
    await page.locator('#loading').waitFor({ state: 'detached' });
    const shield = page.locator('.player-hud .level-shield');
    // A new village holds 1,850 XP: level 10 on the client curve, 20 of 450 toward level 11.
    await expect(shield).toHaveText('10');
    await expect(shield).toHaveAttribute('aria-label', 'Chief level 10, 20 of 450 XP to level 11');
    await expect(shield).toHaveAttribute('style', '--xp:4.4%');
    await shield.click();
    await expect(page.locator('.chief-xp')).toContainText('20 / 450 XP to level 11');
    // Ore art ships at several hundred pixels; the Star Bonus row must hold it to icon size.
    const sizes = await page
      .locator('.star-bonus-reward img')
      .evaluateAll((images) => images.map((img) => img.getBoundingClientRect().height));
    expect(sizes.length).toBeGreaterThan(0);
    for (const height of sizes) expect(height).toBeLessThanOrEqual(24);
    await page.screenshot({ path: `output/playtest/chief-experience-${viewport.width}.png` });
  });
}
