import { test, expect, type Page } from '@playwright/test';

/** Headless browsers refuse real screen locks; record what the game asks for instead. */
async function recordWakeLock(page: Page) {
  await page.addInitScript(() => {
    const log = { requests: 0, held: 0 };
    window.__wakeLock = log;
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: {
        request: async () => {
          log.requests++;
          log.held++;
          const sentinel = new EventTarget() as EventTarget & {
            released: boolean;
            type: 'screen';
            release(): Promise<void>;
          };
          sentinel.released = false;
          sentinel.type = 'screen';
          sentinel.release = async () => {
            if (sentinel.released) return;
            sentinel.released = true;
            log.held--;
          };
          return sentinel;
        },
      },
    });
  });
}

const held = (page: Page) => page.evaluate(() => window.__wakeLock.held);

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test('a raid and a playing replay keep the screen on; the village does not', async ({ page }) => {
  await recordWakeLock(page);
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  await page.locator('#loading').waitFor({ state: 'detached' });
  // Two economy ticks at home: nothing to keep awake for.
  await page.waitForTimeout(2200);
  expect(await page.evaluate(() => window.__wakeLock.requests)).toBe(0);

  await page.evaluate(() => {
    const m = window.__game.model;
    m.state.army.swordsman = 10;
    m.changed();
    m.startCampaign(0);
    m.activeTroop = 'swordsman';
    m.changed();
  });
  await expect(page.locator('.battle-enemy')).toBeVisible();
  await expect.poll(() => held(page)).toBe(1);
  // The 1 s timer repeats the wish without stacking locks.
  await page.waitForTimeout(2200);
  expect(await page.evaluate(() => window.__wakeLock.requests)).toBe(1);

  // A finished raid's result screen lets the phone sleep again. One troop fighting for
  // twenty seconds leaves a replay long enough to pause and resume.
  await page.evaluate(() => {
    const m = window.__game.model;
    outer: for (let x = 1.5; x < 44; x++)
      for (let y = 1.5; y < 44; y++)
        if (!m.deployBlocked(x, y)) {
          m.deploy(x, y);
          break outer;
        }
    window.advanceTime(20_000);
    m.finishBattle();
  });
  await expect.poll(() => held(page)).toBe(0);
  await page.evaluate(() => window.__game.model.returnHome());

  // Replays hold the screen while playing, not while paused.
  const recordId = await page.evaluate(() => window.__game.model.state.raidLog?.[0]?.id ?? null);
  expect(recordId).not.toBeNull();
  await page.evaluate((id) => window.__game.model.startReplay(id!), recordId);
  await expect.poll(() => held(page)).toBe(1);
  await page.evaluate(() => window.__game.model.toggleReplay());
  await expect.poll(() => held(page)).toBe(0);
  await page.evaluate(() => window.__game.model.toggleReplay());
  await expect.poll(() => held(page)).toBe(1);
  await page.evaluate(() => window.__game.model.returnHome());
  await expect.poll(() => held(page)).toBe(0);
});
