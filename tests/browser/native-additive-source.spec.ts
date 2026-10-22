import { test, expect } from '@playwright/test';
import sharp from 'sharp';

test('small additive uploads retain image metadata, reuse resources and release with their owner', async ({
  page,
}) => {
  const small = await sharp(Buffer.from([197, 101, 53, 128, 32, 64, 96, 255]), {
    raw: { width: 2, height: 1, channels: 4 },
  })
    .png()
    .toBuffer();
  const large = await sharp({
    create: {
      width: 129,
      height: 129,
      channels: 4,
      background: { r: 197, g: 101, b: 53, alpha: 0.5 },
    },
  })
    .png()
    .toBuffer();
  await page.route('**/additive-source-small.png', (route) =>
    route.fulfill({ contentType: 'image/png', body: small }),
  );
  await page.route('**/additive-source-large.png', (route) =>
    route.fulfill({ contentType: 'image/png', body: large }),
  );
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  const report = await page.evaluate(async () => {
    const { scene, game } = window.__game;
    const { NativeMeshView, nativeMeshTexture } = await import('/src/game/native-mesh-scene.ts');
    scene.paused = true;
    const renderer = game.renderer;
    const key = (id: number) => nativeMeshTexture('additive-source-test', id);
    scene.load.image(key(0), '/additive-source-small.png');
    scene.load.image(key(1), '/additive-source-large.png');
    await new Promise<void>((resolve) => {
      scene.load.once('complete', resolve);
      scene.load.start();
    });
    const source = (id: number) => scene.textures.get(key(id)).source[0];
    const original = source(0).image!;
    scene.textures.addImage(key(2), original);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 2;
    scene.textures.addCanvas(key(3), canvas);
    scene.textures.addImage(key(4), original);
    const views: InstanceType<typeof NativeMeshView>[] = [];
    const render = (texture: number, blend: number) => {
      const view = new NativeMeshView(scene, 'additive-source-test');
      views.push(view);
      view.render(
        [
          {
            key: 'sample',
            texture,
            vertices: [0, 0, 0, 0, 0, 20, 0, 1, 20, 0, 1, 0, 20, 20, 1, 1],
            matrix: [1, 0, 0, 0, 1, 0],
            multiply: [1, 1, 1, 0.5],
            add: [0, 0, 0, 0],
            blend,
          },
        ],
        0,
        0,
        0,
      );
    };
    const baseline = renderer.glTextureWrappers.length;
    const previous = source(0).glTexture!;
    render(0, 8);
    const prepared = source(0).glTexture!;
    const packed = Array.from(prepared.pixels as Uint8Array);
    render(0, 8);
    const reused = source(0).glTexture === prepared;
    const imageKept = source(0).image === original;
    const releasedPrevious = previous.pixels === null;
    const unchanged = [1, 2, 3].map((id) => {
      const before = source(id).glTexture;
      render(id, id === 2 ? 0 : 8);
      return source(id).glTexture === before;
    });
    const texImage = WebGLRenderingContext.prototype.texImage2D;
    let attempts = 0;
    const fallbackBefore = source(4).glTexture;
    WebGLRenderingContext.prototype.texImage2D = new Proxy(texImage, {
      apply(method, receiver, args) {
        if (receiver.canvas !== game.canvas) {
          attempts++;
          throw new Error('Auxiliary read unavailable');
        }
        return Reflect.apply(method, receiver, args);
      },
    });
    try {
      render(4, 8);
      render(4, 8);
    } finally {
      WebGLRenderingContext.prototype.texImage2D = texImage;
    }
    const fallbackKept = source(4).glTexture === fallbackBefore;
    const stableCount = renderer.glTextureWrappers.length === baseline;
    for (const view of views) view.destroy();
    scene.textures.remove(key(0));
    const released = prepared.pixels === null;
    scene.textures.addImage(key(0), original);
    render(0, 8);
    const reloaded = Array.from(source(0).glTexture!.pixels as Uint8Array);
    views.at(-1)!.destroy();
    for (let id = 0; id < 5; id++) scene.textures.remove(key(id));
    return {
      packed,
      reloaded,
      reused,
      imageKept,
      releasedPrevious,
      unchanged,
      attempts,
      fallbackKept,
      stableCount,
      released,
      remaining: renderer.glTextureWrappers.length - baseline,
      gl: renderer.gl.getError(),
    };
  });
  expect(report.packed).toEqual([99, 51, 27, 128, 32, 64, 96, 255]);
  expect(report.reloaded).toEqual(report.packed);
  expect(report.reused).toBe(true);
  expect(report.imageKept).toBe(true);
  expect(report.releasedPrevious).toBe(true);
  expect(report.unchanged).toEqual([true, true, true]);
  expect(report.attempts).toBe(1);
  expect(report.fallbackKept).toBe(true);
  expect(report.stableCount).toBe(true);
  expect(report.released).toBe(true);
  expect(report.remaining).toBe(-5);
  expect(report.gl).toBe(0);
});
