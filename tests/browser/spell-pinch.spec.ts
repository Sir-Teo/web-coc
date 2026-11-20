import { expect, test } from '@playwright/test';
import { useDevelopedVillage } from './developed-village';

test.use({ viewport: { width: 390, height: 650 }, isMobile: true, hasTouch: true });

test('pinching the scouting banner across rotation keeps the next cast on target', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'Uses Chromium touch injection');
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await useDevelopedVillage(page);
  await page.locator('[data-action="skip-tutorial"]').tap();
  await page.evaluate(() => {
    window.__game.model.state.spells.lightning = 2;
    window.__game.model.changed();
  });
  await page.locator('.attack-btn').tap();
  await page.locator('[data-action="practice"]').tap();
  await page.waitForFunction(() => !window.__game.scene.battleArtPending());
  await page.locator('[data-action="spell:lightning"]').tap();

  const cdp = await page.context().newCDPSession(page);
  const pair = (x: number, y: number, distance: number) => [
    { x: x - distance, y, id: 1 },
    { x: x + distance, y, id: 2 },
  ];
  const banner = (await page.locator('.prep-banner').boundingBox())!;
  const x = banner.x + banner.width / 2;
  const y = banner.y + banner.height / 2;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pair(x, y, 35) });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pair(x, y, 38) });
  await page.setViewportSize({ width: 650, height: 390 });
  await page.waitForFunction(() => window.__game.game.canvas.getBoundingClientRect().width === 650);

  const frame = () =>
    page.evaluate(() => {
      const { scene, model } = window.__game;
      const camera = scene.cameras.main;
      return {
        x: camera.scrollX + camera.width / 2,
        y: camera.scrollY + camera.height / 2,
        zoom: camera.zoom,
        selected: model.activeSpell,
        stock: model.battle!.spells.lightning,
      };
    });
  const rotated = await frame();
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: pair(280, 185, 48),
  });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: pair(295, 182, 72),
  });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  expect(await page.evaluate(() => window.visualViewport?.scale)).toBe(1);
  expect(await frame()).toEqual({ ...rotated, selected: 'lightning', stock: 2 });

  const target = await page.evaluate(() => {
    const { scene, model, game } = window.__game;
    for (const building of model.battle!.buildings) {
      const gridX = building.x + 0.5;
      const gridY = building.y + 0.5;
      const p = scene.screenFor(gridX, gridY);
      if (document.elementFromPoint(p.x, p.y) === game.canvas)
        return { x: p.x, y: p.y, gridX, gridY };
    }
    throw Error('No visible Practice target');
  });
  await page.touchscreen.tap(target.x, target.y);
  expect((await frame()).stock).toBe(1);
  await page.locator('[data-action="surrender"]').tap();
  await page.locator('[data-action="end"]').tap();
  const actions = await page.evaluate(() => window.__game.model.state.raidLog![0].replay!.actions);
  expect(actions.map(({ type }) => type)).toEqual(['spell', 'end']);
  expect(actions[0]).toMatchObject({ kind: 'lightning' });
  if (actions[0].type !== 'spell') throw Error('Missing spell action');
  expect(actions[0].x).toBeCloseTo(target.gridX, 1);
  expect(actions[0].y).toBeCloseTo(target.gridY, 1);

  await page.getByRole('button', { name: 'Watch replay', exact: true }).tap();
  await page.getByRole('slider', { name: 'Replay position' }).press('End');
  await expect(page.locator('.replay-status')).toContainText('Replay complete');
  expect((await frame()).stock).toBe(1);
});
