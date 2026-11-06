import { expect, test } from '@playwright/test';

test('Inferno bodies share samples without changing pixels, state or animation', async ({
  page,
}) => {
  test.setTimeout(180000);
  await page.setViewportSize({ width: 1200, height: 900 });
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  const result = await page.evaluate(async () => {
    const { scene, game } = window.__game;
    const { makeBuilding } = await import('/src/game/model.ts');
    scene.paused = true;
    scene.tweens.pauseAll();
    game.loop.setFPSLimit(0);
    for (const child of scene.children.list) child.setVisible(false);
    scene.cameras.main.setScroll(0, 0).setZoom(1).setBackgroundColor('#627c42');
    const p = scene.infernoPresentation;
    p.clear();
    const cache = p.frameSamples;
    let misses = 0;
    let hits = 0;
    const counted = {
      clear() {
        cache.clear();
      },
      get(key: string) {
        const value = cache.get(key);
        if (value) hits++;
        return value;
      },
      set(key: string, value: unknown) {
        misses++;
        cache.set(key, value);
      },
    };
    const disabled = { clear() {}, get() {}, set() {} };
    const iso = (x: number, y: number) => ({ x: 100 + x * 170, y: 110 + y * 165 });
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
    const comparisons = [];
    const observedStates = new Set<string>();
    let animated = 0;
    let first: Uint8Array | undefined;
    for (const mode of ['single', 'multi'] as const) {
      for (const state of ['active', 'empty', 'constructing', 'upgrading', 'ruin'] as const) {
        const buildings = Array.from({ length: 24 }, (_, i) => {
          const b = makeBuilding(
            1000 + i,
            'inferno',
            i % 6,
            Math.floor(i / 6),
            1 + Math.floor(i / 2),
          );
          b.infernoMode = mode;
          if (state === 'empty') b.infernoAmmo = 0;
          if (state === 'constructing') b.constructing = true;
          if (state === 'upgrading') b.upgradeEnd = scene.model.clock + 100000;
          if (state === 'ruin') b.hp = 0;
          return b;
        });
        for (const seconds of [0, 0.37, 1.25]) {
          const render = (shared: boolean) => {
            p.frameSamples = shared ? counted : disabled;
            p.signatures.clear();
            p.render(
              buildings,
              seconds,
              state === 'empty' ? { nativeInfernoAmmo: true, infernos: {} } : null,
              false,
              iso,
            );
          };
          render(false);
          const independent = await capture();
          render(true);
          const shared = await capture();
          for (const view of p.views.values())
            for (const object of view.objects)
              observedStates.add(object.getData('nativeInfernoState'));
          comparisons.push(difference(independent, shared));
          if (mode === 'single' && state === 'active') {
            if (first) animated += difference(first, shared);
            else first = shared;
          }
        }
      }
    }
    p.frameSamples = cache;
    p.clear();
    return {
      comparisons,
      observedStates: [...observedStates].sort(),
      animated,
      misses,
      hits,
      retained: cache.size,
      glError: game.renderer.gl.getError(),
    };
  });
  expect(result.comparisons).toEqual(Array(30).fill(0));
  expect(result.observedStates).toEqual(['active', 'constructing', 'empty', 'ruin', 'upgrading']);
  expect(result.animated).toBeGreaterThan(0);
  expect(result.hits).toBe(360);
  expect(result.misses).toBe(360);
  expect(result.retained).toBe(0);
  expect(result.glError).toBe(0);
});
