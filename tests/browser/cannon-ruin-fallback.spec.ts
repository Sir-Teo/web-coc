import { expect, test } from '@playwright/test';
import { cannonVillage } from '../fixtures/cannon-battle';

test('a Cannon keeps visible rubble while its authored pages are unavailable', async ({ page }) => {
  test.setTimeout(90000);
  const pagedArt = /\/assets\/native-pages\/[^/]+\/graph-\d+\.(?:png|webp)$/;
  await page.route(pagedArt, (route) => route.abort());
  await page.addInitScript(
    (save) => localStorage.setItem('crown-clan-save-v1', JSON.stringify(save)),
    cannonVillage(1),
  );
  await page.goto('/');
  await page.locator('#loading').waitFor({ state: 'detached' });
  await page.locator('.train-add').click();
  await page.locator('[data-action="practice"]').last().click();
  await page.waitForFunction(
    () => window.__game.model.battle && !window.__game.scene.scoutingArtNotice(),
  );
  const sprite = () =>
    page.evaluate(() => {
      const { scene } = window.__game;
      const fallback = scene.sprites.get(6);
      const native = scene.cannonPresentation.towers.get(6);
      return {
        texture: fallback.texture.key,
        alpha: fallback.alpha,
        authored: native?.objects.map((o) => o.getData('nativeCannon').state) ?? [],
      };
    });
  await expect.poll(sprite).toEqual({ texture: 'cannon-level-1', alpha: 1, authored: [] });

  await page.evaluate(() => {
    const { model } = window.__game;
    const tower = model.battle.buildings.find((b) => b.id === 6);
    tower.hp = 0;
    model.changed();
  });
  await expect.poll(sprite).toEqual({ texture: 'ruins-wood', alpha: 1, authored: [] });

  await page.unroute(pagedArt);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect
    .poll(sprite, { timeout: 30000 })
    .toEqual({ texture: 'cannon-level-1', alpha: 0, authored: Array(5).fill('ruin') });
});
