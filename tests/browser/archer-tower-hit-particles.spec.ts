import { expect, test } from '@playwright/test';
test('native arrow impacts render source emitters and clean up across motion settings', async ({
  page,
  browserName,
}) => {
  await page.setViewportSize({ width: 1000, height: 600 });
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('#loading').waitFor({ state: 'detached' });
  const result = await page.evaluate(async () => {
    const { scene, game } = window.__game;
    const { archerTowerBattle } = await import('/tests/fixtures/archer-tower-battle.ts');
    const { archerTowerHitPoses } = await import('/src/game/archer-tower-effects.ts');
    const { NativeSceneView } = await import('/src/game/native-scene-view.ts');
    const { iso } = await import('/src/game/scene.ts');
    scene.paused = true;
    const model = archerTowerBattle(10);
    scene.model = model;
    const battle = model.battle;
    battle.elapsed = 10.075;
    battle.archerTowerHits = [
      { id: 'gallery', sourceId: 6, level: 10, at: 10, x: 20, y: 20, air: false },
    ];
    const view = scene.villageArcherTowers;
    view.render([], 0, iso, battle.elapsed, false, battle);
    const live = view.effects.size;
    let generic = 0;
    const impact = scene.combatEffects.impact;
    scene.combatEffects.impact = () => generic++;
    scene.effect({
      type: 'impact',
      projectileId: 'gallery',
      weapon: 'arrow',
      x: 20,
      y: 20,
      toX: 20,
      toY: 20,
    });
    scene.combatEffects.impact = impact;
    view.render([], 0, iso, battle.elapsed, true, battle);
    const reduced = view.effects.size;
    view.render([], 0, iso, battle.elapsed, false, battle);
    const restored = view.effects.size;
    battle.elapsed = 12;
    view.render([], 0, iso, battle.elapsed, false, battle);
    const expired = view.effects.size;
    document.querySelector<HTMLElement>('#ui')!.style.display = 'none';
    scene.tweens.pauseAll();
    for (const child of scene.children.list) child.setVisible(false);
    scene.cameras.main.setScroll(0, 0).setZoom(1).setBackgroundColor('#304135');
    let cells = 0;
    for (const level of [1, 10])
      for (const air of [false, true]) {
        const row = (level === 1 ? 0 : 2) + Number(air);
        for (const [column, age] of [0.02, 0.075, 0.15, 0.35, 0.8].entries()) {
          const x = column * 390 + 195,
            y = row * 280 + 210;
          battle.elapsed = 10 + age;
          Object.assign(battle.archerTowerHits[0], { level, air });
          scene.add.text(x - 170, y - 190, `L${level} ${air ? 'air' : 'ground'} ${age}s`, {
            fontSize: '22px',
          });
          scene.add.circle(x, y, 4, 0xffffff);
          for (const pose of archerTowerHitPoses(battle, false, () => ({ x, y })))
            new NativeSceneView(scene, 'archer-tower-body').render(
              pose.poses,
              pose.x,
              pose.y,
              pose.depth,
            );
          cells++;
        }
      }
    await new Promise((r) => game.events.once('postrender', r));
    return { live, generic, reduced, restored, expired, cells, gl: game.renderer.gl.getError() };
  });
  expect(result).toEqual({
    live: 15,
    generic: 0,
    reduced: 0,
    restored: 15,
    expired: 0,
    cells: 20,
    gl: 0,
  });
  await page.screenshot({ path: `output/playtest/archer-tower-hit-particles-${browserName}.png` });
});
