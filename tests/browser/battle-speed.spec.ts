import { test, expect } from '@playwright/test';

for (const viewport of [
  { width: 390, height: 844 },
  { width: 844, height: 390 },
  { width: 1440, height: 960 },
]) {
  test(`live attacks run at 1×, 2× and 4× at ${viewport.width}×${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').click();
    await page.locator('#loading').waitFor({ state: 'detached' });
    await page.evaluate(() => {
      const m = window.__game.model;
      m.startBattle(0, true); // Practice: timed, so the clock runs from the first frame.
    });
    const speed = page.locator('[data-action="battle-speed"]');
    await expect(speed).toContainText('1×');
    await expect(speed).toBeInViewport({ ratio: 1 });
    const box = (await speed.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(40);
    // It must not sit on top of the Surrender/Return button or the army tray.
    for (const other of ['.end-battle', '.army-tray']) {
      const o = (await page.locator(other).boundingBox())!;
      const overlaps =
        box.x < o.x + o.width &&
        box.x + box.width > o.x &&
        box.y < o.y + o.height &&
        box.y + box.height > o.y;
      expect(overlaps, `${other} overlaps the speed button`).toBe(false);
    }
    const scouting = () => page.evaluate(() => window.__game.model.battle!.prep);
    const rate = async () => {
      const a = await scouting();
      await page.waitForTimeout(1000);
      return a - (await scouting());
    };
    const normal = await rate();
    await speed.click();
    await expect(speed).toContainText('2×');
    await speed.click();
    await expect(speed).toContainText('4×');
    await page.screenshot({ path: `output/playtest/battle-speed-${viewport.width}.png` });
    const fast = await rate();
    expect(fast).toBeGreaterThan(normal * 2.5);
    // The choice is remembered for the next attack and cycles back to 1×.
    expect(await page.evaluate(() => window.__game.model.state.settings.battleSpeed)).toBe(4);
    await speed.click();
    await expect(speed).toContainText('1×');
  });
}
