import { test, expect } from '@playwright/test';
import { openShopWithClearGround } from './shop-fixture';

test.beforeEach(async ({ page }) => openShopWithClearGround(page));

for (const interruption of ['blur', 'hidden', 'destroy'] as const) {
  test(`a shop drag is cancelled on ${interruption} before a later release can buy anything`, async ({
    page,
  }) => {
    await page.locator('[data-drag="goldmine"] .shop-tile-art').hover();
    await page.mouse.down();
    await expect.poll(() => page.evaluate(() => window.__game.model.placement)).toBe('goldmine');
    const drop = await page.evaluate(() => window.__game.scene.screenFor(6.2, 10.2));
    await page.mouse.move(drop.x, drop.y, { steps: 10 });
    await page.evaluate((interruption) => {
      if (interruption === 'destroy') window.__game.hud.destroy();
      else if (interruption === 'blur') window.dispatchEvent(new Event('blur'));
      else {
        Object.defineProperty(document, 'hidden', { value: true, configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));
      }
    }, interruption);
    const placementAtInterruption = await page.evaluate(() => window.__game.model.placement);
    await page.evaluate(() => {
      delete (document as unknown as { hidden?: boolean }).hidden;
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.mouse.up();
    await expect
      .poll(() =>
        page.evaluate(
          (placementAtInterruption) => ({
            placementAtInterruption,
            gold: window.__game.model.state.gold,
            elixir: window.__game.model.state.elixir,
            buildings: window.__game.model.state.buildings.length,
            dragging: document.querySelector('#drawer')!.classList.contains('dragging'),
            ghost: !!window.__game.scene.ghost,
          }),
          placementAtInterruption,
        ),
      )
      .toEqual({
        placementAtInterruption: null,
        gold: 500000,
        elixir: 500000,
        buildings: 2,
        dragging: false,
        ghost: false,
      });
    if (interruption === 'destroy') return;
    // The shop still works after returning to the app.
    await page.locator('.shop-btn').click();
    await page.locator('[data-action="tab:Resources"]').click();
    await page.locator('[data-action="build:goldmine"]').click();
    await expect.poll(() => page.evaluate(() => window.__game.model.placement)).toBe('goldmine');
  });
}
