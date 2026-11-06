import { expect, test } from '@playwright/test';

test('compact Ice Golem atlas preserves all 588 original animation frames and reflections', async ({
  page,
}) => {
  test.setTimeout(180000);
  await page.setViewportSize({ width: 1000, height: 1000 });
  await page.goto('/?lazyart');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  const report = await page.evaluate(async () => {
    const { default: evidence } = await import('/reference/characters/art.json');
    const { default: runtime } = await import('/reference/characters/ice_golem/icegolem-lvl5.json');
    const { nativeScenePoses } = await import('/src/game/native-mesh.ts');
    const { NativeSceneView, nativeSceneBounds } = await import('/src/game/native-scene-view.ts');
    const { preloadNativeMeshes } = await import('/src/game/native-mesh-scene.ts');
    const source = evidence.worlds['ice_golem/icegolem-lvl5'];
    const texture = source.textures['0'];
    const original = {
      ...source.graph,
      textures: {
        0: {
          path: texture.legacy.path,
          width: texture.legacy.width,
          height: texture.legacy.height,
        },
      },
      shapes: Object.fromEntries(
        Object.entries(source.graph.shapes).map(([id, commands]) => [
          id,
          commands.map(([t, vertices]) => [
            t,
            vertices.map((v, i) => (i % 4 >= 2 ? v / 65535 : v)),
          ]),
        ]),
      ),
    };
    const { scene, game } = window.__game;
    scene.paused = true;
    scene.tweens.pauseAll();
    game.loop.setFPSLimit(0);
    document.querySelector<HTMLElement>('#ui')!.style.display = 'none';
    for (const child of scene.children.list) child.setVisible(false);
    scene.cameras.main.useBounds = false;
    scene.cameras.main.setScroll(0, 0).setZoom(1).setBackgroundColor('#304135');
    preloadNativeMeshes(scene, original, 'ice-original');
    preloadNativeMeshes(scene, runtime, 'ice-compact');
    await new Promise<void>((resolve) => {
      scene.load.once('complete', resolve);
      scene.load.start();
    });
    const cases = Object.entries(runtime.exports).flatMap(([name, id]) =>
      runtime.clips[id].timeline.flatMap((_, frame) =>
        [1, -1].map((mirror) => ({ name, frame, mirror })),
      ),
    );
    const originalViews = Array.from(
      { length: 49 },
      () => new NativeSceneView(scene, 'ice-original'),
    );
    const compactViews = Array.from(
      { length: 49 },
      () => new NativeSceneView(scene, 'ice-compact'),
    );
    const capture = () =>
      new Promise<Uint8Array>((resolve) => {
        game.events.once('postrender', () => {
          const gl = game.renderer.gl;
          const data = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
          gl.readPixels(
            0,
            0,
            gl.drawingBufferWidth,
            gl.drawingBufferHeight,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            data,
          );
          resolve(data);
        });
      });
    let maximum = 0,
      total = 0,
      channels = 0,
      drawnPixels = 0;
    const pages = [];
    for (let start = 0; start < cases.length; start += 49) {
      const batch = cases.slice(start, start + 49);
      for (const view of compactViews) for (const object of view.objects) object.setVisible(false);
      const roots = batch.map((c) => {
        const time = c.frame / runtime.clips[runtime.exports[c.name]].fps;
        const bounds = nativeSceneBounds(
          nativeScenePoses(runtime, c.name, time, {}, [c.mirror, 0, 0, 0, 1, 0]),
        )!;
        const scale = Math.min(1.5, 120 / (bounds[2] - bounds[0]), 120 / (bounds[3] - bounds[1]));
        return {
          time,
          root: [
            c.mirror * scale,
            0,
            70 - ((bounds[0] + bounds[2]) * scale) / 2,
            0,
            scale,
            70 - ((bounds[1] + bounds[3]) * scale) / 2,
          ],
        };
      });
      for (const [i, c] of batch.entries())
        originalViews[i].render(
          nativeScenePoses(original, c.name, roots[i].time, {}, roots[i].root),
          (i % 7) * 140,
          Math.floor(i / 7) * 140,
          i,
        );
      const before = await capture();
      for (const view of originalViews) for (const object of view.objects) object.setVisible(false);
      for (const [i, c] of batch.entries())
        compactViews[i].render(
          nativeScenePoses(runtime, c.name, roots[i].time, {}, roots[i].root),
          (i % 7) * 140,
          Math.floor(i / 7) * 140,
          i,
        );
      const after = await capture();
      let pageMaximum = 0,
        changed = 0;
      for (let i = 0; i < before.length; i++) {
        const difference = Math.abs(before[i] - after[i]);
        pageMaximum = Math.max(pageMaximum, difference);
        total += difference;
        if (difference) changed++;
        if (i % 4 === 0 && (before[i] !== 48 || before[i + 1] !== 65 || before[i + 2] !== 53))
          drawnPixels++;
      }
      maximum = Math.max(maximum, pageMaximum);
      channels += before.length;
      pages.push({ cases: batch.length, maximum: pageMaximum, changed });
    }
    for (const view of [...originalViews, ...compactViews]) view.destroy();
    return {
      cases: cases.length,
      maximum,
      mean: total / channels,
      drawnPixels,
      pages,
      glError: game.renderer.gl.getError(),
    };
  });
  console.log(JSON.stringify(report));
  expect(report.cases).toBe(588);
  expect(report.drawnPixels).toBeGreaterThan(294000);
  expect(report.maximum).toBeLessThanOrEqual(1);
  expect(report.mean).toBeLessThan(0.01);
  expect(report.glError).toBe(0);
});
