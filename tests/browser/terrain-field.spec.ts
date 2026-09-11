import { test, expect } from '@playwright/test';

test('every buildable tile center sits on grass in the shipping terrain', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.ready);
  const result = await page.evaluate(() => {
    const s = window.__game.scene;
    const terrain = s.children.list.find((c) => c.texture?.key === 'terrain');
    const source = terrain.texture.getSourceImage();
    const canvas = document.createElement('canvas');
    canvas.width = source.width;
    canvas.height = source.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(source, 0, 0);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const failures = [];
    for (let y = 2; y < 46; y++)
      for (let x = 2; x < 46; x++) {
        const wx = 896 + (x - y) * 32;
        const wy = 112 + (x + y + 1) * 16;
        const px = Math.floor(
          ((wx - terrain.x + terrain.displayWidth / 2) / terrain.displayWidth) * canvas.width,
        );
        const py = Math.floor(
          ((wy - terrain.y + terrain.displayHeight / 2) / terrain.displayHeight) * canvas.height,
        );
        const offset = (py * canvas.width + px) * 4;
        const [r, g, b] = pixels.slice(offset, offset + 3);
        // This palette check detects the stream, dark forest and dirt that crossed
        // the old field. Visual review still checks the full clearing and its edges.
        if (!(g > r * 1.03 && g > b * 1.4)) failures.push({ x, y, r, g, b });
      }
    return { failures, width: source.width, height: source.height };
  });
  expect(result.failures).toEqual([]);
  expect(result.width).toBeGreaterThanOrEqual(1600);
  expect(result.height).toBeGreaterThanOrEqual(900);
});

test('turf checks follow tile centers, stop at the buildable boundary and survive graphics restoration', async ({
  page,
}) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.ready);
  const result = await page.evaluate(async () => {
    const { scene: s, game } = window.__game;
    document.querySelector<HTMLElement>('#ui')!.style.display = 'none';
    s.paused = true;
    s.tweens.pauseAll();
    for (const child of s.children.list)
      child.setVisible(child.texture?.key === 'terrain' || child === s.ground);
    s.setZoom(1);
    const gl = game.renderer.gl;
    const capture = (points: number[][]) =>
      new Promise<number[][]>((resolve) => {
        game.events.once('postrender', () => {
          resolve(
            points.map(([x, y]) => {
              const p = s.screenFor(x, y);
              const pixel = new Uint8Array(4);
              gl.readPixels(
                Math.floor((p.x * gl.drawingBufferWidth) / s.scale.canvasBounds.width),
                gl.drawingBufferHeight -
                  1 -
                  Math.floor((p.y * gl.drawingBufferHeight) / s.scale.canvasBounds.height),
                1,
                1,
                gl.RGBA,
                gl.UNSIGNED_BYTE,
                pixel,
              );
              return [...pixel].slice(0, 3);
            }),
          );
        });
      });
    // [x, y, shaded]: fixed examples cover alternate cells and all four edges.
    const groups = [
      [
        [23.5, 24.5, 1],
        [24.5, 24.5, 0],
        [25.5, 24.5, 1],
      ],
      [
        [2.5, 3.5, 1],
        [2.5, 2.5, 0],
        [1.5, 4.5, 0],
        [4.5, 1.5, 0],
      ],
      [
        [44.5, 45.5, 1],
        [45.5, 45.5, 0],
        [46.5, 43.5, 0],
        [43.5, 46.5, 0],
      ],
      [
        [2.5, 45.5, 1],
        [2.5, 44.5, 0],
        [1.5, 44.5, 0],
      ],
      [
        [45.5, 2.5, 1],
        [44.5, 2.5, 0],
        [44.5, 1.5, 0],
      ],
    ];
    const failures = [];
    const probes = [];
    for (const restored of [false, true]) {
      if (restored) {
        const extension = gl.getExtension('WEBGL_lose_context');
        if (!extension) throw Error('Context restoration unavailable');
        await new Promise<void>((resolve) => {
          game.canvas.addEventListener(
            'webglcontextlost',
            () => setTimeout(() => extension.restoreContext(), 50),
            { once: true },
          );
          game.canvas.addEventListener(
            'webglcontextrestored',
            () => {
              s.paused = true;
              resolve();
            },
            { once: true },
          );
          extension.loseContext();
        });
      }
      for (const points of groups) {
        const [x, y] = points[0];
        s.cameras.main.centerOn(896 + (x - y) * 32, 112 + (x + y) * 16);
        s.clampCamera();
        s.ground.setVisible(true);
        const checked = await capture(points);
        s.ground.setVisible(false);
        const bare = await capture(points);
        points.forEach(([x, y, shaded], i) => {
          const delta = bare[i].reduce((sum, channel, c) => sum + channel - checked[i][c], 0);
          if (shaded ? delta < 8 : delta !== 0) failures.push({ restored, x, y, shaded, delta });
        });
      }
      // Removing the stencil must leave later world objects visible outside the field.
      const probeX = 896 + (1.5 - 44.5) * 32;
      const probeY = 112 + (1.5 + 44.5) * 16;
      const probe = s.add.rectangle(probeX, probeY, 8, 8, 0xff00ff).setDepth(-899);
      s.cameras.main.centerOn(probeX, probeY);
      s.clampCamera();
      s.ground.setVisible(true);
      probes.push((await capture([[1.5, 44.5]]))[0]);
      probe.destroy();
    }
    return {
      failures,
      probes,
      texture: [
        s.ground.list[1].texture.source[0].width,
        s.ground.list[1].texture.source[0].height,
      ],
      glError: gl.getError(),
    };
  });
  expect(result.failures).toEqual([]);
  expect(result.texture).toEqual([64, 32]);
  expect(result.probes).toEqual([
    [255, 0, 255],
    [255, 0, 255],
  ]);
  expect(result.glError).toBe(0);
});

