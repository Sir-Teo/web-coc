import { expect, test } from '@playwright/test';
import { developedSave } from '../fixtures/developed-village';
import { makeBuilding } from '../../src/game/model';

test.use({ viewport: { width: 568, height: 320 }, hasTouch: true, isMobile: true });

test('King card distinguishes a spent activation from active Vial under reduced motion', async ({
  page,
}) => {
  const save = developedSave();
  save.buildings.push(makeBuilding(save.nextId++, 'herohall', 35, 30, 1));
  save.king = { level: 1 };
  save.heroLineup = ['king'];
  save.tutorial = true;
  save.settings.reducedMotion = true;
  save.settings.manualHeroAbilities = true;
  await page.addInitScript(
    (save) => localStorage.setItem('crown-clan-save-v1', JSON.stringify(save)),
    save,
  );
  await page.goto('/?lazyart');
  await page.locator('#loading').waitFor({ state: 'detached' });
  await page.locator('.train-add').tap();
  await page.locator('[data-action="practice"]').last().tap();
  const king = page.locator('[data-action="hero-select:king"]');
  await expect(king).toHaveAccessibleName(/Deploy King/);
  await page.evaluate(() => {
    const { model, scene } = window.__game;
    scene.paused = true;
    for (let x = 1; x < 46; x += 0.5) {
      for (let y = 1; y < 46; y += 0.5) {
        if (!model.deployBlocked(x, y) && model.deployNativeHero('king', x, y)) return;
      }
    }
    throw Error('No legal King deployment');
  });
  await expect(king).toHaveAccessibleName(/Activate ability/);
  await king.tap();
  await expect(king).toHaveAccessibleName(/Rage Vial active, 10 seconds remaining/);
  await expect(king).toBeDisabled();
  await expect(king).toHaveClass(/vial-active/);
  await page.evaluate(() => {
    const { model } = window.__game;
    while (model.battle.elapsed < 2.05 && !model.battle.finished) model.step(0.05);
    model.changed();
  });
  await expect(king).toHaveAccessibleName(/Rage Vial active, 8 seconds remaining/);
  await page.evaluate(() => {
    const { model } = window.__game;
    while (model.battle.elapsed < 10.05 && !model.battle.finished) model.step(0.05);
    model.changed();
  });
  await expect(king).toHaveAccessibleName(/Ability used/);
  await expect(king).not.toHaveClass(/vial-active/);
});
