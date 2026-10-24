import { expect, test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

test('native triangles share sprite batches with exact pixels across pages, flushes and restoration', async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 800, height: 600 });
  await page.goto('/?lazyart');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  await page.waitForFunction(() =>
    window.__game.scene.children.list.some((child) => child.type === 'Mesh2D'),
  );
  const result = await page.evaluate(async () => {
    const { scene, game } = window.__game;
    scene.paused = true;
    scene.tweens.pauseAll();
    game.loop.setFPSLimit(0);
    document.querySelector<HTMLElement>('#ui')!.style.display = 'none';
    const resource = (path: string) =>
      performance.getEntriesByType('resource').find((entry) => entry.name.includes(path))!.name;
    const { setMaxDensity } = await import(/* @vite-ignore */ resource('/src/game/display.ts'));
    setMaxDensity(game, 0.5);
    setMaxDensity(game, 1);
    scene.cameras.main.setScroll(0, 0).setZoom(1);
    const Mesh = scene.children.list.find((child) => child.type === 'Mesh2D')!.constructor;
    for (const child of scene.children.list) child.setVisible(false);
    const { nativeQuadTriangleBatcher, NATIVE_COLOR_TINT_MODE, NATIVE_ADDITIVE_TINT_MODE } =
      await import(/* @vite-ignore */ resource('/src/game/quad-renderer.ts'));
    const renderer = game.renderer,
      gl = renderer.gl;
    const shared = nativeQuadTriangleBatcher(renderer);
    if (!shared) throw Error('Shared native triangle batch is unavailable');
    const legacy = renderer.renderNodes.getNode('BatchHandlerTri');
    const capacity = shared.instancesPerBatch;
    const palette = (color: number) => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 32;
      const context = canvas.getContext('2d')!;
      context.fillStyle = `rgba(${40 + color * 19}, ${200 - color * 13}, ${70 + color * 11}, 0.7)`;
      context.fillRect(0, 0, 32, 32);
      context.fillStyle = '#d9eb83';
      context.fillRect(3, 5, 11, 19);
      context.clearRect(20, 0, 12, 9);
      return canvas;
    };
    const keys: string[] = [];
    for (let i = 0; i < 10; i++) {
      const key = `native-batch-test-${i}`;
      scene.textures.addImage(key, [palette(i), palette(9 - i)]);
      keys.push(key);
    }
    const meshes = [];
    const makeMesh = (
      count: number,
      number: number,
      onePage = false,
      strips = false,
      rectangles = false,
    ) => {
      const vertices: number[] = [],
        indices: number[] = [];
      for (let i = 0; i < count; i++) {
        const x = (i % 20) * 3 + 0.3,
          y = Math.floor(i / 20) * 2 + 0.7;
        const base = vertices.length / 4;
        if (rectangles)
          vertices.push(x, y, 0.125, 0.125, x, y + 6, 0.125, 0.875, x + 6, y, 0.875, 0.125);
        else
          vertices.push(x, y, 0.1, 0.15, x + 6.1, y + 1.3, 0.85, 0.2, x + 1.2, y + 5.8, 0.2, 0.9);
        const source = onePage ? 0 : i % 2;
        indices.push(base, base + 1, base + 2, source);
        if (strips) {
          if (rectangles) vertices.push(x + 6, y + 6, 0.875, 0.875);
          else vertices.push(x + 7.6, y + 7.1, 0.93, 0.97);
          // A different page must keep this pair as two independent triangles.
          indices.push(base + 2, base + 1, base + 3, !onePage && i % 5 === 0 ? 1 - source : source);
          if (i % 4 === 0) {
            vertices.push(x + 0.8, y + 9.7, 0.23, 0.77);
            indices.push(base + 2, base + 3, base + 4, source);
          }
        }
      }
      const mesh = new Mesh(
        scene,
        number >= 100 ? 660 : 18 + (number % 10) * 75,
        number >= 100 ? 280 : 18 + Math.floor(number / 10) * 51,
        keys[number % keys.length],
        vertices,
        indices,
        number % 2 === 0,
      );
      mesh
        .setOrigin(0, 0)
        .setRenderAsTriangles(true)
        .setAngle((number % 3) * 3.7)
        .setAlpha(number % 4 === 0 ? 0.63 : 1);
      mesh.tint = number % 3 === 0 ? 0xbed9a1 : 0xffffff;
      mesh.tint2 = number % 3 === 0 ? 0x102312 : 0;
      mesh.tintMode =
        number % 5 === 0
          ? NATIVE_ADDITIVE_TINT_MODE
          : number % 3 === 0
            ? NATIVE_COLOR_TINT_MODE
            : 0;
      mesh.setBlendMode(number % 7 === 0 ? 'ADD' : 'NORMAL');
      scene.add.existing(mesh);
      meshes.push(mesh);
      return mesh;
    };
    for (let i = 0; i < 100; i++) {
      makeMesh(41, i, false, i % 3 === 0, i % 6 === 0);
      scene.add
        .image(28 + (i % 10) * 75, 28 + Math.floor(i / 10) * 51, keys[(i + 3) % keys.length])
        .setScale(0.6)
        .setAlpha(0.8);
    }
    // This one source crosses the full batch while its texture slot is cached inside the mesh.
    makeMesh(capacity + 5, 100, true);
    makeMesh(capacity + 5, 101, true, true);
    const rectangles = makeMesh(capacity + 5, 102, true, true, true);
    let draws = 0,
      indexCount = 0;
    const draw = gl.drawElements;
    gl.drawElements = function (...args) {
      draws++;
      indexCount += args[1];
      return draw.apply(this, args);
    };
    const capture = () =>
      new Promise<{ pixels: Uint8Array; draws: number; indices: number; error: number }>(
        (resolve) => {
          draws = 0;
          indexCount = 0;
          game.events.once('postrender', () => {
            const pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
            gl.readPixels(
              0,
              0,
              gl.drawingBufferWidth,
              gl.drawingBufferHeight,
              gl.RGBA,
              gl.UNSIGNED_BYTE,
              pixels,
            );
            resolve({ pixels, draws, indices: indexCount, error: gl.getError() });
          });
        },
      );
    const difference = (a: Uint8Array, b: Uint8Array) => {
      let changed = 0;
      for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) changed++;
      return changed;
    };
    const comparisons = [];
    let visibleMeshChanges = 0;
    let lastSharedPixels: Uint8Array;
    for (const rounded of [false, true]) {
      scene.cameras.main.roundPixels = rounded;
      for (const mesh of meshes) mesh.customRenderNodes.BatchHandlerTriangles = legacy;
      const expected = await capture();
      if (!rounded) {
        for (const mesh of meshes) mesh.setVisible(false);
        const spritesOnly = await capture();
        visibleMeshChanges = difference(expected.pixels, spritesOnly.pixels);
        for (const mesh of meshes) mesh.setVisible(true);
      }
      for (const mesh of meshes) mesh.customRenderNodes.BatchHandlerTriangles = shared;
      const actual = await capture();
      lastSharedPixels = actual.pixels;
      comparisons.push({
        rounded,
        changed: difference(expected.pixels, actual.pixels),
        referenceDraws: expected.draws,
        sharedDraws: actual.draws,
        errors: [expected.error, actual.error],
      });
    }
    const textureSlots = shared.maxTexturesPerBatch;
    shared.updateTextureCount(1);
    const singleTexture = await capture();
    const singleTextureChanges = difference(lastSharedPixels!, singleTexture.pixels);
    shared.updateTextureCount(textureSlots);
    const visibility = scene.children.list.map((child) => [child, child.visible] as const);
    for (const [child] of visibility) child.setVisible(false);
    const emptyIndices = (await capture()).indices;
    rectangles.setVisible(true);
    const rectangleIndices = (await capture()).indices - emptyIndices;
    for (const [child, visible] of visibility) child.setVisible(visible);
    const before = await capture();
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
    gl.drawElements = draw;
    return {
      comparisons,
      singleTextureChanges,
      singleTextureError: singleTexture.error,
      visibleMeshChanges,
      restoredChanged: difference(before.pixels, restored.pixels),
      restoredError: restored.error,
      capacity,
      rectangleIndices,
      expectedRectangleIndices: 6 * (capacity + 5 + Math.ceil((capacity + 5) / 4)),
      triangles: meshes.reduce((sum, mesh) => sum + mesh.indices.length / 4, 0),
    };
  });
  const reportPath = test.info().outputPath('batching-result.json');
  await writeFile(reportPath, JSON.stringify(result, null, 2));
  await test.info().attach('batching-result', {
    path: reportPath,
    contentType: 'application/json',
  });
  expect(result.triangles).toBeGreaterThan(result.capacity);
  expect(result.visibleMeshChanges).toBeGreaterThan(1000);
  for (const comparison of result.comparisons) {
    expect(comparison.changed).toBe(0);
    expect(comparison.errors).toEqual([0, 0]);
    expect(comparison.sharedDraws).toBeLessThan(comparison.referenceDraws / 2);
  }
  expect(result.restoredChanged).toBe(0);
  expect(result.restoredError).toBe(0);
  expect(result.singleTextureChanges).toBe(0);
  expect(result.singleTextureError).toBe(0);
  expect(result.rectangleIndices).toBe(result.expectedRectangleIndices);
});
