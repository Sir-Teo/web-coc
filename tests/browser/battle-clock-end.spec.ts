import { expect, test } from '@playwright/test';
import { developedSave } from '../fixtures/developed-village';
import { emptyArmy, emptySpells } from '../../src/game/army';

test('a timed result and completed replay show elapsed time, and a rewind restores the countdown', async ({
  page,
}) => {
  test.setTimeout(90000);
  const save = developedSave();
  save.tutorial = true;
  save.settings.sound = false;
  save.settings.music = false;
  save.army = { ...emptyArmy(), healer: 1, swordsman: 1 };
  save.spells = emptySpells();
  save.buildings.find((building) => building.kind === 'barracks')!.level = 10;
  await page.addInitScript(
    (save) => localStorage.setItem('crown-clan-save-v1', JSON.stringify(save)),
    save,
  );
  await page.goto('/?lazyart');
  await page.locator('#loading').waitFor({ state: 'detached' });
  await page.evaluate(() => {
    const { model } = window.__game;
    const step = model.step;
    model.step = () => {};
    model.restoreClockForTest = () => {
      model.step = step;
    };
  });
  await page.locator('.train-add').click();
  await page.locator('[data-action="practice"]').last().click();
  await page.waitForFunction(() => !window.__game.scene.scoutingArtNotice());
  await page.evaluate(() => {
    const { model, scene } = window.__game;
    scene.paused = true;
    model.restoreClockForTest();
    model.step(0.05); // The recording includes one scouting tick.
    model.activeTroop = 'healer';
    if (!model.deploy(1.5, 1.5)) throw Error('Could not deploy the Healer');
    while (model.battle.elapsed < 179.94 && !model.battle.finished) model.step(0.05);
    model.changed();
  });

  const clock = page.locator('.battle-clock');
  await expect(clock).toContainText('BATTLE ENDS IN');
  await expect(page.locator('#battle-timer')).toHaveText('0:01');
  await expect(page.locator('.result-modal')).toHaveCount(0);
  await page.evaluate(() => {
    const { model, scene } = window.__game;
    while (!model.battle.finished) model.step(0.05);
    scene.paused = false;
  });
  await expect(page.locator('.result-modal')).toBeVisible();
  await expect(clock).toContainText('TIME ELAPSED');
  await expect(page.locator('#battle-timer')).toHaveText('3:00');

  await page.getByRole('button', { name: 'Watch replay', exact: true }).click();
  await page.getByRole('slider', { name: 'Replay position' }).press('End');
  await expect(page.locator('.replay-status')).toContainText('Replay complete');
  await expect(page.locator('#replay-time')).toHaveText('3:00 / 3:00');
  await expect(clock).toContainText('TIME ELAPSED');
  await expect(page.locator('#battle-timer')).toHaveText('3:00');

  await page.locator('[data-action="replay-jump:-10"]').click();
  await expect(clock).toContainText('BATTLE ENDS IN');
  await expect(page.locator('#battle-timer')).not.toHaveText('3:00');
});
