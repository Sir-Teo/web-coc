import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 320, height: 568 }, hasTouch: true, isMobile: true });
test('compact phone can watch the opening raid and reach its first campaign deployment', async ({
  page,
}, info) => {
  await page.goto('/?lazyart');
  await expect(page.locator('#loading')).toBeHidden({ timeout: 30000 });
  const coach = page.locator('.coach-banner');
  await expect(coach).toContainText('Goblins are raiding');
  await coach.getByRole('button', { name: 'Watch' }).tap();
  await expect(page.getByRole('region', { name: 'Goblin raid' })).toBeVisible();
  await page.getByRole('button', { name: 'Back to village' }).tap();
  await expect(coach).toContainText('Collect what your village made');
  await page.locator('.collect-btn').tap();
  await expect(coach).toContainText('Put up a new building');
  await page.locator('.shop-btn').tap();
  await page.locator('[data-action="build:goldmine"]').tap();
  const point = await page.evaluate(() => {
    const { model, scene, game } = window.__game;
    for (let x = 2; x < 43; x++)
      for (let y = 2; y < 43; y++) {
        if (!model.canPlace('goldmine', x, y)) continue;
        const p = scene.screenFor(x + 0.5, y + 0.5);
        if (
          p.y > innerHeight * 0.25 &&
          p.y < innerHeight * 0.65 &&
          document.elementFromPoint(p.x, p.y) === game.canvas
        )
          return p;
      }
    throw Error('No usable placement point');
  });
  await page.touchscreen.tap(point.x, point.y);
  await expect(coach).toContainText('Train a troop');
  const train = page.getByRole('button', { name: 'Train troops' });
  await expect(train).toBeVisible();
  await train.tap();
  await page.locator('[data-action="train:swordsman"]').tap();
  await page.locator('[data-action="close-drawer"]').tap();
  await expect(coach).toContainText('Raid the valley');
  await page.locator('.attack-btn').tap();
  await page.locator('[data-action="attack:0"]').tap();
  await expect(page.locator('.prep-banner')).toBeVisible();
  await page.waitForFunction(() => !window.__game.scene.battleArtPending());
  const troop = page.locator('[data-action="troop:swordsman"]');
  await troop.tap();
  const spot = await page.evaluate(() => {
    const { model, scene, game } = window.__game;
    for (let x = 1.5; x < 44; x++)
      for (let y = 1.5; y < 44; y++) {
        if (model.deployBlocked(x, y)) continue;
        const p = scene.screenFor(x, y);
        if (
          p.y > innerHeight * 0.3 &&
          p.y < innerHeight * 0.6 &&
          document.elementFromPoint(p.x, p.y) === game.canvas
        )
          return p;
      }
    throw Error('No usable deployment point');
  });
  const count = await troop.locator('.troop-count').textContent();
  await page.touchscreen.tap(spot.x, spot.y);
  await expect(troop.locator('.troop-count')).toHaveText(`x${Number(count?.slice(1)) - 1}`);
  await page.screenshot({ path: info.outputPath('compact-first-raid.png') });
});
