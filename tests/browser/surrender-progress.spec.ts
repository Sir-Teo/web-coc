import { expect, test } from '@playwright/test';
import { defaultSpellLevels } from '../../src/game/army';
import { makeBuilding } from '../../src/game/model';
import { wizardTowerVillage } from '../fixtures/wizard-tower-battle';

for (const practice of [false, true]) {
  test.describe(practice ? 'Practice' : 'Campaign', () => {
    test.use({
      viewport: practice ? { width: 568, height: 320 } : { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
    });

    test('surrender reflects battle progress without replacing the confirmation', async ({
      page,
    }) => {
      const save = wizardTowerVillage();
      save.buildings[5] = makeBuilding(6, 'goldmine', 13, 13, 1);
      save.buildings.push(makeBuilding(7, 'spellfactory', 9, 9, 3));
      save.nextId = 8;
      save.spells.lightning = 1;
      save.spellLevels = { ...defaultSpellLevels(), lightning: 5 };
      save.settings.sound = false;
      await page.addInitScript(
        (json) => localStorage.setItem('crown-clan-save-v1', json),
        JSON.stringify(save),
      );
      await page.goto('/');
      await expect(page.locator('#loading')).toBeHidden();
      const tap = (action: string) => page.locator(`[data-action="${action}"]`).tap();
      await page.locator('.attack-btn').tap();
      await tap(practice ? 'practice' : 'attack:0');
      await page.waitForFunction(() => !window.__game.scene.battleArtPending());
      await tap('spell:lightning');
      const point = await page.evaluate((practice) => {
        const { model, scene } = window.__game;
        scene.paused = true;
        const target = model.battle!.buildings.find((building) =>
          practice ? building.kind === 'goldmine' : building.npc === 'tutorial-cannon',
        )!;
        for (const dx of [0, -0.75, 0.75, -1.5, 1.5]) {
          for (const dy of [0, -0.75, 0.75, -1.5, 1.5]) {
            if (Math.hypot(dx, dy) > 2) continue;
            const point = scene.screenFor(target.x + 1.5 + dx, target.y + 1.5 + dy);
            if (document.elementFromPoint(point.x, point.y) === window.__game.game.canvas)
              return point;
          }
        }
        throw Error('No visible point in Lightning range');
      }, practice);
      await page.touchscreen.tap(point.x, point.y);
      await tap('surrender');
      const dialog = page.getByRole('dialog', { name: 'End this battle?' });
      const quote = dialog.locator('.confirm-line');
      await expect(quote).toContainText('0% destruction');
      await expect(quote).toContainText('0 stars');
      const keepFighting = dialog.getByRole('button', { name: 'Keep fighting' });
      await keepFighting.focus();
      const focused = await keepFighting.elementHandle();
      const current = await page.evaluate(() => {
        const { model } = window.__game;
        for (let i = 0; i < 22; i++) model.step(0.05);
        const { destruction, stars } = model.battle!;
        return { destruction, stars };
      });
      expect(current.destruction).toBeGreaterThan(0);
      await expect(quote).toContainText(`${current.destruction}% destruction`);
      await expect(quote).toContainText(
        `${current.stars} ${current.stars === 1 ? 'star' : 'stars'}`,
      );
      expect(await focused!.evaluate((element) => element === document.activeElement)).toBe(true);
      await keepFighting.tap();
      await expect(dialog).toHaveCount(0);
      expect(await page.evaluate(() => window.__game.model.battle!.finished)).toBe(false);
      await tap('surrender');
      await tap('end');
      await expect(page.locator('#result-title')).toBeVisible();
      const result = await page.evaluate(() => window.__game.model.battle!.result);
      expect(result).toMatchObject(current);
      await page.getByRole('button', { name: 'Watch replay', exact: true }).tap();
      await page.getByRole('slider', { name: 'Replay position' }).press('End');
      const replayResult = await page.evaluate(() => {
        const { model } = window.__game;
        while (model.replay!.seeking) model.step(0.05);
        return model.battle!.result;
      });
      expect(replayResult).toEqual(result);
    });
  });
}
