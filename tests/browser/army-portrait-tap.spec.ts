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

for (const interruption of ['blur', 'hidden', 'destroy'] as const) {
  test(`a held Add control stops on ${interruption}`, async ({ page }) => {
    await openArmy(page);
    const add = page.locator('[data-action="train:swordsman"]');
    await add.hover();
    await page.mouse.down();
    const stoppedAt = await page.evaluate((interruption) => {
      if (interruption === 'destroy') window.__game.hud.destroy();
      else if (interruption === 'blur') window.dispatchEvent(new Event('blur'));
      else {
        Object.defineProperty(document, 'hidden', { value: true, configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));
      }
      return window.__game.model.state.army.swordsman;
    }, interruption);
    // Leave enough time for the initial delay and several repeat intervals.
    await page.waitForTimeout(800);
    expect(await barbarians(page)).toBe(stoppedAt);
    if (interruption === 'destroy') return;
    await page.evaluate(() => {
      delete (document as unknown as { hidden?: boolean }).hidden;
      document.dispatchEvent(new Event('visibilitychange'));
    });
    // Release outside the control, then confirm a fresh tap still adds exactly one.
    await page.mouse.move(1, 1);
    await page.mouse.up();
    await add.tap();
    await expect.poll(() => barbarians(page)).toBe(stoppedAt + 1);
  });
}

test('lifting a second finger does not interrupt held troop training', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'Native touch injection requires CDP.');
  await openArmy(page);
  await page.evaluate(() => {
    document.addEventListener(
      'pointerup',
      (event) => {
        if (event.isTrusted && event.pointerType === 'touch')
          document.body.dataset.releasedTouch = event.isPrimary ? 'primary' : 'secondary';
      },
      { capture: true },
    );
  });
  const box = (await page.locator(portrait).boundingBox())!;
  const first = {
    id: 1,
    x: Math.round(box.x + box.width / 2),
    y: Math.round(box.y + box.height / 2),
  };
  const second = { id: 2, x: first.x + 12, y: first.y };
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: string, touchPoints: (typeof first)[]) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints });

  await touch('touchStart', [first]);
  await expect.poll(() => barbarians(page)).toBeGreaterThan(0);
  await touch('touchStart', [first, second]);
  await touch('touchEnd', [second]);
  await expect(page.locator('body')).toHaveAttribute('data-released-touch', 'secondary');
  const afterSecond = await barbarians(page);
  await expect.poll(() => barbarians(page), { timeout: 1000 }).toBeGreaterThan(afterSecond);

  await touch('touchEnd', []);
  await expect(page.locator('body')).toHaveAttribute('data-released-touch', 'primary');
  const stopped = await barbarians(page);
  await page.waitForTimeout(600);
  expect(await barbarians(page)).toBe(stopped);
  await page.locator(portrait).tap();
  await expect.poll(() => barbarians(page)).toBe(stopped + 1);
});

for (const [width, height] of [
  [844, 390],
  [390, 843],
]) {
  test(`resizing the Army drawer to ${width}×${height} ends the old hold`, async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'Native touch injection requires CDP.');
    await openArmy(page);
    const box = (await page.locator(portrait).boundingBox())!;
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2, id: 1 }],
    });
    await expect.poll(() => barbarians(page)).toBeGreaterThan(0);

    await page.evaluate(() => {
      window.addEventListener(
        'resize',
        () => {
          document.body.dataset.armyResized = 'true';
        },
        { once: true },
      );
    });
    await page.setViewportSize({ width, height });
    await expect(page.locator('body')).toHaveAttribute('data-army-resized', 'true');
    const afterResize = await barbarians(page);
    await page.waitForTimeout(500);
    expect(await barbarians(page)).toBe(afterResize);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    expect(await barbarians(page)).toBe(afterResize);

    await page.locator(portrait).tap();
    expect(await barbarians(page)).toBe(afterResize + 1);
  });
}
