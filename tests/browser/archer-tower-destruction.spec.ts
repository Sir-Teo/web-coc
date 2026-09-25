import { expect, test } from '@playwright/test';
test('native tower destruction replaces generic effects and retires into the ruin', async ({
  page,
  browserName,
}) => {
  await page.setViewportSize({ width: 950, height: 620 });
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('#loading').waitFor({ state: 'detached' });
  const report = await page.evaluate(async () => {
    const { scene, game } = window.__game;
    const { archerTowerBattle } = await import('/tests/fixtures/archer-tower-battle.ts');
    const { archerTowerDestructionPoses } = await import('/src/game/archer-tower-effects.ts');
    const { villageArcherTowerPoses } = await import('/src/game/archer-tower-scene.ts');
    const { NativeSceneView } = await import('/src/game/native-scene-view.ts');
    const { iso } = await import('/src/game/scene.ts');
    scene.paused = true;
    const model = archerTowerBattle(10);
    scene.model = model;
    const battle = model.battle;
    const tower = battle.buildings.find((b) => b.kind === 'archertower');
    const events = [];
    model.onEffect = (fx) => events.push(fx);
    model.damage(tower, tower.hp, 10);
    scene.sync();
    let generic = 0;
    const play = scene.audio.play;
    scene.audio.play = () => generic++;
    scene.effect(events.find((fx) => fx.type === 'destroy'));
    scene.audio.play = play;
    battle.elapsed = 10.15;
    const view = scene.villageArcherTowers;
    const cues = view.render([tower], battle.elapsed, iso, battle.elapsed, false, battle);
    const live = view.effects.size;
    const resident = view.views.get(tower.id).resident.objects.length;
    view.render([tower], 0, iso, battle.elapsed, true, battle);
    const reduced = view.effects.size;
    const reducedAudio = view.render([tower], 0, iso, battle.elapsed, true, battle).length;
    battle.elapsed = 13;
    view.render([tower], battle.elapsed, iso, battle.elapsed, false, battle);
    const expired = view.effects.size;
    battle.elapsed = 10.15;
    view.render([tower], battle.elapsed, iso, battle.elapsed, false, battle);
    const restored = view.effects.size;
    document.querySelector<HTMLElement>('#ui')!.style.display = 'none';
    scene.tweens.pauseAll();
    for (const child of scene.children.list) child.setVisible(false);
    scene.cameras.main.setScroll(0, 0).setZoom(1).setBackgroundColor('#304135');
    for (const [index, age] of [0.025, 0.15, 0.4, 0.8, 1.2, 1.6, 2, 2.3].entries()) {
      const x = (index % 4) * 470 + 230,
        y = Math.floor(index / 4) * 570 + 360;
      battle.elapsed = 10 + age;
      scene.add.text(x - 170, y - 280, `L10 destruction ${age}s`, { fontSize: '24px' });
      new NativeSceneView(scene, 'archer-tower-body').render(
        villageArcherTowerPoses(tower, age).body,
        x,
        y,
        y,
      );
      for (const pose of archerTowerDestructionPoses(battle, false, () => ({ x, y })))
        new NativeSceneView(scene, 'archer-tower-body').render(
          pose.poses,
          pose.x,
          pose.y,
          pose.depth,
        );
    }
    await new Promise((r) => game.events.once('postrender', r));
    return {
      generic,
      live,
      resident,
      reduced,
      reducedAudio,
      expired,
      restored,
      cues: cues.length,
      gl: game.renderer.gl.getError(),
    };
  });
  expect(report).toEqual({
    generic: 0,
    live: 43,
    resident: 0,
    reduced: 0,
    reducedAudio: 1,
    expired: 0,
    restored: 43,
    cues: 1,
    gl: 0,
  });
  await page.screenshot({ path: `output/playtest/archer-tower-destruction-${browserName}.png` });
});
