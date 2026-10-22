import { test, expect } from '@playwright/test';
import sharp from 'sharp';

test('native tint inputs preserve translucent PNG/WebP colors and release readback resources', async ({
  page,
}) => {
  const pixels = [
    197, 101, 53, 255, 231, 112, 57, 1, 87, 149, 211, 17, 29, 163, 71, 64, 251, 63, 139, 128, 0, 0,
    0, 0,
  ];
  await page.route('**/native-pixel-test', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Tint pixels</title>' }),
  );
  for (const format of ['png', 'webp']) {
    const image = sharp(Buffer.from(pixels), { raw: { width: 3, height: 2, channels: 4 } });
    const body = await (format === 'png' ? image.png() : image.webp({ lossless: true })).toBuffer();
    await page.route(`**/native-pixel-test.${format}`, (route) =>
      route.fulfill({ contentType: `image/${format}`, body }),
    );
  }
  const large = await sharp({
    create: {
      width: 1025,
      height: 1025,
      channels: 4,
      background: { r: 1, g: 2, b: 3, alpha: 0.5 },
    },
  })
    .png()
    .toBuffer();
  await page.route('**/native-pixel-test.large.png', (route) =>
    route.fulfill({ contentType: 'image/png', body: large }),
  );
  await page.goto('/native-pixel-test');
  const report = await page.evaluate(async () => {
    const { readNativeSourcePixels } = await import('/src/game/native-source-pixels.ts');
    const contexts: WebGLRenderingContext[] = [];
    const textures = new Set<WebGLTexture>();
    const framebuffers = new Set<WebGLFramebuffer>();
    const getContext = HTMLCanvasElement.prototype.getContext;
    let blocked = false;
    HTMLCanvasElement.prototype.getContext = new Proxy(getContext, {
      apply(target, canvas, args) {
        if (args[0] === 'webgl' && blocked) return null;
        const context = Reflect.apply(target, canvas, args);
        if (args[0] === 'webgl' && context) {
          contexts.push(context);
          for (const [create, remove, live] of [
            ['createTexture', 'deleteTexture', textures],
            ['createFramebuffer', 'deleteFramebuffer', framebuffers],
          ] as const) {
            context[create] = new Proxy(context[create], {
              apply(method, receiver, params) {
                const resource = Reflect.apply(method, receiver, params);
                if (resource) live.add(resource);
                return resource;
              },
            });
            context[remove] = new Proxy(context[remove], {
              apply(method, receiver, params) {
                live.delete(params[0]);
                return Reflect.apply(method, receiver, params);
              },
            });
          }
        }
        return context;
      },
    });
    try {
      const images: HTMLImageElement[] = [];
      const reads: number[][] = [];
      for (const format of ['png', 'webp']) {
        const image = new Image();
        image.src = `/native-pixel-test.${format}`;
        await image.decode();
        images.push(image);
        reads.push(Array.from(readNativeSourcePixels(image)!.data));
      }
      reads.push(Array.from(readNativeSourcePixels(images[0])!.data));
      const oversized = new Image();
      oversized.src = '/native-pixel-test.large.png';
      await oversized.decode();
      const largeRejected = readNativeSourcePixels(oversized) === undefined;
      const reused = contexts.length;
      const lose = (gl: WebGLRenderingContext) =>
        new Promise<void>((resolve) => {
          gl.canvas.addEventListener('webglcontextlost', () => resolve(), { once: true });
          gl.getExtension('WEBGL_lose_context')!.loseContext();
        });
      await lose(contexts[0]);
      reads.push(Array.from(readNativeSourcePixels(images[0])!.data));
      const recovered = contexts.length;
      await lose(contexts[1]);
      blocked = true;
      const unavailable = readNativeSourcePixels(images[0]) === undefined;
      blocked = false;
      reads.push(Array.from(readNativeSourcePixels(images[0])!.data));
      const gl = contexts.at(-1)!;
      const check = gl.checkFramebufferStatus;
      gl.checkFramebufferStatus = () => gl.FRAMEBUFFER_INCOMPLETE_ATTACHMENT;
      const incomplete = readNativeSourcePixels(images[0]) === undefined;
      gl.checkFramebufferStatus = check;
      reads.push(Array.from(readNativeSourcePixels(images[0])!.data));
      return {
        reads,
        largeRejected,
        reused,
        recovered,
        unavailable,
        incomplete,
        textures: textures.size,
        framebuffers: framebuffers.size,
      };
    } finally {
      HTMLCanvasElement.prototype.getContext = getContext;
    }
  });
  for (const read of report.reads) expect(read).toEqual(pixels);
  expect(report.largeRejected).toBe(true);
  expect(report.reused).toBe(1);
  expect(report.recovered).toBe(2);
  expect(report.unavailable).toBe(true);
  expect(report.incomplete).toBe(true);
  expect(report.textures).toBe(0);
  expect(report.framebuffers).toBe(0);
});
