import { test, expect } from '@playwright/test';

test('screen groups preserve alpha and apply clamped colors after child composition', async ({
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
    for (const [i, color] of ['rgb(200,100,50)', 'rgb(40,180,230)'].entries()) {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 2;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 2, 2);
      scene.textures.addCanvas(`screen-test:mesh:${i}`, canvas);
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
    const variants = [
      { label: 'screen', blend: 4, multiply: [1, 1, 1, 0.4], add: [0, 0, 0, 0] },
      {
        label: 'colored screen',
        blend: 4,
        multiply: [0.6, 1.4, 0.8, 0.4],
        add: [0.2, -0.15, 0.65, 0],
      },
      {
        label: 'colored additive',
        blend: 8,
        multiply: [0.6, 1.4, 0.8, 0.4],
        add: [0.2, -0.15, 0.65, 0],
      },
      { label: 'transparent', blend: 4, multiply: [0.6, 1.4, 0.8, 0], add: [0.2, -0.15, 0.65, 0] },
      { label: 'screen again', blend: 4, multiply: [1, 1, 1, 0.4], add: [0, 0, 0, 0] },
    ];
    const renderer = game.renderer,
      gl = renderer.gl,
      baselineListeners = renderer.listenerCount('losewebgl'),
      view = new NativeSceneView(scene, 'screen-test');
    const frame = () => new Promise<void>((resolve) => game.events.once('postrender', resolve));
    const pixel = async () => {
      await frame();
      const result = new Uint8Array(4);
      gl.readPixels(40, gl.drawingBufferHeight - 41, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, result);
      return [...result];
    };
    const samples = [];
    for (const variant of variants) {
      view.render([{ key: 'group', group: [leaf('one', 0), leaf('two', 1)], ...variant }], 0, 0, 0);
      samples.push({ ...variant, pixel: await pixel(), gl: gl.getError() });
    }
    view.render([leaf('screen-leaf', 0, 4)], 0, 0, 0);
    const leafPixel = await pixel();
    // Re-enter a colored group, then restore its shader, blend slot and offscreen contents.
    const colored = variants[1];
    const draw = () =>
      view.render([{ key: 'group', group: [leaf('one', 0), leaf('two', 1)], ...colored }], 0, 0, 0);
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
    const expected = straight.map((c, i) => {
      const transformed = Math.max(0, Math.min(255, c * sample.multiply[i] + sample.add[i] * 255));
      const source = transformed * 0.75 * sample.multiply[3];
      return Math.round(
        Math.min(255, source + background[i] * (sample.blend === 4 ? 1 - source / 255 : 1)),
      );
    });
    for (const [i, value] of [...expected, 255].entries())
      expect(Math.abs(sample.pixel[i] - value), `${sample.label} channel ${i}`).toBeLessThanOrEqual(
        2,
      );
    expect(sample.gl).toBe(0);
  }
  for (const [i, value] of [129, 102, 73, 255].entries())
    expect(Math.abs(report.leafPixel[i] - value)).toBeLessThanOrEqual(1);
  expect(report.single).toEqual(report.before);
  expect(report.restored).toEqual(report.before);
  expect(new Set(report.bufferCounts).size).toBe(1);
  expect(report.listeners[1]).toBe(report.listeners[0]);
  expect(report.objects).toBe(0);
  expect(report.gl).toBe(0);
  expect(errors).toEqual([]);
  console.log('Native screen composition', browserName, JSON.stringify(report));
});
