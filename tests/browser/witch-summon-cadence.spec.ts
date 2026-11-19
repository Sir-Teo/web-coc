import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test('a Witch raises a capped second wave in a phone raid and its replay', async ({
  page,
}, info) => {
  await page.goto('/?lazyart');
  await expect(page.locator('#loading')).toBeHidden({ timeout: 30000 });
  await page.locator('[data-action="skip-tutorial"]').tap();
  await page.evaluate(async () => {
    const { makeBuilding } = await import('/src/game/model.ts');
    const m = window.__game.model;
    m.state.buildings = [makeBuilding(1, 'townhall', 20, 18, 11)];
    m.state.obstacles = [];
    m.state.army.witch = 1;
    m.changed();
  });
  await page.locator('.train-add').tap();
  await page.locator('.drawer-sheet [data-action="practice"]').tap();
  await page.waitForFunction(() => !window.__game.scene.battleArtPending());
  await page.locator('[data-action="troop:witch"]').tap();
  const point = await page.evaluate(() => {
    const { model, scene, game } = window.__game;
    for (let y = 1.5; y < 44; y++)
      for (let x = 1.5; x < 44; x++) {
        const p = scene.screenFor(x, y);
        if (
          !model.deployBlocked(x, y) &&
          p.y > innerHeight * 0.32 &&
          p.y < innerHeight * 0.62 &&
          document.elementFromPoint(p.x, p.y) === game.canvas
        )
          return p;
      }
    throw Error('No visible Witch deployment point');
  });
  await page.touchscreen.tap(point.x, point.y);
  await expect(page.locator('[data-action="troop:witch"] .troop-count')).toHaveText('x0');
  const live = await page.evaluate(() => {
    const { model, game } = window.__game;
    const children = () =>
      model.battle!.units.filter(
        (u) => u.kind === 'skeleton' && u.hp > 0 && (u.spawnedAt ?? 0) <= model.battle!.elapsed,
      );
    game.loop.sleep();
    try {
      // Let the ordinary recorded simulation reach the second wave; only rendering is paused.
      for (let tick = 0; tick < 240 && children().length < 6; tick++) model.step(0.05);
      return children().map(({ spawnedAt, level }) => ({ spawnedAt, level }));
    } finally {
      game.loop.wake();
    }
  });
  expect(live).toHaveLength(6);
  expect(live[4].spawnedAt! - live[0].spawnedAt!).toBeCloseTo(7, 8);
  expect(live.every((unit) => unit.level === 1)).toBe(true);
  await page.locator('[data-action="surrender"]').tap();
  await page.locator('[data-action="end"]').tap();
  await page.getByRole('button', { name: 'Watch replay' }).tap();
  await page.getByRole('slider', { name: 'Replay position' }).press('End');
  await expect(page.locator('.replay-status')).toContainText('Replay complete');
  expect(
    await page.evaluate(() =>
      window.__game.model
        .battle!.units.filter((u) => u.kind === 'skeleton' && u.hp > 0)
        .map(({ spawnedAt, level }) => ({ spawnedAt, level })),
    ),
  ).toEqual(live);
  await page.screenshot({ path: info.outputPath('witch-wave-replay.png') });
});
