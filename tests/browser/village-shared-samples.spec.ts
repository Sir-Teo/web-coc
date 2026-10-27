import { expect, test } from '@playwright/test';

test('shared animated wall samples match independent pixels and preserve preview tints', async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.goto('/?lazyart');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  await page.evaluate(async () => {
    const { makeBuilding } = await import('/src/game/model.ts');
    const { model, scene } = window.__game;
    model.state.obstacles = [];
    model.state.buildings = Array.from({ length: 12 }, (_, i) =>
      makeBuilding(1000 + i, 'wall', 15 + (i % 4), 15 + Math.floor(i / 4), i < 8 ? 12 : 13),
    );
    model.changed();
    scene.sync();
    scene.resetCamera();
  });
  await page.waitForFunction(() => {
    const p = window.__game.scene.villageNativePresentation;
    return (
      p.levelsReady.get('wall')?.has(12) &&
      p.levelsReady.get('wall')?.has(13) &&
      p.views.size === 12
    );
  });
  const result = await page.evaluate(async () => {
    const { scene, game, model } = window.__game;
    const p = scene.villageNativePresentation;
    scene.paused = true;
    scene.tweens.pauseAll();
    game.loop.setFPSLimit(0);
    const resource = performance
      .getEntriesByType('resource')
      .find((e) => e.name.includes('/src/game/display.ts'))!.name;
    const { setMaxDensity } = await import(/* @vite-ignore */ resource);
    setMaxDensity(game, 0.5);
    setMaxDensity(game, 1);
    for (const child of scene.children.list) child.setVisible(false);
    const cache = p.frameSamples;
    const disabled = { clear() {}, get() {}, set() {} };
    // Isometric coordinates centered on this test's camera, with every wall in view.
    const iso = (x: number, y: number) => ({ x: 896 + (x - y) * 32, y: (x + y) * 16 });
    scene.cameras.main.centerOn(896, 500).setZoom(2);
    const capture = () =>
      new Promise<Uint8Array>((resolve) => {
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
        });
      });
    const difference = (a: Uint8Array, b: Uint8Array) =>
      a.reduce((n, v, i) => n + Number(v !== b[i]), 0);
    const frames: Uint8Array[] = [];
    const comparisons = [];
    for (const [seconds, valid] of [
      [0, true],
      [0.5, false],
      [1.25, true],
    ] as const) {
      p.preview({ ...model.state.buildings[0], x: 19 }, valid);
      const render = (shared: boolean) => {
        p.frameSamples = shared ? cache : disabled;
        for (const entries of p.views.values())
          for (const entry of entries.values()) entry.signature = undefined;
        p.render(model.state.buildings, null, seconds, iso, scene.sprites);
        for (const entries of p.views.values())
          for (const entry of entries.values())
            for (const object of entry.view.objects) object.setVisible(true);
      };
      render(false);
      const independent = await capture();
      render(true);
      const shared = await capture();
      comparisons.push(difference(independent, shared));
      frames.push(shared);
    }
    p.frameSamples = cache;
    p.clear();
    return {
      comparisons,
      animated: difference(frames[0], frames[2]),
      retainedAfterClear: cache.size,
    };
  });
  expect(result.comparisons).toEqual([0, 0, 0]);
  expect(result.animated).toBeGreaterThan(0);
  expect(result.retainedAfterClear).toBe(0);
});
