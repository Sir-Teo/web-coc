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

test.describe('phone Shop drag', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('a horizontal Shop swipe keeps the drawer open and does not buy a building', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'Uses Chromium touch injection');
    const strip = page.locator('.shop-strip');
    const tile = strip.locator('[data-drag] .shop-tile-art').nth(1);
    await tile.scrollIntoViewIfNeeded();
    const before = await strip.evaluate((element) => element.scrollLeft);
    const box = (await tile.boundingBox())!;
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    const cdp = await page.context().newCDPSession(page);
    const touch = (type: string, offset?: number) =>
      cdp.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: offset === undefined ? [] : [{ x: x - offset, y }],
      });
    await touch('touchStart', 0);
    for (let offset = 15; offset <= 150; offset += 15) await touch('touchMove', offset);
    await touch('touchEnd');
    await expect(strip).toBeVisible();
    await expect.poll(() => strip.evaluate((element) => element.scrollLeft)).toBeGreaterThan(before);
    expect(
      await page.evaluate(() => {
        const { model } = window.__game;
        return {
          elixir: model.state.elixir,
          buildings: model.state.buildings.length,
          placement: model.placement,
        };
      }),
    ).toEqual({ elixir: 500000, buildings: 2, placement: null });
  });

  test('resizing mid-drag prevents the old release from buying a building', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'Uses Chromium touch injection');
    const tile = page.locator('[data-drag="goldmine"] .shop-tile-art');
    await tile.scrollIntoViewIfNeeded();
    const box = (await tile.boundingBox())!;
    const cdp = await page.context().newCDPSession(page);
    const touch = (type: string, point?: { x: number; y: number }) =>
      cdp.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: point ? [{ ...point, id: 1 }] : [],
      });
    await touch('touchStart', { x: box.x + box.width / 2, y: box.y + box.height / 2 });
    await expect.poll(() => page.evaluate(() => window.__game.model.placement)).toBe('goldmine');

    await page.setViewportSize({ width: 844, height: 390 });
    await page.waitForFunction(() => {
      const canvas = window.__game.game.canvas.getBoundingClientRect();
      return canvas.width === 844 && canvas.height === 390;
    });
    const drop = await page.evaluate(() => window.__game.scene.screenFor(6.2, 10.2));
    expect(drop.x).toBeGreaterThan(0);
    expect(drop.x).toBeLessThan(844);
    expect(drop.y).toBeGreaterThan(0);
    expect(drop.y).toBeLessThan(390);
    await touch('touchMove', drop);
    await touch('touchEnd');
    expect(
      await page.evaluate(() => {
        const { model, scene } = window.__game;
        return {
          gold: model.state.gold,
          buildings: model.state.buildings.length,
          placement: model.placement,
          ghost: !!scene.ghost,
        };
      }),
    ).toEqual({ gold: 500000, buildings: 2, placement: null, ghost: false });

    await page.locator('.shop-btn').tap();
    await page.locator('[data-action="tab:Resources"]').tap();
    await page.locator('[data-action="build:goldmine"]').tap();
    await expect.poll(() => page.evaluate(() => window.__game.model.placement)).toBe('goldmine');
  });
});
