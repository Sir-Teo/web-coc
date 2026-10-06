import { test, expect } from '@playwright/test';

for (const [width, height] of [
  [390, 844],
  [1440, 960],
])
  test(`the Starter Pass opens from Awards and claims a tier at ${width}px`, async ({
    page,
    browserName,
  }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').click();
    await page.evaluate(() => {
      const m = window.__game.model;
      m.state.starter = {
        counts: { TH2_Battle_LootGold: 4000, TH2_Destroy_HomeBuildings: 50 },
        claimed: [],
      };
      m.state.elixir = 0;
      m.changed();
    });
    // The Awards badge counts the claimable tier with any ready achievements.
    const awards = page.locator('.left-tools [data-action="achievements"]');
    await expect(awards.locator('.notification')).toBeVisible();
    await awards.click();
    const card = page.locator('.starter-card');
    await expect(card).toContainText('Starter Pass');
    await card.locator('[data-action="starter"]').click();
    const panel = page.locator('.starter-body');
    await expect(page.locator('#modal-title')).toHaveText('Starter Pass');
    await expect(panel.locator('[data-challenge="TH2_Battle_LootGold"]')).toContainText(
      'Gold Grabber',
    );
    await expect(panel.locator('[data-challenge="Social_JoinClan"]')).toHaveCount(0);
    const claim = panel.locator('[data-action="starter-claim:0"]');
    await expect(claim).toBeVisible();
    expect((await claim.boundingBox())!.height).toBeGreaterThanOrEqual(40);
    await page.screenshot({ path: `output/playtest/starter-pass-${width}-${browserName}.png` });
    await claim.click();
    await expect(panel.locator('[data-tier="0"]')).toContainText('Claimed');
    expect(await page.evaluate(() => window.__game.model.state.elixir)).toBe(2000);
    // The track scrolls sideways on its own; the page never does.
    const layout = await page.evaluate(() => {
      const track = document.querySelector<HTMLElement>('.starter-track')!;
      return {
        trackScrolls: track.scrollWidth > track.clientWidth,
        page: document.documentElement.scrollWidth <= window.innerWidth,
      };
    });
    expect(layout.page).toBe(true);
    if (width < 500) expect(layout.trackScrolls).toBe(true);
  });
