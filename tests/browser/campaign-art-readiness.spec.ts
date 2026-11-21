import { expect, test } from '@playwright/test';
import { freshNativeCampaign } from '../../src/game/native-campaign';
import { developedSave } from '../fixtures/developed-village';

test.use({ viewport: { width: 568, height: 320 }, hasTouch: true, isMobile: true });

test('a touch released as Campaign art becomes ready prompts a fresh deployment tap', async ({
  page,
  context,
}) => {
  test.setTimeout(90000);
  const save = developedSave();
  save.tutorial = true;
  save.buildings = save.buildings.filter((building) => building.kind !== 'mortar');
  save.nativeCampaign = freshNativeCampaign();
  save.nativeCampaign.stars.fill(1, 0, 23);

  let openArtGate!: () => void;
  const artGate = new Promise<void>((resolve) => (openArtGate = resolve));
  await page.route(/\/assets\/buildings\/mortar-native\//, async (route) => {
    await artGate;
    await route.continue();
  });
  try {
    await page.addInitScript(
      (save) => localStorage.setItem('crown-clan-save-v1', JSON.stringify(save)),
      save,
    );
    await page.goto('/?lazyart');
    await page.locator('#loading').waitFor({ state: 'detached' });
    await page.locator('.attack-btn').tap();
    await page.locator('[data-action="attack:23"]').tap();
    await page.waitForFunction(() => window.__game.scene.scoutingArtNotice());
    await page.locator('[data-action="troop:swordsman"]').tap();

    const point = await page.evaluate(() => {
      const { model, scene } = window.__game;
      for (let y = 80; y < innerHeight - 90; y += 8)
        for (let x = 35; x < innerWidth - 35; x += 8) {
          if (document.elementFromPoint(x, y) !== scene.game.canvas) continue;
          const tile = scene.gridAtScreen(x, y);
          if (!model.deployBlocked(tile.x, tile.y)) return { x, y };
        }
      throw Error('No open deployment point');
    });
    const cdp = await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
    await page.waitForFunction(() => window.__game.scene.down?.artBlocked);
    openArtGate();
    await page.waitForFunction(() => !window.__game.scene.scoutingArtNotice());
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

    const state = () =>
      page.evaluate(() => {
        const { battle } = window.__game.model;
        return { units: battle.units.length, stock: battle.remaining.swordsman };
      });
    const toast = page.locator('#toast');
    await expect(toast).toContainText('Battle ready. Tap the battlefield again.');
    expect(await state()).toEqual({ units: 0, stock: 12 });
    await page.touchscreen.tap(point.x, point.y);
    await expect.poll(state).toEqual({ units: 1, stock: 11 });
    await expect(toast).not.toContainText('Battle ready');
  } finally {
    openArtGate();
  }
});
