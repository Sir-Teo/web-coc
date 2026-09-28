import { test, expect } from '@playwright/test';

for (const viewport of [
  { width: 1440, height: 960 },
  { width: 390, height: 844 },
]) {
  test(`a ladder match stakes and moves trophies at ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').click();
    await page.locator('#loading').waitFor({ state: 'detached' });
    await page.locator('.attack-btn').click();
    const ladder = page.locator('.campaign-summary [data-action="ladder"]');
    await expect(ladder).toBeVisible();
    await expect(ladder).toBeInViewport({ ratio: 1 });
    // The summary row must not push the page sideways on a phone.
    expect(
      await page
        .locator('.campaign-summary')
        .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    ).toBe(true);
    const preview = await page.evaluate(() => window.__game.model.ladderPreview.match);
    await expect(ladder).toContainText(`+${preview.win} / −${preview.loss}`);
    await page.screenshot({ path: `output/playtest/ladder-campaign-${viewport.width}.png` });
    await ladder.click();
    await expect(page.locator('.battle-enemy .eyebrow')).toHaveText('LADDER MATCH');
    await expect(page.locator('.ladder-stake')).toContainText(`Win +${preview.win}`);
    await expect(page.locator('.battle-clock')).toContainText('SCOUTING');
    await page.screenshot({ path: `output/playtest/ladder-battle-${viewport.width}.png` });
    const trophies = await page.evaluate(() => window.__game.model.state.trophies);
    await page.evaluate(() => window.__game.model.finishBattle());
    await expect(page.locator('.ladder-result')).toContainText(`-${preview.loss}`);
    await expect(page.locator('.ladder-result')).toContainText(
      `now ${(trophies - preview.loss).toLocaleString()}`,
    );
    await expect(page.locator('[data-action="raid-again"]')).toContainText('Next ladder match');
    await page.screenshot({ path: `output/playtest/ladder-result-${viewport.width}.png` });
  });
}
