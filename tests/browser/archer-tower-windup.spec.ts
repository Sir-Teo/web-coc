import { expect, test } from '@playwright/test';
test('live native archer draws before release and reconstructs its windup pose', async ({
  page,
  browserName,
}) => {
  await page.setViewportSize({ width: 900, height: 500 });
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.ready);
  await page.locator('#loading').waitFor({ state: 'detached' });
  const report = await page.evaluate(async () => {
    const { scene, game } = window.__game;
    const { archerTowerBattle } = await import('/tests/fixtures/archer-tower-battle.ts');
    const { villageArcherTowerPoses } = await import('/src/game/archer-tower-scene.ts');
    const { NativeSceneView } = await import('/src/game/native-scene-view.ts');
    const model = archerTowerBattle(10);
    scene.model = model;
    scene.paused = true;
    const b = model.battle,
      tower = b.buildings.find((v) => v.kind === 'archertower');
    const snapshots = [];
    let draw = 0;
    for (let i = 1; i <= 8; i++) {
      model.step(0.05);
      scene.sync();
      scene.drawOverlay(128);
      const pose = scene.villageArcherTowers.views
        .get(tower.id)
        .resident.objects[0].getData('nativeTowerArcher');
      if (pose.action === 'attack' && pose.time < 5 / 24) {
        if (i < 5 && b.archerTowerShots?.[tower.id]) throw Error('Shot released before draw');
        draw++;
      }
      const poses = villageArcherTowerPoses(tower, b.elapsed, b);
      if (
        JSON.stringify(poses) !==
        JSON.stringify(villageArcherTowerPoses(tower, b.elapsed, JSON.parse(JSON.stringify(b))))
      )
        throw Error('Windup pose did not reconstruct');
      snapshots.push({
        poses,
        time: b.elapsed,
        action: pose.action,
        frame: Math.floor(pose.time * 24 + 1e-8),
      });
    }
    if (!b.archerTowerShots?.[tower.id]) throw Error('No release after windup');
    document.querySelector<HTMLElement>('#ui')!.style.display = 'none';
    scene.tweens.pauseAll();
    for (const child of scene.children.list) child.setVisible(false);
    scene.cameras.main.setScroll(0, 0).setZoom(1).setBackgroundColor('#304135');
    snapshots.forEach(({ poses, time, action, frame }, i) => {
      const x = (i % 4) * 440 + 220,
        y = Math.floor(i / 4) * 450 + 270;
      scene.add.text(x - 170, y - 220, `${time.toFixed(2)}s ${action} frame ${frame}`, {
        fontSize: '20px',
      });
      new NativeSceneView(scene, 'archer-tower-body').render(poses.body, x, y, 0);
      new NativeSceneView(scene, 'archer-tower-resident').render(poses.residents, x, y, 1);
    });
    await new Promise((r) => game.events.once('postrender', r));
    return { draw, gl: game.renderer.gl.getError() };
  });
  expect(report.draw).toBeGreaterThanOrEqual(4);
  expect(report.gl).toBe(0);
  await page.screenshot({ path: `output/playtest/archer-tower-windup-${browserName}.png` });
});
