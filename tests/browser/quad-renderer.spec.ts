import { test, expect } from '@playwright/test';

test('independent sprite triangles preserve every rendered pixel across frames and transforms', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.ready);
  await page.locator('[data-action="skip-tutorial"]').click();
  const result = await page.evaluate(async () => {
    const { scene, game } = window.__game;
    scene.paused = true;
    scene.tweens.pauseAll();
    for (const child of scene.children.list) child.setVisible(false);
    scene.cameras.main.setScroll(0, 0).setZoom(1);
    const kinds = ['swordsman', 'archer', 'giant', 'wizard', 'balloon', 'goblin', 'wallbreaker'];
    for (let row = 0; row < kinds.length; row++)
      for (let frame = 0; frame < 4; frame++)
        scene.add.image(130 + frame * 170.3, 110 + row * 105.2, `${kinds[row]}-walk`, frame)
          .setOrigin(0.5, 122 / 128).setScale(0.7 + frame * 0.1)
          .setFlipX(frame % 2 === 0).setAngle(frame * 11)
          .setAlpha(frame === 3 ? 0.6 : 1).setTint(frame === 2 ? 0xffbbee : 0xffffff);
    const renderer = game.renderer, gl = renderer.gl;
    const node = renderer.renderNodes.getNode('BatchHandlerQuad');
    const indices = new Uint16Array(node.indexBuffer.dataBuffer);
    const triangles = indices.slice();
    const topology = node.topology;
    const upload = () => {
      renderer.glWrapper.update({ vao: null, bindings: { elementArrayBuffer: node.indexBuffer } }, true);
      node.indexBuffer.update();
    };
    const capture = () => new Promise<Uint8Array>((resolve) => {
      game.events.once('postrender', () => {
        const pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
        gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        resolve(pixels);
      });
    });
    const actual = await capture();
    // Reconstruct the pinned engine's original strip for an independent raster reference.
    for (let i = 0; i < indices.length; i += 6) {
      const v = i / 6 * 4;
      indices.set([v, v, v + 1, v + 2, v + 3, v + 3], i);
    }
    upload();
    node.topology = gl.TRIANGLE_STRIP;
    const original = await capture();
    indices.set(triangles);
    upload();
    node.topology = topology;
    let changedPixels = 0, spritePixels = 0;
    for (let i = 0; i < actual.length; i += 4) {
      if (actual[i] !== original[i] || actual[i + 1] !== original[i + 1] ||
          actual[i + 2] !== original[i + 2] || actual[i + 3] !== original[i + 3]) changedPixels++;
      if (actual[i] !== actual[0] || actual[i + 1] !== actual[1] || actual[i + 2] !== actual[2]) spritePixels++;
    }
    return { changedPixels, spritePixels, triangles: topology === gl.TRIANGLES, error: gl.getError() };
  });
  expect(result.triangles).toBe(true);
  expect(result.error).toBe(0);
  expect(result.spritePixels).toBeGreaterThan(30000);
  expect(result.changedPixels).toBe(0);
  await page.screenshot({ path: `output/playtest/quad-renderer-${test.info().project.name}.png` });
});
