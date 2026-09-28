import { test, expect } from '@playwright/test';

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1440, height: 960 },
]) {
  test(`Hero's Journey opens from the Hero Hall and pays a reward at ${viewport.width}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').click();
    await page.locator('#loading').waitFor({ state: 'detached' });
    const hall = await page.evaluate(async () => {
      const { makeBuilding } = await import('/src/game/model.ts');
      const m = window.__game.model;
      m.state.obstacles = [];
      m.townhall!.level = 8;
      const hall = makeBuilding(m.state.nextId++, 'herohall', 30, 6, 2);
      m.state.buildings.push(hall);
      m.state.king = { level: 30 };
      m.state.dark = 0;
      m.selected = hall.id;
      m.changed();
      return hall.id;
    });
    const journey = page.locator('.building-context [data-action="journey"]');
    await expect(journey).toBeVisible();
    await expect(journey.locator('.notification')).toBeVisible();
    await journey.click();
    await expect(page.locator('#modal-title')).toHaveText('Hero’s Journey');
    const points = await page.evaluate(() => window.__game.model.journeyPoints);
    expect(points).toBeGreaterThanOrEqual(30);
    await expect(page.locator('.journey-progress b')).toHaveText(String(points));
    const claim = page.locator('[data-action="journey-claim:0"]');
    await expect(claim).toBeVisible();
    const box = (await claim.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(40);
    // No sideways scrolling in the track on a phone.
    expect(
      await page.locator('.journey-body').evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    ).toBe(true);
    await page.screenshot({ path: `output/playtest/journey-${viewport.width}.png` });
    await claim.click();
    await expect(page.locator('#journey-tier-0')).toContainText('Claimed');
    expect(await page.evaluate(() => window.__game.model.state.dark)).toBe(3000);
    expect(hall).toBeGreaterThan(0);
  });
}
