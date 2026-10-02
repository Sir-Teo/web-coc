import { test, expect, type Page } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

/** Records vibration requests, or removes the API to stand in for iOS Safari. */
async function stubVibrate(page: Page, supported = true) {
  await page.addInitScript((supported) => {
    const calls: (number | number[])[] = [];
    (window as unknown as { vibrations: typeof calls }).vibrations = calls;
    // Writable: Phaser's feature detection reassigns navigator.vibrate at boot.
    Object.defineProperty(navigator, 'vibrate', {
      configurable: true,
      writable: true,
      value: supported
        ? (pattern: number | number[]) => {
            calls.push(pattern);
            return true;
          }
        : undefined,
    });
  }, supported);
}

const vibrations = (page: Page) =>
  page.evaluate(() => (window as unknown as { vibrations: (number | number[])[] }).vibrations);

async function boot(page: Page) {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').tap();
  await expect(page.locator('#loading')).toBeHidden();
}

/** An open grass point near the middle of the screen, where a finger could deploy. */
const grassPoint = (page: Page) =>
  page.evaluate(() => {
    const { scene, model } = window.__game;
    let best: { x: number; y: number; d: number } | null = null;
    for (let x = 1.5; x < 44; x++)
      for (let y = 1.5; y < 44; y++) {
        if (model.deployBlocked(x, y)) continue;
        const p = scene.screenFor(x, y);
        if (p.x < 40 || p.x > innerWidth - 40 || p.y < innerHeight * 0.3 || p.y > innerHeight * 0.6)
          continue;
        const d = Math.hypot(p.x - innerWidth / 2, p.y - innerHeight / 2);
        if (!best || d < best.d) best = { x: p.x, y: p.y, d };
      }
    return best!;
  });

test('a deployed troop taps the phone, and the Vibration switch turns it off', async ({ page }) => {
  await stubVibrate(page);
  await boot(page);
  await page.locator('[data-action="settings"]').first().tap();
  const toggle = page.locator('[data-action="haptics"]');
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await page.locator('.modal [data-action="close"]').tap();

  await page.evaluate(() => {
    const m = window.__game.model;
    m.state.army.swordsman = 20;
    m.changed();
    m.startCampaign(0);
    m.activeTroop = 'swordsman';
    m.changed();
  });
  await expect(page.locator('.battle-enemy')).toBeVisible();
  const p = await grassPoint(page);
  await page.touchscreen.tap(p.x, p.y);
  await expect.poll(() => vibrations(page)).toEqual([8]);

  // Off: troops land silently. The setting is saved with the village.
  await page.evaluate(() => window.__game.model.toggleHaptics());
  expect(await page.evaluate(() => window.__game.model.state.settings.haptics)).toBe(false);
  await page.waitForTimeout(150);
  await page.touchscreen.tap(p.x + 6, p.y);
  await page.waitForTimeout(150);
  expect(await vibrations(page)).toEqual([8]);
});

test('replays stay still and only a starred result celebrates', async ({ page }) => {
  await stubVibrate(page);
  await boot(page);
  await page.evaluate(() => {
    const m = window.__game.model;
    m.state.army.swordsman = 20;
    m.changed();
    m.startCampaign(0);
  });
  await expect(page.locator('.battle-enemy')).toBeVisible();
  // A defeat's result screen: no celebration.
  await page.evaluate(() => {
    const { model, audio } = window.__game;
    model.battle!.stars = 0;
    audio.play('victory');
  });
  expect(await vibrations(page)).toEqual([]);
  await page.evaluate(() => {
    const { model, audio } = window.__game;
    model.battle!.stars = 2;
    audio.play('victory');
  });
  expect(await vibrations(page)).toEqual([[30, 60, 30, 60, 60]]);

  // During a replay, the same cues do not vibrate.
  await page.evaluate(() => {
    const { model, audio } = window.__game;
    model.replay = {
      recordId: null,
      seeking: false,
      seekTarget: 0,
      paused: false,
      speed: 1,
      time: 0,
      duration: 10,
      complete: false,
    };
    audio.play('deploy');
    audio.play('destroy');
    model.replay = null;
  });
  expect(await vibrations(page)).toHaveLength(1);
});

test('browsers without vibration show no Vibration switch', async ({ page }) => {
  await stubVibrate(page, false);
  await boot(page);
  await page.locator('[data-action="settings"]').first().tap();
  await expect(page.locator('[data-action="battery"]')).toBeVisible();
  await expect(page.locator('[data-action="haptics"]')).toHaveCount(0);
});
