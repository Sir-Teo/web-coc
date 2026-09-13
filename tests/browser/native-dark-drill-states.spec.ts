import { expect, test } from '@playwright/test';
test('original Drill state layers render across all eleven tiers', async ({
  page,
  browserName,
}) => {
  await page.setViewportSize({ width: 1250, height: 1050 });
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.ready);
  await page.locator('#loading').waitFor({ state: 'detached' });
  const result = await page.evaluate(async () => {
    const { scene, game } = window.__game;
    const { DARK_DRILL_GRAPH, darkDrillPoses } = await import('/src/game/dark-drill-art.ts');
    const { preloadNativeMeshes } = await import('/src/game/native-mesh-scene.ts');
    const { NativeSceneView } = await import('/src/game/native-scene-view.ts');
    scene.paused = true;
    document.querySelector<HTMLElement>('#ui')!.style.display = 'none';
    for (const child of scene.children.list) child.setVisible(false);
    scene.cameras.main.setScroll(0, 0).setZoom(1).setBackgroundColor('#304135');
    preloadNativeMeshes(scene, DARK_DRILL_GRAPH, 'drill-states');
    await new Promise<void>((resolve) => {
      scene.load.once('complete', resolve);
      scene.load.start();
    });
    const counts = [];
    for (let level = 1; level <= 11; level++) {
      for (const [column, state] of [
        'working',
        'idle',
        'constructing',
        'upgrading',
        'ruin',
      ].entries()) {
        const view = new NativeSceneView(scene, 'drill-states');
        view.render(
          darkDrillPoses(level, state, 8, 99, [1.2, 0, 0, 0, 1.2, 0]),
          column * 450 + 225,
          level * 175,
          level * 175,
        );
        counts.push(view.objects.length);
      }
    }
    await new Promise((resolve) => game.events.once('postrender', resolve));
    return {
      counts,
      gl: game.renderer.gl.getError(),
      height: game.renderer.gl.drawingBufferHeight,
    };
  });
  expect(result.counts).toHaveLength(55);
  expect(result.counts.every((count) => count > 0)).toBe(true);
  expect(result.height).toBeGreaterThanOrEqual(2050);
  expect(result.gl).toBe(0);
  await page.screenshot({ path: `output/playtest/dark-drill-states-${browserName}.png` });
});
