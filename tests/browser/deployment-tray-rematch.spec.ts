import { expect, test } from '@playwright/test';
import { makeBuilding } from '../../src/game/model';
import { wizardTowerVillage } from '../fixtures/wizard-tower-battle';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test('a Practice rematch starts at the first troop while a live HUD refresh preserves scroll', async ({
  page,
}) => {
  const save = wizardTowerVillage();
  save.buildings.push(makeBuilding(7, 'spellfactory', 9, 9, 3));
  save.nextId = 8;
  Object.assign(save.army, {
    swordsman: 1,
    archer: 1,
    giant: 1,
    goblin: 1,
    wallbreaker: 1,
    balloon: 1,
    wizard: 1,
    healer: 1,
    dragon: 0,
  });
  Object.assign(save.spells, { lightning: 1, heal: 1, rage: 1 });
  save.settings.sound = false;
  await page.addInitScript(
    (json) => localStorage.setItem('crown-clan-save-v1', json),
    JSON.stringify(save),
  );
  await page.goto('/');
  await expect(page.locator('#loading')).toBeHidden();
  const tap = (action: string) => page.locator(`[data-action="${action}"]`).tap();
  await page.locator('.attack-btn').tap();
  await tap('practice');
  await page.waitForFunction(() => !window.__game.scene.battleArtPending());
  const tray = page.locator('.deploy-tray .army-tray');
  const offset = () => tray.evaluate((el) => el.scrollLeft);
  await tap('spell:rage');
  await expect.poll(offset).toBeGreaterThan(30);
  const point = await page.evaluate(() => {
    const { scene, game } = window.__game;
    scene.paused = true;
    for (let x = 10; x < 25; x++) {
      for (let y = 10; y < 25; y++) {
        const p = scene.screenFor(x + 0.5, y + 0.5);
        if (
          p.y > innerHeight * 0.3 &&
          p.y < innerHeight * 0.55 &&
          document.elementFromPoint(p.x, p.y) === game.canvas
        )
          return p;
      }
    }
    throw Error('No visible cast point');
  });
  await page.touchscreen.tap(point.x, point.y);
  await expect(tray.locator('[data-action="spell:rage"]')).toBeDisabled();
  const scrolled = await offset();
  expect(scrolled).toBeGreaterThan(30);
  await page.evaluate(async () => {
    window.__game.model.changed();
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
  expect(await offset()).toBe(scrolled);
  await tap('surrender');
  await tap('end');
  await tap('raid-again');
  await expect(tray.locator('[data-action="spell:rage"]')).toBeEnabled();
  await expect.poll(offset).toBe(0);
  await expect(tray.locator('[data-action="troop:swordsman"]')).toBeInViewport({ ratio: 1 });
  expect(await page.evaluate(() => window.__game.model.battle!.started)).toBe(false);
});
