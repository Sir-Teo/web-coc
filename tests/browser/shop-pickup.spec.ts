import { test, expect, type Page } from '@playwright/test';
import { openShopWithClearGround } from './shop-fixture';

test.beforeEach(async ({ page }) => openShopWithClearGround(page));

const purchaseState = (page: Page) =>
  page.evaluate(() => ({
    placement: window.__game.model.placement,
    gold: window.__game.model.state.gold,
    elixir: window.__game.model.state.elixir,
    buildings: window.__game.model.state.buildings.length,
  }));
const pickedUp = { placement: 'goldmine', gold: 500000, elixir: 500000, buildings: 2 };

for (const wobble of [0, 3]) {
  test(`a Shop artwork click with ${wobble}px movement picks up without buying`, async ({
    page,
    browserName,
  }) => {
    const art = page.locator('[data-drag="goldmine"] .shop-tile-art');
    await art.hover();
    const box = (await art.boundingBox())!;
    await page.mouse.down();
    if (wobble) await page.mouse.move(box.x + box.width / 2 + wobble, box.y + box.height / 2);
    await page.mouse.up();
    expect(await purchaseState(page)).toEqual(pickedUp);
    await expect(page.locator('.placement-banner')).toBeVisible();
    if (!wobble)
      await page.screenshot({ path: `output/playtest/shop-pickup-desktop-${browserName}.png` });
    // Only a deliberate tap on the village buys the picked-up building.
    const drop = await page.evaluate(() => window.__game.scene.screenFor(6.2, 10.2));
    await page.mouse.click(drop.x, drop.y);
    await expect
      .poll(() => page.evaluate(() => window.__game.model.state.buildings.length))
      .toBe(3);
    expect(await page.evaluate(() => window.__game.model.state.elixir)).toBe(499850);
  });
}

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('tapping Shop artwork picks up without buying', async ({ page, browserName }) => {
    await page.locator('[data-drag="goldmine"] .shop-tile-art').tap();
    expect(await purchaseState(page)).toEqual(pickedUp);
    await expect(page.locator('.placement-banner')).toBeVisible();
    await page.screenshot({ path: `output/playtest/shop-pickup-phone-${browserName}.png` });
    await page.keyboard.press('Escape');
    expect(await purchaseState(page)).toEqual({ ...pickedUp, placement: null });
  });

  test('a touch drag buys the building exactly once', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Native touch injection requires CDP.');
    const art = page.locator('[data-drag="goldmine"] .shop-tile-art');
    await art.scrollIntoViewIfNeeded();
    const box = (await art.boundingBox())!;
    const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const drop = await page.evaluate(() => window.__game.scene.screenFor(6.2, 10.2));
    const session = await page.context().newCDPSession(page);
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ ...from, id: 1 }],
    });
    for (let step = 1; step <= 12; step++)
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [
          {
            x: from.x + ((drop.x - from.x) * step) / 12,
            y: from.y + ((drop.y - from.y) * step) / 12,
            id: 1,
          },
        ],
      });
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect
      .poll(() => page.evaluate(() => window.__game.model.state.buildings.length))
      .toBe(3);
    expect(await page.evaluate(() => window.__game.model.state.elixir)).toBe(499850);
  });
});

test('another pointer cannot finish a Shop drag', async ({ page }) => {
  await page.locator('[data-drag="goldmine"] .shop-tile-art').hover();
  await page.mouse.down();
  const drop = await page.evaluate(() => window.__game.scene.screenFor(6.2, 10.2));
  await page.evaluate(
    ({ x, y }) =>
      window.dispatchEvent(
        new PointerEvent('pointerup', {
          pointerId: 99,
          pointerType: 'touch',
          isPrimary: false,
          clientX: x,
          clientY: y,
        }),
      ),
    drop,
  );
  expect(await purchaseState(page)).toEqual(pickedUp);
  await page.mouse.move(drop.x, drop.y, { steps: 10 });
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => window.__game.model.state.buildings.length)).toBe(3);
  expect(await page.evaluate(() => window.__game.model.state.elixir)).toBe(499850);
});
