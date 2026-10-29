import { afterEach, expect, it, vi } from 'vitest';
import { DecodedImageCache } from '../src/game/decoded-image-cache';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

it('selects the phone budget from primary input, independently of viewport and browser name', async () => {
  const query = vi.fn((value: string) => ({ matches: value === '(pointer: coarse)' }));
  vi.stubGlobal('matchMedia', query);
  const { runtimeBudget } = await import('../src/game/runtime-budget');
  expect(query).toHaveBeenCalledWith('(pointer: coarse)');
  expect(runtimeBudget.maxDensity).toBe(2);
  expect(runtimeBudget.playFps).toBe(60);
  expect(
    runtimeBudget.decodedImageBytes +
      runtimeBudget.freeGroupBytes +
      runtimeBudget.tintedTextureBytes +
      runtimeBudget.sourcePixelBytes,
  ).toBe(44 << 20);
});

it('retains native desktop density when primary input is precise or unavailable', async () => {
  for (const query of [undefined, () => ({ matches: false })]) {
    vi.resetModules();
    vi.stubGlobal('matchMedia', query);
    const { runtimeBudget } = await import('../src/game/runtime-budget');
    expect(runtimeBudget.maxDensity).toBe(Infinity);
    expect(runtimeBudget.playFps).toBe(0);
    expect(runtimeBudget.decodedImageBytes).toBe(64 << 20);
  }
});

it('evicts warm phone pages without invalidating images retained by a live presentation', async () => {
  vi.stubGlobal('matchMedia', () => ({ matches: true }));
  const { runtimeBudget } = await import('../src/game/runtime-budget');
  const cache = new DecodedImageCache(runtimeBudget.decodedImageBytes);
  // Three eight-MiB images exceed the phone's warm budget but fit on desktop.
  const load = vi.fn(async () => Object.freeze({ naturalWidth: 2048, naturalHeight: 1024 }));
  const live = await cache.get('live', load);
  await cache.get('second', load);
  await cache.get('third', load);
  expect(live.naturalWidth).toBe(2048);
  expect(await cache.get('live', load)).not.toBe(live);
  expect(load).toHaveBeenCalledTimes(4);
});
