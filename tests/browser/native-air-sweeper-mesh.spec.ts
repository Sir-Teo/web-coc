import { test, expect } from '@playwright/test';
import witness from '../fixtures/native-air-sweeper-mesh/manifest.json' with { type: 'json' };

// The original 2400×4800 source sheet must fit inside the physical drawing buffer.
test.use({ viewport: { width: 1250, height: 2450 }, deviceScaleFactor: 2 });

test('native Air Sweeper rotating parts, loading frames and original particles match source pixels and survive context restoration', async ({
  page,
  browserName,
}) => {
  test.setTimeout(90000);
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  const report = await page.evaluate(async (reference) => {
    const { compareSourcePixels } = await import('/tests/fixtures/source-pixel-comparison.ts');
    const { scene, game } = window.__game;
    const { default: world } = await import('/reference/air-sweeper/runtime.json');

    const { nativeScenePoses } = await import('/src/game/native-mesh.ts');
    const { preloadNativeMeshes } = await import('/src/game/native-mesh-scene.ts');
    const { NativeSceneView } = await import('/src/game/native-scene-view.ts');
    document.querySelector<HTMLElement>('#ui')!.style.display = 'none';
    scene.paused = true;
    scene.tweens.pauseAll();
    for (const child of scene.children.list) child.setVisible(false);
    scene.cameras.main.setScroll(0, 0).setZoom(1).setBackgroundColor(reference.background);
    preloadNativeMeshes(scene, world, 'air-sweeper-test-world');
    scene.load.image(
      'air-sweeper-source-reference',
      '/tests/fixtures/native-air-sweeper-mesh/reference.png',
    );
    await new Promise<void>((resolve) => {
      scene.load.once('complete', resolve);
      scene.load.start();
    });
    const views = reference.cases.map((c) => {
      const view = new NativeSceneView(scene, 'air-sweeper-test-world');
      const poses = c.base ? nativeScenePoses(world, c.base, 0, {}, c.root) : [];
      poses.push(...nativeScenePoses(world, c.export, c.time, c.controls, c.root));
      view.render(poses, c.x, c.y, 0);
      return view;
    });
    const gl = game.renderer.gl;
    if (gl.drawingBufferWidth < reference.width || gl.drawingBufferHeight < reference.height)
      throw Error(
        `Source comparison exceeds framebuffer: ${reference.width}×${reference.height} vs ${gl.drawingBufferWidth}×${gl.drawingBufferHeight}`,
      );
    const glErrors = [gl.getError()];
    const capture = () =>
      new Promise<Uint8Array>((resolve) =>
        game.events.once('postrender', () => {
          const pixels = new Uint8Array(reference.width * reference.height * 4);
          gl.readPixels(
            0,
            gl.drawingBufferHeight - reference.height,
            reference.width,
            reference.height,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            pixels,
          );
          glErrors.push(gl.getError());
          resolve(pixels);
        }),
      );
    const multisampled = await capture();
    const defaultFramebufferSamples = gl.getParameter(gl.SAMPLES);
    const node = game.renderer.renderNodes.getNode('BatchHandlerTri');
    const slots = node.maxTexturesPerBatch;
    node.updateTextureCount(1);
    const single = await capture();
    node.updateTextureCount(slots);
    const extension = gl.getExtension('WEBGL_lose_context');
    if (!extension) throw Error('Context-loss extension unavailable');
    await new Promise<void>((resolve) => {
      game.canvas.addEventListener(
        'webglcontextlost',
        () => setTimeout(() => extension.restoreContext(), 50),
        { once: true },
      );
      game.canvas.addEventListener(
        'webglcontextrestored',
        () => {
          scene.paused = true;
          resolve();
        },
        { once: true },
      );
      extension.loseContext();
    });
    const restored = await capture();
    // CPU witnesses sample pixel centers. Compare through a single-sample
    // texture framebuffer; the default canvas uses MSAA polygon edge coverage.
    // Lifecycle and batching above still exercise the production canvas path.
    scene.cameras.main.setForceComposite(true);
    const actual = await capture();
    for (const view of views) for (const object of view.objects) object.setVisible(false);
    const image = scene.add.image(0, 0, 'air-sweeper-source-reference').setOrigin(0, 0);
    const expected = await capture();
    image.destroy();
    for (const view of views) for (const object of view.objects) object.setVisible(true);
    // Present the restored native scene before saving its screenshot.
    await new Promise<void>((resolve) => game.events.once('postrender', () => resolve()));
    const frame = { width: reference.width, height: reference.height };
    const cases = reference.cases.map((c) => ({
      export: c.export,
      time: c.time,
      controls: c.controls,
      category: c.category,
      emitter: c.emitter,
      empty: c.empty,
      ...compareSourcePixels(actual, expected, frame, {
        x: c.x,
        y: c.y,
        width: reference.cell,
        height: reference.cell,
      }),
    }));
    const changed = (other: Uint8Array) => {
      let count = 0;
      for (let i = 0; i < multisampled.length; i++) if (multisampled[i] !== other[i]) count++;
      return count;
    };
    return {
      cases,
      framebuffer: { width: gl.drawingBufferWidth, height: gl.drawingBufferHeight },
      defaultFramebufferSamples,
      singleTextureChanges: changed(single),
      contextChanges: changed(restored),
      meshes: views.reduce((n, v) => n + v.meshes.size, 0),
      groups: views.reduce((n, v) => n + v.groups.size, 0),
      tintedTextures: scene.textures
        .getTextureKeys()
        .filter((k) => k.startsWith('air-sweeper-test') && k.includes(':color:')).length,
      glError: gl.getError(),
      glErrors,
      clip: {
        x: game.canvas.getBoundingClientRect().left,
        y: game.canvas.getBoundingClientRect().top,
        width: (reference.width * game.canvas.getBoundingClientRect().width) / game.canvas.width,
        height:
          (reference.height * game.canvas.getBoundingClientRect().height) / game.canvas.height,
      },
    };
  }, witness);
  await (
    await import('node:fs/promises')
  ).writeFile(
    `output/playtest/native-air-sweeper-${browserName}.json`,
    JSON.stringify(report, null, 2),
  );
  console.log('Native Air Sweeper GPU comparison', browserName, JSON.stringify(report));
  await page.screenshot({
    path: `output/playtest/native-air-sweeper-${browserName}.png`,
    clip: report.clip,
  });
  expect(report.glError).toBe(0);
  expect(report.glErrors).toEqual([0, 0, 0, 0, 0, 0]);
  expect(report.singleTextureChanges).toBe(0);
  expect(report.contextChanges).toBe(0);
  expect(report.meshes).toBeGreaterThan(300);
  expect(report.groups).toBe(0);
  // Source multiply/add colors run in the triangle shader; no recolored page copies are baked.
  expect(report.tintedTextures).toBe(0);
  expect(report.cases).toHaveLength(witness.cases.length);
  for (const c of report.cases) {
    if (c.empty) {
      expect(c.colored).toBe(0);
      expect(c.maximum).toBe(0);
    } else expect(c.colored).toBeGreaterThan(0);
    expect(c.meanError, `${c.export}:${c.time}`).toBeLessThan(1);
    expect(c.largeFraction, `${c.export}:${c.time}`).toBeLessThan(0.003);
  }
});
