import { test, expect } from '@playwright/test';
import witness from '../fixtures/native-tesla-mesh/manifest.json' with { type: 'json' };

test.use({ viewport: { width: 1700, height: 1250 } });

test('native Tesla reveals and isolated electricity groups match source pixels and survive context restoration', async ({
  page,
  browserName,
}) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.ready);
  const report = await page.evaluate(async (reference) => {
    const { scene, game } = window.__game;
    const { default: graph } = await import('/reference/tesla/runtime.json');
    const { nativeScenePoses } = await import('/src/game/native-mesh.ts');
    const { preloadNativeMeshes } = await import('/src/game/native-mesh-scene.ts');
    const { NativeSceneView } = await import('/src/game/native-scene-view.ts');
    document.querySelector<HTMLElement>('#ui')!.style.display = 'none';
    scene.paused = true;
    scene.tweens.pauseAll();
    for (const child of scene.children.list) child.setVisible(false);
    scene.cameras.main.setScroll(0, 0).setZoom(1).setBackgroundColor(reference.background);
    preloadNativeMeshes(scene, graph, 'tesla-test');
    scene.load.image('tesla-source-reference', '/tests/fixtures/native-tesla-mesh/reference.png');
    await new Promise<void>((resolve) => {
      scene.load.once('complete', resolve);
      scene.load.start();
    });
    const views = reference.cases.map((c) => {
      const view = new NativeSceneView(scene, 'tesla-test');
      view.render(nativeScenePoses(graph, c.export, c.time, {}, c.root), c.x, c.y, 0);
      return view;
    });
    const gl = game.renderer.gl;
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
    for (const view of views) for (const object of view.objects) object.setVisible(false);
    const image = scene.add.image(0, 0, 'tesla-source-reference').setOrigin(0, 0);
    const expected = await capture();
    image.destroy();
    for (const view of views) for (const object of view.objects) object.setVisible(true);
    const cases = reference.cases.map((c) => {
      let colored = 0,
        total = 0,
        large = 0,
        maximum = 0;
      for (let y = c.y; y < c.y + reference.cell; y++)
        for (let x = c.x; x < c.x + reference.cell; x++) {
          const at = ((reference.height - 1 - y) * reference.width + x) * 4;
          const a = actual.slice(at, at + 3),
            e = expected.slice(at, at + 3);
          if (a.some((v, i) => v !== [48, 65, 53][i]) || e.some((v, i) => v !== [48, 65, 53][i])) {
            colored++;
            const error = Math.max(...a.map((v, i) => Math.abs(v - e[i])));
            total += error;
            maximum = Math.max(maximum, error);
            if (error > 16) large++;
          }
        }
      return {
        export: c.export,
        time: c.time,
        colored,
        meanError: total / colored,
        largeFraction: large / colored,
        maximum,
      };
    });
    const changed = (other: Uint8Array) => {
      let count = 0;
      for (let i = 0; i < actual.length; i++) if (actual[i] !== other[i]) count++;
      return count;
    };
    return {
      cases,
      singleTextureChanges: changed(single),
      contextChanges: changed(restored),
      meshes: views.reduce((n, v) => n + v.meshes.size, 0),
      groups: views.reduce((n, v) => n + v.groups.size, 0),
      tintedTextures: scene.textures
        .getTextureKeys()
        .filter((k) => k.startsWith('tesla-test') && k.includes(':color:')).length,
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
  console.log('Native Tesla GPU comparison', browserName, JSON.stringify(report));
  await page.screenshot({
    path: `output/playtest/native-tesla-mesh-${browserName}.png`,
    clip: report.clip,
  });
  expect(report.glError).toBe(0);
  expect(report.glErrors).toEqual([0, 0, 0, 0, 0]);
  expect(report.singleTextureChanges).toBe(0);
  expect(report.contextChanges).toBe(0);
  expect(report.meshes).toBeGreaterThan(20);
  expect(report.groups).toBe(8);
  for (const c of report.cases) {
    expect(c.colored).toBeGreaterThan(100);
    expect(c.meanError, `${c.export}:${c.time}`).toBeLessThan(1);
    expect(c.largeFraction, `${c.export}:${c.time}`).toBeLessThan(0.003);
  }
});

test('isolated alpha composes once and Tesla buffers are released across idle, zoom and destruction', async ({
  page,
}) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.ready);
  const report = await page.evaluate(async () => {
    const { scene, game } = window.__game;
    scene.paused = true;
    scene.tweens.pauseAll();
    for (const object of scene.children.list) object.setVisible(false);
    scene.cameras.main.setScroll(0, 0).setZoom(1).setBackgroundColor('#304135');
    const { default: graph } = await import('/reference/tesla/runtime.json');
    const { nativeScenePoses } = await import('/src/game/native-mesh.ts');
    const { NativeSceneView } = await import('/src/game/native-scene-view.ts');
    const { preloadNativeMeshes } = await import('/src/game/native-mesh-scene.ts');
    preloadNativeMeshes(scene, graph, 'tesla-lifecycle');
    await new Promise<void>((resolve) => {
      scene.load.once('complete', resolve);
      scene.load.start();
    });
    const renderer = game.renderer,
      gl = renderer.gl;
    const before = {
      buffers: renderer.glFramebufferWrappers.length,
      listeners: renderer.listenerCount('losewebgl'),
    };
    const view = new NativeSceneView(scene, 'tesla-lifecycle');
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 2;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = 'rgb(200, 100, 50)';
    ctx.fillRect(0, 0, 2, 2);
    scene.textures.addCanvas('tesla-lifecycle:mesh:1', canvas);
    const leaf = (key: string) => ({
      key,
      texture: 1,
      vertices: [20, 20, 0, 0, 20, 80, 0, 1, 80, 20, 1, 0, 80, 80, 1, 1],
      matrix: [1, 0, 0, 0, 1, 0],
      multiply: [1, 1, 1, 0.5],
      add: [0, 0, 0, 0],
      blend: 0,
    });
    view.render(
      [
        {
          key: 'alpha',
          group: [leaf('one'), leaf('two')],
          multiply: [1, 1, 1, 0.4],
          add: [0, 0, 0, 0],
          blend: 8,
        },
      ],
      0,
      0,
      0,
    );
    const frame = () => new Promise<void>((resolve) => game.events.once('postrender', resolve));
    await frame();
    const pixel = new Uint8Array(4);
    gl.readPixels(40, gl.drawingBufferHeight - 41, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    const errors = [gl.getError()];
    let peakBuffers = 0,
      retained = true,
      physicalScale = true,
      detached = true;
    for (let i = 0; i < 12; i++) {
      const zoom = 1 + (i % 3);
      scene.cameras.main.setZoom(zoom);
      view.render(nativeScenePoses(graph, 'teslatower_lvl10_setup', 8 / 24), 200, 200, 0);
      const first = [...view.groups.values()][0].image;
      physicalScale &&= first.scaleX === 1 / zoom;
      detached &&= [...view.groups.values()][0].content.objects.every(
        (o) => !scene.children.list.includes(o),
      );
      view.render(nativeScenePoses(graph, 'teslatower_lvl10_setup', 9 / 24), 200, 200, 0);
      retained &&= [...view.groups.values()][0].image === first;
      peakBuffers = Math.max(peakBuffers, renderer.glFramebufferWrappers.length - before.buffers);
      await frame();
      errors.push(gl.getError());
      view.render(nativeScenePoses(graph, 'teslatower_lvl10_setup', 4), 200, 200, 0);
      if (view.groups.size || renderer.glFramebufferWrappers.length !== before.buffers)
        throw Error('Quiet Tesla retains an offscreen buffer');
    }
    view.clear();
    view.destroy();
    await frame();
    errors.push(gl.getError());
    return {
      pixel: [...pixel],
      errors,
      peakBuffers,
      retained,
      physicalScale,
      detached,
      before,
      after: {
        buffers: renderer.glFramebufferWrappers.length,
        listeners: renderer.listenerCount('losewebgl'),
      },
      objects: view.objects.length,
      meshes: view.meshes.size,
      groups: view.groups.size,
    };
  });
  // Two normal 50%-alpha layers cover 75%; apply group opacity 40% once,
  // then add (60,30,15) to the opaque (48,65,53) background.
  for (const [i, expected] of [108, 95, 68, 255].entries())
    expect(Math.abs(report.pixel[i] - expected)).toBeLessThanOrEqual(1);
  expect(report.errors.every((e) => e === 0)).toBe(true);
  expect(report.peakBuffers).toBe(1);
  expect(report.retained && report.physicalScale && report.detached).toBe(true);
  expect(report.after).toEqual(report.before);
  expect([report.objects, report.meshes, report.groups]).toEqual([0, 0, 0]);
});
