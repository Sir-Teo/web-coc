import { test, expect, type Page } from '@playwright/test';

test.use({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
});

const scroll = (page: Page) =>
  page.evaluate(() => {
    const c = window.__game.scene.cameras.main;
    return { x: c.scrollX, y: c.scrollY };
  });

async function boot(page: Page) {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  await expect(page.locator('#loading')).toBeHidden();
  // Zoomed in on the middle of the map, with room to glide both ways.
  await page.evaluate(() => {
    const { scene } = window.__game;
    scene.zoomAt(scene.viewZoom * 2, innerWidth / 2, innerHeight / 2);
  });
}

/**
 * A one-finger horizontal drag of `steps` × `stride` CSS px, `interval` ms apart, dispatched
 * as real TouchEvents inside one task. Scripted input from outside the page arrives a slow
 * software-rendered frame apart, far slower than any finger; Phaser handles these events
 * synchronously, so the scene measures the intended pace.
 */
const swipe = (
  page: Page,
  {
    stride,
    steps = 8,
    interval = 16,
    rest = 0,
  }: { stride: number; steps?: number; interval?: number; rest?: number },
) =>
  page.evaluate(
    ({ stride, steps, interval, rest }) => {
      const canvas = window.__game.game.canvas;
      const wait = (ms: number) => {
        const end = performance.now() + ms;
        while (performance.now() < end);
      };
      const y = 520;
      let x = 300;
      const fire = (type: string) => {
        // Phaser reads page coordinates, which a constructed Touch does not derive.
        const at = { clientX: x, clientY: y, pageX: x, pageY: y, screenX: x, screenY: y };
        const touch = new Touch({ identifier: 1, target: canvas, ...at });
        const touches = type === 'touchend' ? [] : [touch];
        canvas.dispatchEvent(
          new TouchEvent(type, {
            bubbles: true,
            cancelable: true,
            touches,
            targetTouches: touches,
            changedTouches: [touch],
          }),
        );
      };
      fire('touchstart');
      for (let i = 0; i < steps; i++) {
        wait(interval);
        x -= stride;
        fire('touchmove');
      }
      wait(rest);
      fire('touchend');
    },
    { stride, steps, interval, rest },
  );

/** A quick one-finger pan that a second finger joins for a brief pinch before both lift. */
const panThenPinch = (page: Page) =>
  page.evaluate(() => {
    const canvas = window.__game.game.canvas;
    const wait = (ms: number) => {
      const end = performance.now() + ms;
      while (performance.now() < end);
    };
    const at = (identifier: number, x: number, y: number) =>
      new Touch({ identifier, target: canvas, clientX: x, clientY: y, pageX: x, pageY: y });
    const fire = (type: string, touches: Touch[], changedTouches: Touch[]) =>
      canvas.dispatchEvent(
        new TouchEvent(type, {
          bubbles: true,
          cancelable: true,
          touches,
          targetTouches: touches,
          changedTouches,
        }),
      );
    let x = 300;
    fire('touchstart', [at(1, x, 520)], [at(1, x, 520)]);
    for (let i = 0; i < 6; i++) {
      wait(16);
      x -= 24;
      fire('touchmove', [at(1, x, 520)], [at(1, x, 520)]);
    }
    const second = at(2, 150, 620);
    fire('touchstart', [at(1, x, 520), second], [second]);
    wait(8);
    const a = at(1, x - 10, 510),
      b = at(2, 160, 630);
    fire('touchmove', [a, b], [a, b]);
    fire('touchend', [b], [a]);
    fire('touchend', [], [b]);
  });

const touchDown = (page: Page) =>
  page.evaluate(() => {
    const canvas = window.__game.game.canvas;
    const touch = new Touch({
      identifier: 2,
      target: canvas,
      clientX: 200,
      clientY: 600,
      pageX: 200,
      pageY: 600,
    });
    canvas.dispatchEvent(
      new TouchEvent('touchstart', {
        bubbles: true,
        cancelable: true,
        touches: [touch],
        targetTouches: [touch],
        changedTouches: [touch],
      }),
    );
    return touch;
  });

test('a quick touch pan glides on, and a resting finger, a tap or a pinch stop it', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'Constructing Touch objects requires Chromium.');
  await boot(page);

  // A quick leftward swipe: the camera keeps moving right after the finger lifts.
  await swipe(page, { stride: 24 });
  const released = await scroll(page);
  await page.waitForTimeout(600);
  const glided = await scroll(page);
  expect(glided.x).toBeGreaterThan(released.x + 20);
  expect(Math.abs(glided.y - released.y)).toBeLessThan(1);
  // It settles.
  await expect
    .poll(async () => {
      const a = await scroll(page);
      await page.waitForTimeout(200);
      return (await scroll(page)).x - a.x;
    })
    .toBe(0);

  // The same swipe, held still before lifting: no glide.
  await swipe(page, { stride: 24, rest: 250 });
  const held = await scroll(page);
  await page.waitForTimeout(500);
  expect((await scroll(page)).x).toBe(held.x);

  // A finger on the map catches a glide.
  await swipe(page, { stride: 24 });
  await touchDown(page);
  const caught = await scroll(page);
  await page.waitForTimeout(400);
  expect((await scroll(page)).x).toBe(caught.x);
  await page.evaluate(() => {
    const canvas = window.__game.game.canvas;
    const touch = new Touch({
      identifier: 2,
      target: canvas,
      clientX: 200,
      clientY: 600,
      pageX: 200,
      pageY: 600,
    });
    canvas.dispatchEvent(
      new TouchEvent('touchend', { bubbles: true, cancelable: true, changedTouches: [touch] }),
    );
  });

  // A pinch at the end of a quick pan settles where the fingers left it.
  await panThenPinch(page);
  const pinched = await scroll(page);
  await page.waitForTimeout(400);
  expect((await scroll(page)).x).toBe(pinched.x);

  // Zoom buttons end a glide rather than fighting it.
  await swipe(page, { stride: 24 });
  await page.locator('[data-action="zoom-out"]').tap();
  const zoomed = await scroll(page);
  await page.waitForTimeout(400);
  expect((await scroll(page)).x).toBe(zoomed.x);
});

test('reduced motion pans without momentum', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Constructing Touch objects requires Chromium.');
  await boot(page);
  await page.evaluate(() => {
    const m = window.__game.model;
    m.state.settings.reducedMotion = true;
    m.changed();
  });
  await swipe(page, { stride: 24 });
  const released = await scroll(page);
  await page.waitForTimeout(500);
  expect((await scroll(page)).x).toBe(released.x);
});
