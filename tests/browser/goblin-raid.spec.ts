import { test, expect } from '@playwright/test';

for (const viewport of [
  { width: 390, height: 844 },
  { width: 844, height: 390 },
]) {
  test(`a new village opens with a Goblin raid at ${viewport.width}×${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('#loading').waitFor({ state: 'detached' });
    const banner = page.locator('.coach-banner');
    await expect(banner).toContainText('Goblins are raiding!');
    const watch = banner.locator('.coach-watch');
    await expect(watch).toBeInViewport({ ratio: 1 });
    expect((await watch.boundingBox())!.height).toBeGreaterThanOrEqual(40);
    // The banner fits the screen with both of its buttons.
    const box = (await banner.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    await page.screenshot({ path: `output/playtest/goblin-raid-coach-${viewport.width}.png` });
    await watch.click();
    await expect(page.locator('.battle-enemy .eyebrow')).toHaveText('GOBLIN RAID');
    await expect(page.locator('.battle-enemy h2')).toHaveText('Your village');
    // Goblins land and the raid plays.
    await expect
      .poll(() => page.evaluate(() => window.__game.model.battle?.units.length ?? 0))
      .toBeGreaterThan(0);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `output/playtest/goblin-raid-${viewport.width}.png` });
    const exit = page.locator('[data-action="replay-exit"]');
    await expect(exit).toContainText('Back to village');
    await expect(exit).toBeInViewport();
    await exit.click();
    await expect(banner).toContainText('Collect what your village made');
    expect(await page.evaluate(() => window.__game.model.state.goblinRaidSeen)).toBe(true);
    // Nothing was spent or logged.
    expect(await page.evaluate(() => window.__game.model.state.raidLog?.length ?? 0)).toBe(0);
  });
}
