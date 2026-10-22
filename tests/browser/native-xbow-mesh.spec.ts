import { test, expect } from '@playwright/test';
import witness from '../fixtures/native-xbow-mesh/manifest.json' with { type: 'json' };

test.use({ viewport: { width: 1700, height: 1250 } });

test('native X-Bow polygons, colors and additive layers match source pixels and survive context restoration', async ({
  page,
  browserName,
}) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  const report = await page.evaluate(async (reference) => {
    const { scene, game } = window.__game;
    const { default: graph } = await import('/reference/xbow/runtime.json');
    const { nativeMeshPoses } = await import('/src/game/native-mesh.ts');
    const { NativeMeshView, preloadNativeMeshes } = await import('/src/game/native-mesh-scene.ts');
    const { compareSourcePixels } = await import('/tests/fixtures/source-pixel-comparison.ts');
    document.querySelector<HTMLElement>('#ui')!.style.display = 'none';
    scene.paused = true;
    scene.tweens.pauseAll();
    for (const child of scene.children.list) child.setVisible(false);
    scene.cameras.main.setScroll(0, 0).setZoom(1).setBackgroundColor(reference.background);
    preloadNativeMeshes(scene, graph, 'xbow-test');
    scene.load.image('xbow-source-reference', '/tests/fixtures/native-xbow-mesh/reference.png');
    await new Promise<void>((resolve) => {
      scene.load.once('complete', resolve);
      scene.load.start();
    });
    const views = reference.cases.map((c) => {
      const view = new NativeMeshView(scene, 'xbow-test');
      view.render(
        nativeMeshPoses(
          graph,
          c.export,
          c.time,
          { turret: c.direction, ammo: c.direction },
          c.root,
        ),
        c.x,
        c.y,
        0,
      );
      return view;
    });
    const gl = game.renderer.gl;
    if (gl.drawingBufferWidth < reference.width || gl.drawingBufferHeight < reference.height)
      throw Error(
        `Source comparison exceeds framebuffer: ${reference.width}×${reference.height} vs ${gl.drawingBufferWidth}×${gl.drawingBufferHeight}`,
      );
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
          resolve(pixels);
        }),
      );
    const actual = await capture();
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
    for (const view of views) for (const mesh of view.meshes.values()) mesh.setVisible(false);
    const image = scene.add.image(0, 0, 'xbow-source-reference').setOrigin(0, 0);
    const expected = await capture();
    image.destroy();
    for (const view of views) for (const mesh of view.meshes.values()) mesh.setVisible(true);
    // Present a native frame before the screenshot instead of retaining the reference frame.
    const preview = await capture();
    const frame = { width: reference.width, height: reference.height };
    const cases = reference.cases.map((c) => ({
      export: c.export,
      ...compareSourcePixels(actual, expected, frame, {
        x: c.x,
        y: c.y,
        width: reference.cell,
        height: reference.cell,
      }),
    }));
    const changed = (other: Uint8Array) => {
      let count = 0;
      for (let i = 0; i < actual.length; i++) if (actual[i] !== other[i]) count++;
      return count;
    };
    return {
      cases,
      framebuffer: { width: gl.drawingBufferWidth, height: gl.drawingBufferHeight },
      singleTextureChanges: changed(single),
      contextChanges: changed(restored),
      previewChanges: changed(preview),
      meshes: views.reduce((n, v) => n + v.meshes.size, 0),
      tintedTextures: scene.textures
        .getTextureKeys()
        .filter((k) => k.startsWith('xbow-test') && k.includes(':color:')).length,
      glError: gl.getError(),
      clip: {
        x: game.canvas.getBoundingClientRect().left,
        y: game.canvas.getBoundingClientRect().top,
        width: (reference.width * game.canvas.getBoundingClientRect().width) / game.canvas.width,
        height:
          (reference.height * game.canvas.getBoundingClientRect().height) / game.canvas.height,
      },
    };
  }, witness);
  console.log('Native X-Bow GPU comparison', browserName, JSON.stringify(report));
  await page.screenshot({
    path: `output/playtest/xbow-mesh-${browserName}.png`,
    clip: report.clip,
  });
  expect(report.glError).toBe(0);
  expect(report.singleTextureChanges).toBe(0);
  expect(report.contextChanges).toBe(0);
  expect(report.previewChanges).toBe(0);
  expect(report.meshes).toBeGreaterThan(30);
  // Non-saturating source colors run in the triangle shader; only saturating ones bake the
  // few texels their leaf samples (never whole pages).
  expect(report.tintedTextures).toBeLessThanOrEqual(3);
  for (const c of report.cases) {
    expect(c.colored).toBeGreaterThan(100);
    expect(c.meanError, c.export).toBeLessThan(1);
    expect(c.largeFraction, c.export).toBeLessThan(0.003);
  }
});
