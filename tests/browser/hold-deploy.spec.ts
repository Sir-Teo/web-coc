import { test, expect, type Page } from '@playwright/test';

/** An open grass point near the middle of the screen, where a finger could deploy. */
async function grassPoint(page: Page) {
  return page.evaluate(() => {
    const { scene, model } = window.__game;
    const w = innerWidth,
      h = innerHeight;
    let best: { x: number; y: number; d: number } | null = null;
    for (let x = 1.5; x < 44; x++)
      for (let y = 1.5; y < 44; y++) {
        if (model.deployBlocked(x, y)) continue;
        const p = scene.screenFor(x, y);
        if (p.x < 40 || p.x > w - 40 || p.y < h * 0.3 || p.y > h * 0.6) continue;
        const d = Math.hypot(p.x - w / 2, p.y - h / 2);
        if (!best || d < best.d) best = { x: p.x, y: p.y, d };
      }
    return best!;
  });
}

test.use({ viewport: { width: 390, height: 844 } });

test('holding a finger still streams troops, a tap drops one', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  await page.locator('#loading').waitFor({ state: 'detached' });
  await page.evaluate(() => {
    const m = window.__game.model;
    m.state.army.swordsman = 40;
    m.changed();
    m.startCampaign(0);
    m.activeTroop = 'swordsman';
    m.changed();
  });
  await expect(page.locator('.battle-enemy')).toBeVisible();
  const remaining = () => page.evaluate(() => window.__game.model.battle!.remaining.swordsman);
  const start = await remaining();
  const p = await grassPoint(page);

  // A quick tap is a single troop.
  await page.mouse.click(p.x, p.y);
  expect(await remaining()).toBe(start - 1);

  // Hold still for about a second and a half: the stream drops several troops.
  await page.waitForTimeout(500); // Clear the double-tap window.
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.waitForTimeout(1500);
  await page.mouse.up();
  const held = start - 1 - (await remaining());
  expect(held).toBeGreaterThanOrEqual(8);

  // Releasing stops the stream.
  const after = await remaining();
  await page.waitForTimeout(400);
  expect(await remaining()).toBe(after);
});
