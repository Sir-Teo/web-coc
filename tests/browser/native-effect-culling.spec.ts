import { expect, test } from '@playwright/test';
import fs from 'node:fs/promises';
import type { NativeMatrix, NativeMeshPose, NativeScenePose } from '../../src/game/native-mesh';
import type { NativeParticlePose } from '../../src/game/native-particles';

for (const profile of [
  {
    name: 'desktop',
    width: 960,
    height: 640,
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
  },
  { name: 'phone', width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
]) {
  test.describe(profile.name, () => {
    test.use({
      viewport: { width: profile.width, height: profile.height },
      deviceScaleFactor: profile.deviceScaleFactor,
      isMobile: profile.isMobile,
      hasTouch: profile.hasTouch,
    });
    test('effect culling preserves pixels, crossing geometry and pooled re-entry', async ({
      page,
    }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto('/?lazyart');
      await page.waitForFunction(() => window.__game?.scene.artSettled);
      await page.locator('[data-action="skip-tutorial"]').click();
      const report = await page.evaluate(async () => {
        const { scene, game } = window.__game;
        const { NativeEffectViews } = await import('/src/game/native-effect-views.ts');
        const { effectSceneView } = await import('/src/game/native-scene-view.ts');
        const { nativeMeshTexture } = await import('/src/game/native-mesh.ts');
        // Reuse the app's module identity, including Vite's development cache suffix.
        const shakeModule = performance
          .getEntriesByType('resource')
          .find((entry) => entry.name.includes('/src/game/camera-shake-layer.ts'))!.name;
        const { CameraShakeLayer } = await import(/* @vite-ignore */ shakeModule);
        scene.paused = true;
        scene.tweens.pauseAll();
        document.querySelector<HTMLElement>('#ui')!.style.display = 'none';
        for (const object of scene.children.list) object.setVisible(false);
        const camera = scene.cameras.main;
        camera.setScroll(0, 0).setZoom(1).setRotation(0).setBackgroundColor('#182433');
        const rendered = () =>
          new Promise<void>((resolve) => game.events.once('postrender', resolve));
        await rendered();
        const viewport = camera.worldView;
        const left = viewport.centerX - viewport.width / 2,
          right = viewport.centerX + viewport.width / 2,
          top = viewport.centerY - viewport.height / 2,
          cx = viewport.centerX,
          cy = viewport.centerY;
        const prefix = 'effect-culling-test';
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 16;
        const context = canvas.getContext('2d')!;
        context.fillStyle = '#e85828';
        context.fillRect(0, 0, 16, 16);
        scene.textures.addCanvas(nativeMeshTexture(prefix, 0), canvas);
        const leaf = (matrix: NativeMatrix = [1, 0, 0, 0, 1, 0]): NativeMeshPose => ({
          key: 'leaf',
          texture: 0,
          vertices: [0, 0, 0, 0, 0, 16, 0, 1, 16, 0, 1, 0, 16, 16, 1, 1],
          matrix,
          multiply: [1, 1, 1, 1],
          add: [0, 0, 0, 0],
          blend: 0,
        });
        const fx = (
          key: string,
          x: number,
          y: number,
          poses: NativeScenePose[] = [leaf()],
        ): NativeParticlePose => ({
          key,
          emitter: 'fixture',
          x,
          y,
          depth: 100,
          poses,
        });
        const fixtures = [
          fx('inside', cx - 16, cy - 16),
          fx('outside', right + 1000, cy),
          fx('crossing', left - 100, top + 30, [leaf([1, 0, 110, 0, 1, 0])]),
          fx('rotated', right + 5, cy, [leaf([0, -4, 0, 4, 0, 0])]),
          fx('nested', left - 100, top + 100, [
            {
              key: 'outer',
              blend: 4,
              multiply: [1, 1, 1, 0.8],
              add: [0, 0, 0, 0],
              group: [
                {
                  key: 'inner',
                  blend: 8,
                  multiply: [1, 1, 1, 1],
                  add: [0, 0, 0, 0],
                  group: [leaf([1, 0, 120, 0, 1, 0])],
                },
              ],
            },
          ]),
          fx('gap', right + 1000, top + 200, [
            {
              key: 'gap',
              blend: 4,
              multiply: [1, 1, 1, 1],
              add: [2, 0.2, 0, 0],
              group: [leaf([1, 0, -viewport.width - 2100, 0, 1, 0]), leaf([1, 0, 1000, 0, 1, 0])],
            },
          ]),
          fx('filtered-edge', left - 17, top + 300),
          ...Array.from({ length: 100 }, (_, i) => fx(`far-${i}`, right + 1200 + i, cy)),
        ];
        const gl = game.renderer.gl;
        const capture = async () => {
          await rendered();
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
          return pixels;
        };
        // Independent reference: render every effect, with no viewport decision or pool.
        const references = fixtures.map((item) => {
          const view = effectSceneView(scene, prefix);
          view.render(item.poses, item.x, item.y, item.depth);
          return view;
        });
        const reference = await capture();
        const pixel =
          ((gl.drawingBufferHeight - 1 - Math.floor(cy - 8)) * gl.drawingBufferWidth +
            Math.floor(cx - 8)) *
          4;
        const witnessPixel = Array.from(reference.slice(pixel, pixel + 4));
        const beforeStart = performance.now();
        for (let frame = 0; frame < 30; frame++)
          for (let i = 0; i < fixtures.length; i++) {
            const item = fixtures[i];
            references[i].render(item.poses, item.x, item.y, item.depth);
          }
        const referenceMs = performance.now() - beforeStart;
        for (const view of references) view.destroy();
        const layer = new NativeEffectViews(scene, prefix, 'effectCullFixture');
        const draw = () => {
          for (const item of fixtures) layer.show(item);
          layer.sweep();
        };
        draw();
        const actual = await capture();
        let changedBytes = 0;
        for (let i = 0; i < actual.length; i++) if (actual[i] !== reference[i]) changedBytes++;
        const afterStart = performance.now();
        for (let frame = 0; frame < 30; frame++) draw();
        const culledMs = performance.now() - afterStart;
        const keys = [...layer.views.keys()].sort();
        layer.clear();
        const inside = fixtures[0];
        layer.show(inside);
        layer.sweep();
        const original = layer.views.get('inside')!;
        layer.show({ ...inside, x: right + 1000 });
        const markedShown = layer.has('inside');
        layer.sweep();
        const hidden =
          !layer.views.has('inside') &&
          original.objects.every(
            (object) => !object.visible && !object.getData('effectCullFixture'),
          );
        layer.show(inside);
        layer.sweep();
        const reused = layer.views.get('inside') === original;
        // Pan onto the previously off-screen effect, then back; caller-owned poses need no reset.
        camera.setScroll(right + 1000 - cx, 0);
        draw();
        const panImmediate = layer.views.has('outside');
        await rendered();
        draw();
        const panRevealed = layer.views.has('outside');
        camera.setScroll(0, 0);
        await rendered();
        camera.setZoom(0.5);
        layer.show(fx('zoom-edge', right + viewport.width / 4, cy));
        const zoomImmediate = layer.views.has('zoom-edge');
        camera.setZoom(1);
        const shake = new CameraShakeLayer(camera, () => ({ x: 0, y: 60 }));
        layer.show(fx('shake-edge', cx, top - 30));
        const shakeRetained = layer.views.has('shake-edge');
        shake.destroy();
        draw();
        await rendered();
        return {
          changedBytes,
          witnessPixel,
          keys,
          originalViews: fixtures.length,
          referenceMs,
          culledMs,
          markedShown,
          hidden,
          reused,
          panRevealed,
          panImmediate,
          zoomImmediate,
          shakeRetained,
          glError: gl.getError(),
        };
      });
      expect(report.changedBytes).toBe(0);
      expect(report.witnessPixel).toEqual([232, 88, 40, 255]);
      expect(report.keys).toEqual(['crossing', 'filtered-edge', 'inside', 'nested', 'rotated']);
      expect(report.markedShown && report.hidden && report.reused && report.panRevealed).toBe(true);
      expect(report).toMatchObject({
        panImmediate: true,
        zoomImmediate: true,
        shakeRetained: true,
      });
      expect(report.glError).toBe(0);
      expect(errors).toEqual([]);
      await fs.mkdir('output/playtest', { recursive: true });
      await fs.writeFile(
        `output/playtest/native-effect-culling-${profile.name}.json`,
        JSON.stringify(report, null, 2),
      );
      await page.screenshot({ path: `output/playtest/native-effect-culling-${profile.name}.png` });
    });
  });
}
