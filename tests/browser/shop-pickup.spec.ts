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

  test('a compact Shop pickup does not activate Attack under the closed drawer', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    const art = page.locator('[data-drag="goldmine"] .shop-tile-art');
    await art.tap();
    await expect(art).toHaveCount(0);
    await expect(page.locator('.placement-banner')).toContainText('Place Gold Mine');
    await expect(page.getByRole('dialog', { name: 'The Goblin Valley' })).toHaveCount(0);
    expect(await purchaseState(page)).toEqual(pickedUp);
    await page.getByRole('button', { name: 'Cancel placement' }).tap();
    await page.locator('.attack-btn').tap();
    await expect(page.getByRole('dialog', { name: 'The Goblin Valley' })).toBeVisible();
    await page.getByRole('button', { name: 'Close dialog' }).tap();
    await page.locator('.shop-btn').tap();
    await page.locator('[data-action="tab:Resources"]').tap();
    await art.tap();
    await expect(art).toHaveCount(0);
    await expect(page.locator('.placement-banner')).toBeVisible();
    const drop = await page.evaluate(() => {
      const { model, scene } = window.__game;
      for (let y = 200; y <= 360; y += 16)
        for (let x = 105; x <= 205; x += 16) {
          if (document.elementFromPoint(x, y) !== scene.game.canvas) continue;
          const tile = scene.gridAtScreen(x, y);
          if (model.canPlace('goldmine', Math.floor(tile.x), Math.floor(tile.y))) return { x, y };
        }
    });
    expect(drop).toBeDefined();
    await page.touchscreen.tap(drop!.x, drop!.y);
    await expect.poll(() => purchaseState(page)).toEqual({
      ...pickedUp,
      placement: null,
      elixir: 499850,
      buildings: 3,
    });
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

test.describe('phone Shop drop preview', () => {
  test.use({ isMobile: true, hasTouch: true });

  for (const { width, height, kind, resource } of [
    { width: 390, height: 844, kind: 'goldmine', resource: 'elixir' },
    { width: 568, height: 320, kind: 'collector', resource: 'gold' },
  ] as const) {
    test(`the ${kind} preview rejects HUD drops and charges once on clear ground`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      const art = page.locator(`[data-drag="${kind}"] .shop-tile-art`);
      await art.scrollIntoViewIfNeeded();
      const box = (await art.boundingBox())!;
      const { x, y } = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      const cdp = await page.context().newCDPSession(page);
      const send = (type: 'touchStart' | 'touchMove' | 'touchEnd', point?: { x: number; y: number }) =>
        cdp.send('Input.dispatchTouchEvent', { type, touchPoints: point ? [{ ...point, id: 1 }] : [] });
      await send('touchStart', { x, y });
      await send('touchMove', { x, y: y - 36 });
      await expect(page.locator('#drawer')).toHaveClass(/dragging/);
      const spot = (hud: boolean) => page.evaluate(({ hud, kind }) => {
        const { model, scene } = window.__game;
        for (let y = hud ? 24 : Math.round(innerHeight * 0.4); y < innerHeight - 24; y += 6) {
          for (let x = hud ? 24 : 64; x < innerWidth - 24; x += 6) {
            const hit = document.elementFromPoint(x, y);
            if (hud ? !hit?.closest('#hud button') : hit !== scene.game.canvas) continue;
            const g = scene.gridAtScreen(x, y);
            if (model.canPlace(kind, Math.floor(g.x), Math.floor(g.y))) return { x, y };
          }
        }
      }, { hud, kind });
      const hud = await spot(true);
      expect(hud).toBeDefined();
      await send('touchMove', hud);
      const valid = () => page.evaluate(() => {
        const { scene } = window.__game;
        return scene.updateGhost(scene.ghostPoint)?.valid;
      });
      await expect.poll(valid).toBe(false);
      const clear = await spot(false);
      expect(clear).toBeDefined();
      await send('touchMove', clear);
      await expect.poll(valid).toBe(true);
      await send('touchMove', hud);
      await expect.poll(valid).toBe(false);
      await send('touchEnd');
      expect(await purchaseState(page)).toEqual({ ...pickedUp, placement: kind });

      // Wait for the drawer to leave the hit-tested surface before finding the map tap.
      await expect(page.locator('#drawer .drawer-sheet')).toHaveCount(0);
      await expect(page.locator('.placement-banner')).toBeVisible();
      const next = await spot(false);
      expect(next).toBeDefined();
      await page.touchscreen.tap(next!.x, next!.y);
      await expect.poll(() => purchaseState(page)).toEqual({
        ...pickedUp,
        placement: null,
        [resource]: 499850,
        buildings: 3,
      });
    });
  }
});
