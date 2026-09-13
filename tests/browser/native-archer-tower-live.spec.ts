import { expect, test } from '@playwright/test';
test('live native Archer Towers render and use source selection bounds', async ({
  page,
  browserName,
}) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.ready);
  await page.locator('#loading').waitFor({ state: 'detached' });
  await page.locator('[data-action="skip-tutorial"]').click();
  const report = await page.evaluate(async () => {
    const { model, scene, game } = window.__game;
    const { makeBuilding } = await import('/src/game/model.ts');
    const { villageArcherTowerBounds } = await import('/src/game/archer-tower-scene.ts');
    const { iso } = await import('/src/game/scene.ts');
    scene.paused = true;
    model.state.settings.reducedMotion = true;
    model.state.obstacles = [];
    let checked = 0;
    for (let level = 1; level <= 21; level++)
      for (const state of ['ready', 'constructing', 'upgrading', 'ruin']) {
        const b = makeBuilding(999, 'archertower', 20, 20, level);
        if (state === 'constructing') b.constructing = true;
        if (state === 'upgrading') b.upgradeEnd = model.clock + 60000;
        if (state === 'ruin') b.hp = 0;
        model.state.buildings = [b];
        scene.sync();
        scene.drawOverlay(128);
        const bounds = villageArcherTowerBounds(b, 0),
          p = iso(21.5, 21.5);
        if (scene.sprites.get(999).alpha !== 0) throw Error('Legacy sprite remains visible');
        if (!scene.villageArcherTowers.views.get(999)?.body.objects.length)
          throw Error('Native Archer Tower missing');
        const resident = scene.villageArcherTowers.views.get(999).resident.objects.length;
        if (state === 'constructing' || state === 'ruin' ? resident !== 0 : resident === 0)
          throw Error('Incorrect resident state');
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
    model.state.buildings = Array.from({ length: 21 }, (_, i) =>
      makeBuilding(i + 1, 'archertower', 10 + (i % 7) * 4, 12 + Math.floor(i / 7) * 10, i + 1),
    );
    scene.sync();
    scene.drawOverlay(128);
    return {
      checked,
      views: scene.villageArcherTowers.views.size,
      gl: game.renderer.gl.getError(),
    };
  });
  expect(report).toEqual({ checked: 84, views: 21, gl: 0 });
  await page.screenshot({ path: `output/playtest/archer-tower-live-${browserName}.png` });
  expect(
    await page.evaluate(() => {
      const { model, scene } = window.__game;
      model.startBattle(0, true);
      scene.sync();
      scene.drawOverlay(128);
      if (scene.villageArcherTowers.views.size !== 0)
        throw Error('Village views leaked into battle');
      if (![...scene.sprites.values()].every((sprite) => sprite.alpha > 0))
        throw Error('Battle tower sprite hidden');
      model.returnHome();
      scene.sync();
      scene.drawOverlay(128);
      if (scene.villageArcherTowers.views.size !== 21) throw Error('Village views not restored');
      model.state.buildings = [];
      scene.sync();
      scene.drawOverlay(128);
      return scene.villageArcherTowers.views.size;
    }),
  ).toBe(0);
});
