import { expect, test } from '@playwright/test';

for (const { filtered, blend } of [
  { filtered: false, blend: 8 },
  { filtered: true, blend: 8 },
  { filtered: false, blend: 3 },
]) {
  test(`animated ${filtered ? 'filtered' : 'plain'} ${blend === 3 ? 'multiply' : 'additive'} buffers shrink after sustained smaller content`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width: 400, height: 400 });
    await page.addInitScript(() => performance.setResourceTimingBufferSize(4000));
    await page.goto('/?lazyart');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').click();
    const result = await page.evaluate(
      async ({ filtered, blend }) => {
        const { scene, game } = window.__game;
        scene.paused = true;
        scene.tweens.pauseAll();
        game.loop.setFPSLimit(0);
        for (const object of scene.children.list) object.setVisible(false);
        scene.cameras.main.setScroll(0, 0).setZoom(1);
        const resource = (path: string) =>
          performance.getEntriesByType('resource').find((e) => e.name.includes(path))!.name;
        const { NativeSceneView } = await import(
          /* @vite-ignore */ resource('/src/game/native-scene-view.ts')
        );
        const { flushGroupBuffers } = await import(
          /* @vite-ignore */ resource('/src/game/native-group-buffer.ts')
        );
        const { setMaxDensity } = await import(/* @vite-ignore */ resource('/src/game/display.ts'));
        setMaxDensity(game, 0.5);
        setMaxDensity(game, 1);
        flushGroupBuffers(scene);
        const prefix = 'animated-shrink';
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 2;
        const context = canvas.getContext('2d')!;
        context.fillStyle = '#c86432';
        context.fillRect(0, 0, 2, 2);
        scene.textures.addCanvas(prefix + ':mesh:1', canvas);
        const sample = (scale: number, frame: number) => {
          const leaf = (key: string) => ({
            key,
            texture: 1,
            vertices: [0, 0, 0, 0, 0, 10, 0, 1, 10, 0, 1, 0, 10, 10, 1, 1],
            matrix: [scale, 0, (frame % 2) * 0.125, 0, scale, 0],
            multiply: [1, 1, 1, 0.5],
            add: [0, 0, 0, 0],
            blend: 0,
          });
          return [
            {
              key: 'glow',
              group: [leaf('one'), leaf('two')],
              multiply: [filtered ? 0.6 : 1, 1, 1, 1],
              add: [0, 0, 0, 0],
              blend,
            },
          ];
        };
        const view = new NativeSceneView(scene, prefix);
        const render = (scale: number, frame: number) =>
          view.render(sample(scale, frame), 100, 100, 0, 1, 1);
        const area = () => {
          const entry = view.groups.get('glow')!;
          return {
            buffer: entry.buffer.width * entry.buffer.height,
            source: entry.source ? entry.source.width * entry.source.height : 0,
            oversized: entry.oversized,
          };
        };
        render(20, 0);
        const large = area();
        for (let i = 0; i < 60; i++) render(1, i);
        const pending = area();
        for (let i = 60; i < 140; i++) render(1, i);
        const small = area();
        const capture = () =>
          new Promise<Uint8Array>((resolve) =>
            game.events.once('postrender', () => {
              const gl = game.renderer.gl;
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
            }),
          );
        const actual = await capture();
        for (const object of view.objects) object.setVisible(false);
        const fresh = new NativeSceneView(scene, prefix);
        fresh.render(sample(1, 139), 100, 100, 0, 1, 1);
        const expected = await capture();
        let changed = 0;
        for (let i = 0; i < actual.length; i++) if (actual[i] !== expected[i]) changed++;
        view.destroy();
        fresh.destroy();
        flushGroupBuffers(scene);
        return { large, pending, small, changed };
      },
      { filtered, blend },
    );
    expect(result.pending.buffer).toBe(result.large.buffer);
    expect(result.small.buffer).toBeLessThan(result.large.buffer / 4);
    expect(result.small.oversized).toBe(0);
    if (filtered) expect(result.small.source).toBeLessThan(result.large.source / 4);
    expect(result.changed).toBe(0);
  });
}
