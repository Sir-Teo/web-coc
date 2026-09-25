import { test, expect, type Page } from '@playwright/test';
import { useDevelopedVillage } from './developed-village';

const sizes = [
  [320, 480],
  [320, 568],
  [568, 320],
  [667, 375],
  [700, 390],
  [701, 390],
  [740, 360],
  [844, 390],
  [915, 412],
  [799, 600],
  [800, 600],
  [1024, 550],
  [1024, 600],
  [1024, 650],
  [700, 700],
  [701, 700],
  [1024, 768],
  [390, 844],
  [1440, 960],
];
const controls =
  '#hud > :is(.player-hud,.village-status,.resources,.left-tools,.right-tools,.bottom-left,.bottom-right) button,.bottom-center .army-label button';

async function boot(page: Page) {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  await expect(page.locator('#loading')).toBeHidden();
}

async function obscuredControls(page: Page) {
  return page.locator(controls).evaluateAll((buttons) =>
    buttons.flatMap((el) => {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || getComputedStyle(el).visibility === 'hidden') return [];
      const misses = [
        [0.5, 0.5],
        [0.2, 0.2],
        [0.8, 0.2],
        [0.2, 0.8],
        [0.8, 0.8],
      ].filter(([x, y]) => {
        const target = document.elementFromPoint(r.x + r.width * x, r.y + r.height * y);
        return !target || !el.contains(target);
      });
      return misses.length ? [{ action: el.getAttribute('data-action'), misses }] : [];
    }),
  );
}

for (const developed of [false, true]) {
  test(`${developed ? 'developed' : 'starter'} village controls stay unobscured across compact layout boundaries`, async ({
    page,
    browserName,
  }) => {
    test.setTimeout(60000);
    await boot(page);
    if (developed) await useDevelopedVillage(page);
    for (const [width, height] of sizes) {
      await page.setViewportSize({ width, height });
      await expect
        .poll(() => obscuredControls(page), { message: `${width}×${height} controls` })
        .toEqual([]);
      await expect(page.locator(controls)).not.toHaveCount(0);
      if (height <= 700) {
        const small = await page
          .locator('.right-tools button,.left-tools button')
          .evaluateAll((buttons) =>
            buttons
              .filter((el) => {
                const r = el.getBoundingClientRect();
                return r.width < 44 || r.height < 44;
              })
              .map((el) => el.getAttribute('data-action')),
          );
        expect(small, `${width}×${height} touch targets`).toEqual([]);
      }
      // Read actual behavior: the old overlap collected resources when pressed
      // at Zoom out, despite the zoom button having a visible DOM rectangle.
      await page.locator('[data-action="recenter"]').click();
      const before = await page.evaluate(() => window.__game.scene.viewZoom);
      // Query and measure together: a queued HUD redraw can replace a retained
      // element handle between Playwright's lookup and boundingBox calls.
      const point = await page.evaluate(() => {
        const r = document.querySelector('[data-action="zoom-out"]')!.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      });
      await page.mouse.click(point.x, point.y);
      await expect
        .poll(() => page.evaluate(() => window.__game.scene.viewZoom))
        .toBeLessThan(before);
      if (!developed && width >= 568 && height <= 600 && width / height >= 4 / 3) {
        const trailingSpace = await page.evaluate(() => {
          const tray = document.querySelector('.bottom-center .army-tray')!.getBoundingClientRect();
          const last = document.querySelector('.train-add')!.getBoundingClientRect();
          return tray.right - last.right;
        });
        expect(trailingSpace).toBeLessThan(12);
      }
    }
    for (const [width, height] of [
      [320, 480],
      [568, 320],
      [844, 390],
    ]) {
      await page.setViewportSize({ width, height });
      await page.locator('[data-action="settings"]').click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.keyboard.press('Escape');
      await page.evaluate(() => {
        const m = window.__game.model;
        m.state.gold = 0;
        m.state.buildings.find((b) => b.kind === 'goldmine').stored = 300;
        m.changed();
      });
      const zoom = await page.evaluate(() => window.__game.scene.viewZoom);
      await page.locator('.collect-btn').click();
      await expect
        .poll(() => page.evaluate(() => window.__game.model.state.gold))
        .toBeGreaterThan(0);
      expect(await page.evaluate(() => window.__game.scene.viewZoom)).toBe(zoom);
      await page.screenshot({
        path: `output/playtest/hud-layout-${developed ? 'developed' : 'starter'}-${width}x${height}-${browserName}.png`,
      });
    }
  });
}

test.describe('dense touch controls', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });
  test('rotation, inset spacing, army scrolling and edit controls keep their touch actions', async ({
    page,
  }) => {
    await boot(page);
    await useDevelopedVillage(page);
    for (const [width, height] of [
      [844, 390],
      [568, 320],
      [320, 568],
    ]) {
      await page.setViewportSize({ width, height });
      if (width === 568) {
        // Reserve notch/home-indicator space without claiming physical-device emulation.
        await page.locator('#ui').evaluate((el: HTMLElement) => {
          el.style.setProperty('--hud-left', '44px');
          el.style.setProperty('--hud-right', '44px');
          el.style.setProperty('--hud-bottom', '21px');
        });
      } else await page.locator('#ui').evaluate((el) => el.removeAttribute('style'));
      await expect.poll(() => obscuredControls(page)).toEqual([]);
      await page.locator('.train-add').scrollIntoViewIfNeeded();
      await page.locator('.train-add').tap();
      await expect(page.locator('.drawer-sheet')).toBeVisible();
      await page.locator('[data-action="close-drawer"]').tap();
      await page.locator('[data-action="edit"]').tap();
      await page.locator('[data-action="recenter"]').tap();
      const zoom = await page.evaluate(() => window.__game.scene.viewZoom);
      await page.locator('[data-action="zoom-out"]').tap();
      await expect.poll(() => page.evaluate(() => window.__game.scene.viewZoom)).toBeLessThan(zoom);
      await page.locator('[data-action="edit-done"]').tap();
      await page.locator('.shop-btn').tap();
      await expect(page.locator('.drawer-sheet')).toBeVisible();
      await page.locator('[data-action="close-drawer"]').tap();
    }
  });
});

test('compact first-run coaching leaves Collect, Shop and Skip actionable', async ({ page }) => {
  await boot(page);
  for (const [width, height] of [
    [320, 480],
    [568, 320],
    [844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => {
      const m = window.__game.model;
      m.state.tutorial = false;
      m.state.stats.collected = 0;
      m.state.stats.built = 0;
      m.state.gold = 0;
      m.state.buildings.find((b) => b.kind === 'goldmine').stored = 300;
      m.changed();
    });
    await expect(page.locator('.coach-banner')).toContainText('Collect what your village made');
    await page.locator('.collect-btn.coach-target').click();
    await expect(page.locator('.coach-banner')).toContainText('Put up a new building');
    await page.locator('.shop-btn.coach-target').click();
    await expect(page.locator('.drawer-sheet')).toBeVisible();
    await page.locator('[data-action="close-drawer"]').click();
    await page.locator('[data-action="skip-tutorial"]').click();
    await expect(page.locator('.coach-banner')).toHaveCount(0);
  }
});
