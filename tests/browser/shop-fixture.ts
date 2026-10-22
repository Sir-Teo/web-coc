import type { Page } from '@playwright/test';

export async function openShopWithClearGround(page: Page) {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('#loading').waitFor({ state: 'detached' });
  await page.locator('[data-action="skip-tutorial"]').click();
  await page.evaluate(async () => {
    const { makeBuilding } = await import('/src/game/model.ts');
    const { model, scene } = window.__game;
    model.state.obstacles = [];
    model.state.buildings = [
      makeBuilding(1, 'townhall', 20, 20, 8),
      makeBuilding(2, 'builder', 26, 26),
    ];
    model.state.gold = model.state.elixir = 500000;
    model.changed();
    scene.sync();
    scene.cameras.main.centerOn(850, 425);
  });
  await page.locator('.shop-btn').click();
  await page.locator('[data-action="tab:Resources"]').click();
}
