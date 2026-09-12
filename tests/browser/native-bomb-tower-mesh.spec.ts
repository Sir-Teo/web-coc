import { test, expect } from '@playwright/test';
import bodyWitness from '../fixtures/native-bomb-tower-mesh/manifest.json' with { type: 'json' };
import particleWitness from '../fixtures/native-bomb-tower-particles/manifest.json' with { type: 'json' };

test.use({ viewport: { width: 1250, height: 1650 } });

for (const [label, witness] of [
  ['bodies', bodyWitness],
  ['particles', particleWitness],
] as const)
  test(`native Bomb Tower ${label} match source pixels and survive context restoration`, async ({
    page,
    browserName,
  }) => {
    test.setTimeout(60000);
    await page.goto('/');
    await page.waitForFunction(() => window.__game?.scene.ready);
    const report = await page.evaluate(async (reference) => {
      const { scene, game } = window.__game;
      const { default: body } = await import('/reference/bombtower/body.json');
      const { default: defender } = await import('/reference/bombtower/defender.json');
      const { default: particleArt } = await import('/reference/bombtower/particle_art.json');
      const graphs = { body, defender, particleArt };
      const { nativeScenePoses } = await import('/src/game/native-mesh.ts');
      const { preloadNativeMeshes } = await import('/src/game/native-mesh-scene.ts');
      const { NativeSceneView } = await import('/src/game/native-scene-view.ts');
      document.querySelector<HTMLElement>('#ui')!.style.display = 'none';
      scene.paused = true;
      scene.tweens.pauseAll();
      for (const child of scene.children.list) child.setVisible(false);
      scene.cameras.main.setScroll(0, 0).setZoom(1).setBackgroundColor(reference.background);
      preloadNativeMeshes(scene, body, 'bombtower-test-body');
      preloadNativeMeshes(scene, defender, 'bombtower-test-defender');
      preloadNativeMeshes(scene, particleArt, 'bombtower-test-particleArt');
      scene.load.image(
        'bombtower-source-reference',
        `/tests/fixtures/${reference.cases[0].graph === 'particleArt' ? 'native-bomb-tower-particles' : 'native-bomb-tower-mesh'}/reference.png`,
      );
      await new Promise<void>((resolve) => {
        scene.load.once('complete', resolve);
        scene.load.start();
      });
      const views = reference.cases.map((c) => {
        const view = new NativeSceneView(scene, `bombtower-test-${c.graph}`);
        view.render(
          nativeScenePoses(graphs[c.graph], c.export, c.time, c.controls, c.root),
          c.x,
          c.y,
          0,
        );
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
      const image = scene.add.image(0, 0, 'bombtower-source-reference').setOrigin(0, 0);
      const expected = await capture();
      image.destroy();
      for (const view of views) for (const object of view.objects) object.setVisible(true);
      const cases = reference.cases.map((c) => {
        const largePixels: { x: number; y: number; actual: number[]; expected: number[] }[] = [];
        let colored = 0,
          total = 0,
          large = 0,
          maximum = 0;
        for (let y = c.y; y < c.y + reference.cell; y++)
          for (let x = c.x; x < c.x + reference.cell; x++) {
            const at = ((reference.height - 1 - y) * reference.width + x) * 4;
            const a = actual.slice(at, at + 3),
              e = expected.slice(at, at + 3);
            if (
              a.some((v, i) => v !== [48, 65, 53][i]) ||
              e.some((v, i) => v !== [48, 65, 53][i])
            ) {
              colored++;
              const error = Math.max(...a.map((v, i) => Math.abs(v - e[i])));
              total += error;
              maximum = Math.max(maximum, error);
              if (error > 16) {
                large++;
                if (largePixels.length < 32)
                  largePixels.push({ x: x - c.x, y: y - c.y, actual: [...a], expected: [...e] });
              }
            }
          }
        return {
          export: c.export,
          time: c.time,
          colored,
          meanError: total / colored,
          largeFraction: large / colored,
          maximum,
          largePixels,
        };
      });
      const changed = (other: Uint8Array) => {
        let count = 0;
        for (let i = 0; i < multisampled.length; i++) if (multisampled[i] !== other[i]) count++;
        return count;
      };
      return {
        cases,
        defaultFramebufferSamples,
        singleTextureChanges: changed(single),
        contextChanges: changed(restored),
        meshes: views.reduce((n, v) => n + v.meshes.size, 0),
        groups: views.reduce((n, v) => n + v.groups.size, 0),
        tintedTextures: scene.textures
          .getTextureKeys()
          .filter((k) => k.startsWith('bombtower-test') && k.includes(':color:')).length,
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
    console.log('Native Bomb Tower GPU comparison', label, browserName, JSON.stringify(report));
    await page.screenshot({
      path: `output/playtest/native-bomb-tower-${label}-${browserName}.png`,
      clip: report.clip,
    });
    expect(report.glError).toBe(0);
    expect(report.glErrors).toEqual([0, 0, 0, 0, 0, 0]);
    expect(report.singleTextureChanges).toBe(0);
    expect(report.contextChanges).toBe(0);
    expect(report.meshes).toBeGreaterThan(40);
    for (const c of report.cases) {
      // Original debris1/debris2 occupy only 62/64 pixels at this witness scale.
      // Keep every pixel in the same error comparison, including these tiny exports.
      expect(c.colored).toBeGreaterThan(label === 'particles' ? 0 : 100);
      expect(c.meanError, `${c.export}:${c.time}`).toBeLessThan(1);
      expect(c.largeFraction, `${c.export}:${c.time}`).toBeLessThan(0.003);
    }
  });
