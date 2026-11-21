import { expect, test } from '@playwright/test';
import { useDevelopedVillage } from './developed-village';

test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

test('an off-centre edit drag preserves the grab point through preview and save', async ({
  page,
}) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').tap();
  await expect(page.locator('#loading')).toBeHidden();
  await useDevelopedVillage(page);
  await page.getByRole('button', { name: 'Edit village layout', exact: true }).tap();

  const initial = { x: 15, y: 10 };
  const moved = { x: 16, y: 10 };
  const id = await page.evaluate(
    ({ x, y }) =>
      window.__game.model.state.buildings.find(
        (b) => b.kind === 'elixirstorage' && b.x === x && b.y === y,
      )!.id,
    initial,
  );
  const positions = () =>
    page.evaluate((id) => {
      const { model } = window.__game;
      const { x, y } = model.state.buildings.find((b) => b.id === id)!;
      return { x, y, selected: model.selected, preview: model.hasBuildingDrag };
    }, id);
  const points = await page.evaluate((id) => {
    const { scene, model } = window.__game;
    const building = model.state.buildings.find((b) => b.id === id)!;
    // Pick near the edge of the footprint, then move exactly one tile east.
    const x = building.x + 0.35;
    const y = building.y + 2.55;
    scene.cameras.main.centerOn(896 + (x - y) * 32, 112 + (x + y) * 16);
    const points = [scene.screenFor(x, y), scene.screenFor(x + 1, y)];
    if (points.some((point) => document.elementFromPoint(point.x, point.y) !== scene.game.canvas))
      throw Error('The edited tile is under a HUD control');
    return points;
  }, id);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [points[0]] });
  await expect(page.locator('.building-context')).toHaveCount(0);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [points[1]] });
  await expect.poll(positions).toEqual({ ...moved, selected: id, preview: true });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(positions).toEqual({ ...moved, selected: id, preview: false });
  await expect(page.locator('.building-context h2')).toHaveText('Elixir Storage');

  await page.reload();
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await expect.poll(positions).toMatchObject(moved);
});
