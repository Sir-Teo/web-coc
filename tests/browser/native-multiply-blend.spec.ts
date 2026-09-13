import { test, expect } from '@playwright/test';

test('multiply groups preserve source-over alpha on transparent and colored backdrops', async ({
  page,
  browserName,
}) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.ready);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const report = await page.evaluate(async () => {
    const { scene, game } = window.__game;
    const { NativeSceneView } = await import('/src/game/native-scene-view.ts');
    scene.paused = true;
    scene.tweens.pauseAll();
    document.querySelector<HTMLElement>('#ui')!.style.display = 'none';
    for (const child of scene.children.list) child.setVisible(false);
    scene.cameras.main.setScroll(0, 0).setZoom(1).setBackgroundColor('#304135');
    for (const [i, color] of ['rgb(200,100,50)', 'rgb(40,180,230)', 'rgb(10,90,140)'].entries()) {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 2;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 2, 2);
      scene.textures.addCanvas(`multiply-test:mesh:${i}`, canvas);
    }
    const leaf = (key: string, texture: number, blend = 0) => ({
      key,
      texture,
      vertices: [20, 20, 0, 0, 20, 80, 0, 1, 80, 20, 1, 0, 80, 80, 1, 1],
      matrix: [1, 0, 0, 0, 1, 0],
      multiply: [1, 1, 1, 0.5],
      add: [0, 0, 0, 0],
      blend,
    });
    const variants = [0, 0.2, 0.6, 1].flatMap((backdrop) => [
      {
        label: `opaque/${backdrop}`,
        backdrop,
        sourceAlpha: 1,
        multiply: [1, 1, 1, 1],
        add: [0, 0, 0, 0],
      },
      { label: `plain/${backdrop}`, backdrop, multiply: [1, 1, 1, 0.4], add: [0, 0, 0, 0] },
      {
        label: `colored/${backdrop}`,
        backdrop,
        multiply: [0.6, 1.4, 0.8, 0.4],
        add: [0.2, -0.15, 0.65, 0],
      },
      { label: `transparent/${backdrop}`, backdrop, multiply: [1, 1, 1, 0], add: [0, 0, 0, 0] },
    ]);
    const pose = (variant) => ({
      key: 'outer',
      blend: 4,
      multiply: [1, 1, 1, 0.7],
      add: [0.1, 0.2, 0.05, 0],
      group: [
        { ...leaf('backdrop', 2), multiply: [1, 1, 1, variant.backdrop] },
        {
          key: 'group',
          group: [leaf('one', 0), leaf('two', 1)].map((p) => ({
            ...p,
            multiply: [1, 1, 1, variant.sourceAlpha ?? 0.5],
          })),
          blend: 3,
          multiply: variant.multiply,
          add: variant.add,
        },
      ],
    });
    const renderer = game.renderer,
      gl = renderer.gl,
      baselineListeners = renderer.listenerCount('losewebgl'),
      view = new NativeSceneView(scene, 'multiply-test');
    const frame = () => new Promise<void>((resolve) => game.events.once('postrender', resolve));
    const pixel = async () => {
      await frame();
      const result = new Uint8Array(4);
      gl.readPixels(40, gl.drawingBufferHeight - 41, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, result);
      return [...result];
    };
    const samples = [];
    for (const variant of variants) {
      view.render([pose(variant)], 0, 0, 0);
      samples.push({ ...variant, pixel: await pixel(), gl: gl.getError() });
    }
    view.render([leaf('multiply-leaf', 0, 3)], 0, 0, 0);
    const leafPixel = await pixel();
    // Re-enter a colored group, then restore its shader, blend slot and offscreen contents.
    const colored = variants[2];
    const draw = () => view.render([pose(colored)], 0, 0, 0);
    draw();
    const before = await pixel();
    const node = renderer.renderNodes.getNode('BatchHandlerTri'),
      slots = node.maxTexturesPerBatch;
    node.updateTextureCount(1);
    const single = await pixel();
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
    draw();
    const restored = await pixel();
    const bufferCounts = [];
    for (let i = 0; i < 5; i++) {
      draw();
      await pixel();
      view.clear();
      await frame();
      bufferCounts.push(renderer.glFramebufferWrappers.length);
    }
    view.destroy();
    return {
      samples,
      leafPixel,
      before,
      single,
      restored,
      bufferCounts,
      listeners: [baselineListeners, renderer.listenerCount('losewebgl')],
      objects: view.objects.length,
      gl: gl.getError(),
    };
  });
  // Independent source-over child composition: half of the second color covers half of the first.
  const background = [48, 65, 53];
  const straight = [200, 100, 50].map((c, i) => (c * 0.25 + [40, 180, 230][i] * 0.5) / 0.75);
  for (const sample of report.samples) {
    const as = (sample.sourceAlpha === 1 ? 1 : 0.75) * sample.multiply[3],
      ad = sample.backdrop;
    const alpha = as + ad * (1 - as);
    const expected = (sample.sourceAlpha === 1 ? [40, 180, 230] : straight).map((c, i) => {
      const cs = Math.max(0, Math.min(1, (c / 255) * sample.multiply[i] + sample.add[i])) * as;
      const cd = ([10, 90, 140][i] / 255) * ad;
      const premul = cs * cd + cs * (1 - ad) + cd * (1 - as);
      const transformed = alpha
        ? Math.max(0, Math.min(1, premul / alpha + [0.1, 0.2, 0.05][i])) * alpha * 0.7
        : 0;
      return Math.round(transformed * 255 + background[i] * (1 - transformed));
    });
    for (const [i, value] of [...expected, 255].entries())
      expect(Math.abs(sample.pixel[i] - value), `${sample.label} channel ${i}`).toBeLessThanOrEqual(
        2,
      );
    expect(sample.gl).toBe(0);
  }
  for (const [i, value] of [
    Math.round(48 * (0.5 + 100 / 255)),
    Math.round(65 * (0.5 + 50 / 255)),
    Math.round(53 * (0.5 + 25 / 255)),
    255,
  ].entries())
    expect(Math.abs(report.leafPixel[i] - value)).toBeLessThanOrEqual(1);
  expect(report.single).toEqual(report.before);
  expect(report.restored).toEqual(report.before);
  expect(new Set(report.bufferCounts).size).toBe(1);
  expect(report.listeners[1]).toBe(report.listeners[0]);
  expect(report.objects).toBe(0);
  expect(report.gl).toBe(0);
  expect(errors).toEqual([]);
  console.log('Native multiply composition', browserName, JSON.stringify(report));
});
