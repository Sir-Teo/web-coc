import { test, expect } from '@playwright/test';

for (const reference of ['triangle strip', 'single texture', 'restored context'] as const)
  test(`sprite batches match the ${reference} pixel reference across frames and transforms`, async ({
    page,
  }) => {
    await page.goto('/');
    await page.waitForFunction(() => window.__game?.scene.ready);
    await page.locator('[data-action="skip-tutorial"]').click();
    const result = await page.evaluate(async (reference) => {
      const { scene, game } = window.__game;
      document.querySelector<HTMLElement>('#ui')!.style.display = 'none';
      scene.paused = true;
      scene.tweens.pauseAll();
      for (const child of scene.children.list) child.setVisible(false);
      scene.cameras.main.setScroll(0, 0).setZoom(1);
      const kinds = ['swordsman', 'archer', 'giant', 'wizard', 'balloon', 'goblin', 'wallbreaker'];
      for (let row = 0; row < kinds.length; row++)
        for (let frame = 0; frame < 4; frame++)
          scene.add
            .image(130 + frame * 170.3, 110 + row * 105.2, `${kinds[row]}-walk`, frame)
            .setOrigin(0.5, 122 / 128)
            .setScale(0.7 + frame * 0.1)
            .setFlipX(frame % 2 === 0)
            .setAngle(frame * 11)
            .setAlpha(frame === 3 ? 0.6 : 1)
            .setTint(frame === 2 ? 0xffbbee : 0xffffff);
      // Adjacent, overlapping sprites exercise alpha blending and batch boundaries too.
      for (let i = 0; i < 70; i++)
        scene.add
          .image(
            880 + (i % 7) * 39.3,
            140 + Math.floor(i / 7) * 56.7,
            `${kinds[i % 7]}-walk`,
            i % 4,
          )
          .setScale(0.7)
          .setAlpha(0.8)
          .setDepth(i);
      const renderer = game.renderer,
        gl = renderer.gl;
      const node = renderer.renderNodes.getNode('BatchHandlerQuad');
      const indices = new Uint16Array(node.indexBuffer.dataBuffer);
      const triangles = indices.slice();
      const topology = node.topology;
      const textureSlots = node.maxTexturesPerBatch;
      const upload = () => {
        renderer.glWrapper.update(
          { vao: null, bindings: { elementArrayBuffer: node.indexBuffer } },
          true,
        );
        node.indexBuffer.update();
      };
      const capture = () =>
        new Promise<Uint8Array>((resolve) => {
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
            resolve(pixels);
          });
        });
      const actual = await capture();
      // Reconstruct the pinned engine's original strip for an independent raster reference.
      if (reference === 'triangle strip') {
        for (let i = 0; i < indices.length; i += 6) {
          const v = (i / 6) * 4;
          indices.set([v, v, v + 1, v + 2, v + 3, v + 3], i);
        }
        upload();
        node.topology = gl.TRIANGLE_STRIP;
      } else if (reference === 'single texture') node.updateTextureCount(1);
      else {
        const extension = gl.getExtension('WEBGL_lose_context');
        if (!extension) throw Error('Context-loss extension unavailable');
        await new Promise<void>((resolve) => {
          game.canvas.addEventListener(
            'webglcontextlost',
            () => {
              setTimeout(() => extension.restoreContext(), 50);
            },
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
      }
      const original = await capture();
      indices.set(triangles);
      upload();
      node.topology = topology;
      node.updateTextureCount(renderer.maxTextures);
      let changedPixels = 0,
        spritePixels = 0;
      for (let i = 0; i < actual.length; i += 4) {
        if (
          actual[i] !== original[i] ||
          actual[i + 1] !== original[i + 1] ||
          actual[i + 2] !== original[i + 2] ||
          actual[i + 3] !== original[i + 3]
        )
          changedPixels++;
        if (actual[i] !== actual[0] || actual[i + 1] !== actual[1] || actual[i + 2] !== actual[2])
          spritePixels++;
      }
      return {
        changedPixels,
        spritePixels,
        textureSlots,
        triangles: topology === gl.TRIANGLES,
        error: gl.getError(),
      };
    }, reference);
    expect(result.triangles).toBe(true);
    expect(result.textureSlots).toBeGreaterThan(1);
    expect(result.error).toBe(0);
    expect(result.spritePixels).toBeGreaterThan(30000);
    expect(result.changedPixels).toBe(0);
    await page.screenshot({
      path: `output/playtest/quad-renderer-${reference.replace(' ', '-')}-${test.info().project.name}.png`,
    });
  });
