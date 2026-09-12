import { test, expect } from '@playwright/test';
import witness from '../fixtures/native-xbow-mesh/manifest.json' with { type: 'json' };

test.use({ viewport: { width: 1700, height: 1250 } });

test('native X-Bow polygons, colors and additive layers match source pixels and survive context restoration', async ({
  page,
  browserName,
}) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.ready);
  const report = await page.evaluate(async (reference) => {
    const { scene, game } = window.__game;
    const { default: graph } = await import('/reference/xbow/runtime.json');
    const { nativeMeshPoses } = await import('/src/game/native-mesh.ts');
    const { NativeMeshView, preloadNativeMeshes } = await import('/src/game/native-mesh-scene.ts');
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
  expect(report.meshes).toBeGreaterThan(30);
  expect(report.tintedTextures).toBeGreaterThan(3);
  for (const c of report.cases) {
    expect(c.colored).toBeGreaterThan(100);
    expect(c.meanError, c.export).toBeLessThan(1);
    expect(c.largeFraction, c.export).toBeLessThan(0.003);
  }
});
