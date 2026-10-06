import { test, expect, type Page } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

async function openArmy(page: Page) {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  await expect(page.locator('#loading')).toBeHidden();
  await page.evaluate(async () => {
    // A Spell Factory, so spells have housing too.
    const { makeBuilding } = await import('/src/game/model.ts');
    const m = window.__game.model;
    m.state.buildings.push(makeBuilding(m.state.nextId++, 'spellfactory', 30, 30, 1));
    m.clearArmy();
  });
  await page.locator('.train-add').tap();
  await expect(page.locator('.army-tile').first()).toBeVisible();
}

const barbarians = (page: Page) => page.evaluate(() => window.__game.model.state.army.swordsman);
const portrait = '.army-tile .shop-tile-art[data-add="train:swordsman"]';

test('tapping a troop portrait adds one, as in the original training screen', async ({ page }) => {
  await openArmy(page);
  await page.locator(portrait).tap();
  await expect.poll(() => barbarians(page)).toBe(1);
  await page.locator(portrait).tap();
  await expect.poll(() => barbarians(page)).toBe(2);
  // Spells too.
  const spell = page.locator('.army-tile .shop-tile-art[data-add^="brew:"]').first();
  const kind = (await spell.getAttribute('data-add'))!.split(':')[1];
  await spell.tap();
  await expect
    .poll(() => page.evaluate((kind) => window.__game.model.state.spells[kind as 'rage'], kind))
    .toBe(1);
  // A locked troop's portrait is not a control.
  const locked = page.locator('.army-locked .shop-tile-art').first();
  await expect(locked).not.toHaveAttribute('data-add');
});

test('holding a portrait keeps adding, and swiping the strip adds nothing', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'Native touch injection requires CDP.');
  await openArmy(page);
  const session = await page.context().newCDPSession(page);
  const box = (await page.locator(portrait).boundingBox())!;
  const x = box.x + box.width / 2,
    y = box.y + box.height / 2;
  const touch = (type: string, at = x) =>
    session.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: type === 'touchEnd' ? [] : [{ x: at, y, id: 1, radiusX: 4, radiusY: 4 }],
    });
  // Hold for a second: a 450 ms delay, then a troop every 110 ms.
  await touch('touchStart');
  await page.waitForTimeout(1000);
  await touch('touchEnd');
  const held = await barbarians(page);
  expect(held).toBeGreaterThanOrEqual(3);
  // A quick horizontal swipe from the portrait scrolls the strip instead.
  const strip = page.locator('.drawer-body');
  const before = await strip.evaluate((el) => el.scrollLeft);
  await touch('touchStart');
  for (let step = 1; step <= 8; step++) await touch('touchMove', x - step * 25);
  await touch('touchEnd', x - 200);
  await page.waitForTimeout(700);
  expect(await barbarians(page)).toBe(held);
  expect(await strip.evaluate((el) => el.scrollLeft)).toBeGreaterThan(before);
});