test('corner masking preserves every pixel of the inverted-diamond reference with two fewer draws', async ({
  page,
}) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.ready);
  await page.locator('[data-action="skip-tutorial"]').click();
  await expect(page.locator('#loading')).toBeHidden();
  const cases = [];
  for (const [width, height] of [
    [390, 844],
    [844, 390],
    [1440, 960],
  ]) {
    await page.setViewportSize({ width, height });
    await page.waitForFunction((width) => window.__game.scene.cameras.main.width === Math.floor(width * devicePixelRatio), width);
    cases.push(
      ...(await page.evaluate(async () => {
        const { scene: s, game } = window.__game;
        s.paused = true;
        s.tweens.pauseAll();
        const gl = game.renderer.gl;
        const [stencil, , release] = s.ground.list;
        const outline = stencil.list[0];
        const original = outline.commandBuffer.slice();
        const drawElements = gl.drawElements,
          drawArrays = gl.drawArrays;
        let draws = 0;
        gl.drawElements = function (...args) {
          draws++;
          return drawElements.apply(this, args);
        };
        gl.drawArrays = function (...args) {
          draws++;
          return drawArrays.apply(this, args);
        };
        const capture = () =>
          new Promise<{ pixels: Uint8Array; draws: number }>((resolve) => {
            draws = 0;
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
              resolve({ pixels, draws });
            });
          });
        const result = [];
        try {
          // Fractional zoom and camera positions exercise both sides of every
          // diamond edge, including where the field crosses the viewport border.
          for (const [x, y, zoom] of [
            [896.3, 600.7, 0.83],
            [896.3, 900.7, 1.37],
            [-400.3, 200.7, 1.03],
            [2000.3, 1200.7, 0.9],
            [896.3, 1500.7, 2.11],
          ]) {
            s.cameras.main.setZoom(zoom * s.scale.displayScale.x, zoom * s.scale.displayScale.y).centerOn(x, y);
            outline.commandBuffer = original.slice();
            stencil.stencilInvert = release.stencilInvert = false;
            const actual = await capture();
            // Independent previous implementation: one complete field diamond
            // and the engine's full-viewport stencil inversion on apply/release.
            outline
              .clear()
              .fillStyle(0xffffff)
              .fillPoints(
                [
                  { x: 896, y: 176 },
                  { x: 2304, y: 880 },
                  { x: 896, y: 1584 },
                  { x: -512, y: 880 },
                ],
                true,
              );
            stencil.stencilInvert = release.stencilInvert = true;
            const reference = await capture();
            let changed = 0;
            for (let i = 0; i < actual.pixels.length; i += 4)
              if (
                actual.pixels[i] !== reference.pixels[i] ||
                actual.pixels[i + 1] !== reference.pixels[i + 1] ||
                actual.pixels[i + 2] !== reference.pixels[i + 2] ||
                actual.pixels[i + 3] !== reference.pixels[i + 3]
              )
                changed++;
            result.push({
              x,
              y,
              zoom,
              changed,
              savedDraws: reference.draws - actual.draws,
              error: gl.getError(),
            });
          }
        } finally {
          outline.commandBuffer = original;
          stencil.stencilInvert = release.stencilInvert = false;
          gl.drawElements = drawElements;
          gl.drawArrays = drawArrays;
        }
        return result;
      })),
    );
  }
  expect(cases).toHaveLength(15);
  expect(cases.filter((c) => c.changed || c.savedDraws !== 2 || c.error)).toEqual([]);
});
