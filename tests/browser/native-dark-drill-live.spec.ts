import { expect, test } from '@playwright/test';
test('live native Drills render and use source selection bounds', async ({ page, browserName }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('#loading').waitFor({ state: 'detached' });
  await page.locator('[data-action="skip-tutorial"]').click();
  const report = await page.evaluate(async () => {
    const { model, scene, game } = window.__game;
    const { makeBuilding } = await import('/src/game/model.ts');
    const { darkDrillBounds } = await import('/src/game/dark-drill-art.ts');
    const { iso } = await import('/src/game/scene.ts');
    scene.paused = true;
    model.state.settings.reducedMotion = true;
    model.state.obstacles = [];
    let checked = 0;
    for (let level = 1; level <= 11; level++)
      for (const state of ['working', 'idle', 'constructing', 'upgrading', 'ruin']) {
        const b = makeBuilding(999, 'darkdrill', 20, 20, level);
        if (state === 'idle') b.stored = 100000;
        if (state === 'constructing') b.constructing = true;
        if (state === 'upgrading') b.upgradeEnd = model.clock + 60000;
        if (state === 'ruin') b.hp = 0;
        model.state.buildings = [b];
        scene.sync();
        scene.drawOverlay(128);
        const bounds = darkDrillBounds(b, 0),
          p = iso(21.5, 21.5);
        if (scene.sprites.get(999).alpha !== 0) throw Error('Legacy sprite remains visible');
        if (!scene.darkDrillPresentation.drills.get(999)?.objects.length)
          throw Error('Native Drill missing');
        const picked = scene.pickBuilding(
          p.x + (bounds[0] + bounds[2]) / 2,
          p.y + (bounds[1] + bounds[3]) / 2,
          { x: -1, y: -1 },
        );
        if (picked?.id !== 999) throw Error(`Source bounds miss ${level} ${state}`);
        if (
          scene.pickBuilding(p.x + bounds[2] + 1, p.y + (bounds[1] + bounds[3]) / 2, {
            x: -1,
            y: -1,
          })
        )
          throw Error('Outside source bounds selected');
        checked++;
      }
    model.state.buildings = Array.from({ length: 11 }, (_, i) =>
      makeBuilding(i + 1, 'darkdrill', 10 + (i % 4) * 7, 12 + Math.floor(i / 4) * 8, i + 1),
    );
    scene.sync();
    scene.drawOverlay(128);
    return {
      checked,
      views: scene.darkDrillPresentation.drills.size,
      gl: game.renderer.gl.getError(),
    };
  });
  expect(report).toEqual({ checked: 55, views: 11, gl: 0 });
  await page.screenshot({ path: `output/playtest/dark-drill-live-${browserName}.png` });
  expect(
    await page.evaluate(() => {
      const { model, scene } = window.__game;
      model.state.buildings = [];
      scene.sync();
      scene.drawOverlay(128);
      return scene.darkDrillPresentation.drills.size;
    }),
  ).toBe(0);
});
