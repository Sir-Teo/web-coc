import { expect, test } from '@playwright/test';

test.use({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
});

test('hidden phones stop HUD/economy polling, save changes and catch up on return', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const probe = { ticks: 0, hud: 0 };
    Object.assign(window, { __backgroundProbe: probe });
    const interval = window.setInterval.bind(window);
    window.setInterval = ((callback: TimerHandler, delay?: number, ...args: any[]) => {
      if (typeof callback !== 'function') return interval(callback, delay, ...args);
      return interval(() => {
        if (delay === 250) probe.hud++;
        if (delay === 1000) probe.ticks++;
        callback(...args);
      }, delay);
    }) as typeof window.setInterval;
  });
  await page.goto('/?lazyart');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  await expect(page.locator('#loading')).toBeHidden();

  const before = await page.evaluate(() => {
    const { model } = window.__game;
    Object.assign((window as any).__backgroundProbe, { ticks: 0, hud: 0 });
    // Exercise the forced background save with a change after the last timed save.
    model.state.gold = 123;
    model.changed();
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
    return model.clock;
  });
  await expect
    .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('crown-clan-save-v1')!).gold))
    .toBe(123);
  // Longer than both intervals: no browser timer throttling is needed for this assertion.
  await page.waitForTimeout(1700);
  expect(
    await page.evaluate(() => ({
      ...(window as any).__backgroundProbe,
      clock: window.__game.model.clock,
    })),
  ).toEqual({ ticks: 0, hud: 0, clock: before });

  const resumed = await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    document.dispatchEvent(new Event('visibilitychange'));
    const { clock } = window.__game.model;
    return { clock, now: Date.now() };
  });
  expect(resumed.clock).toBeGreaterThanOrEqual(before + 1700);
  expect(resumed.now - resumed.clock).toBeLessThan(100);
  // The clock catch-up is immediate, before the restarted one-second poll.
  expect(await page.evaluate(() => (window as any).__backgroundProbe.ticks)).toBe(0);
  await expect
    .poll(() => page.evaluate(() => (window as any).__backgroundProbe.hud))
    .toBeGreaterThan(0);
  await expect
    .poll(() => page.evaluate(() => (window as any).__backgroundProbe.ticks))
    .toBeGreaterThan(1);
  expect(errors).toEqual([]);
});
