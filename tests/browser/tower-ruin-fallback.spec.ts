import { expect, test } from '@playwright/test';
import { makeBuilding } from '../../src/game/model';
import { wizardTowerVillage } from '../fixtures/wizard-tower-battle';

test('Wizard and Bomb Towers keep rubble until the authored ruin pages recover', async ({
  page,
}) => {
  test.setTimeout(90000);
  const bodyPages =
    /\/assets\/buildings\/(?:wizard-tower-native|bombtower-native)\/body\/texture-25\.(?:png|webp)$/;
  await page.route(bodyPages, (route) => route.abort());
  const save = wizardTowerVillage(1);
  save.buildings.push(makeBuilding(7, 'bombtower', 21, 18, 1));
  save.nextId = 8;
  await page.addInitScript(
    (village) => localStorage.setItem('crown-clan-save-v1', JSON.stringify(village)),
    save,
  );
  await page.goto('/?lazyart');
  await page.locator('#loading').waitFor({ state: 'detached' });
  await page.locator('.train-add').click();
  await page.locator('[data-action="practice"]').last().click();
  await page.waitForFunction(
    () => window.__game.model.battle && !window.__game.scene.scoutingArtNotice(),
  );
  const rubble = () =>
    page.evaluate(() => {
      const { scene } = window.__game;
      return [scene.wizardTowerPresentation, scene.bombTowerPresentation].map((tower, i) => {
        const id = 6 + i;
        const fallback = scene.sprites.get(id);
        return {
          fallback: fallback.visible && fallback.alpha > 0 ? fallback.texture.key : null,
          authored: !!tower.towers
            .get(id)
            ?.objects.some((object) => object.visible && object.alpha > 0),
        };
      });
    });
  await page.evaluate(() => {
    const { model } = window.__game;
    for (const b of model.battle.buildings) {
      if (b.id === 6 || b.id === 7) model.damage(b, b.maxHp);
    }
    model.changed();
  });
  await expect.poll(rubble).toEqual(Array(2).fill({ fallback: 'ruins-stone', authored: false }));

  await page.unroute(bodyPages);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect
    .poll(rubble, { timeout: 30000 })
    .toEqual(Array(2).fill({ fallback: null, authored: true }));
});
