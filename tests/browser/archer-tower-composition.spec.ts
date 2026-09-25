import { test, expect } from '@playwright/test';
test('combined normal and lowered Archer Towers retain their resident variants', async ({
  page,
  browserName,
}) => {
  await page.setViewportSize({ width: 950, height: 920 });
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('#loading').waitFor({ state: 'detached' });
  const result = await page.evaluate(async () => {
    const { scene, game } = window.__game;
    const { ARCHER_TOWER_GRAPH, TOWER_ARCHER_GRAPH, archerTowerComposition } =
      await import('/src/game/archer-tower-art.ts');
    const { preloadNativeMeshes } = await import('/src/game/native-mesh-scene.ts');
    const { NativeSceneView } = await import('/src/game/native-scene-view.ts');
    scene.paused = true;
    document.querySelector('#ui').style.display = 'none';
    for (const child of scene.children.list) child.setVisible(false);
    scene.cameras.main.setScroll(0, 0).setZoom(1).setBackgroundColor('#304135');
    preloadNativeMeshes(scene, ARCHER_TOWER_GRAPH, 'compose-body');
    preloadNativeMeshes(scene, TOWER_ARCHER_GRAPH, 'compose-archer');
    await new Promise<void>((r) => {
      scene.load.once('complete', r);
      scene.load.start();
    });
    let count = 0;
    for (let level = 1; level <= 21; level++)
      for (const alternate of level < 7 ? [false] : [false, true]) {
        const x = (count % 6) * 300 + 150,
          y = Math.floor(count / 6) * 280 + 95;
        scene.add.text(x - 70, y - 85, `${level} · ${alternate ? 'Lowered' : 'Normal'}`, {
          fontSize: '18px',
          color: '#fff',
        });
        const poses = archerTowerComposition(level, 'ready', 0, alternate);
        new NativeSceneView(scene, 'compose-body').render(poses.body, x, y, 0);
        new NativeSceneView(scene, 'compose-archer').render(poses.residents, x, y, 1);
        if (!poses.body.length || !poses.residents.length) throw Error('Missing combined artwork');
        count++;
      }
    await new Promise((r) => game.events.once('postrender', r));
    return { count, gl: game.renderer.gl.getError(), height: game.renderer.gl.drawingBufferHeight };
  });
  expect(result.count).toBe(36);
  expect(result.gl).toBe(0);
  expect(result.height).toBeGreaterThanOrEqual(1780);
  await page.screenshot({ path: `output/playtest/archer-tower-composition-${browserName}.png` });
});
