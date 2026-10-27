import { expect, it, vi } from 'vitest';
import { DecodedImageCache } from '../src/game/decoded-image-cache';

const image = (pixels = 1) => ({ naturalWidth: pixels, naturalHeight: 1 });
const load = () => Promise.resolve(image());

it('shares pending and completed decodes across presentations', async () => {
  const cache = new DecodedImageCache(8);
  const decode = vi.fn(load);
  const first = cache.get('page', decode);
  expect(cache.get('page', decode)).toBe(first);
  await first;
  expect(cache.get('page', decode)).toBe(first);
  expect(decode).toHaveBeenCalledTimes(1);
});

it('evicts the least recently requested image by pixel bytes', async () => {
  const cache = new DecodedImageCache(12);
  const a = await cache.get('a', load);
  const b = await cache.get('b', load);
  expect(await cache.get('a', load)).toBe(a);
  await cache.get('large', () => Promise.resolve(image(2)));
  expect(await cache.get('a', load)).toBe(a);
  expect(await cache.get('b', load)).not.toBe(b);
});

it('does not let an old slow decode evict newer requested pages', async () => {
  const cache = new DecodedImageCache(8);
  let finish!: (value: ReturnType<typeof image>) => void;
  const old = cache.get('slow', () => new Promise((resolve) => (finish = resolve)));
  const b = await cache.get('b', load);
  const c = await cache.get('c', load);
  finish(image());
  await old;
  expect(await cache.get('b', load)).toBe(b);
  expect(await cache.get('c', load)).toBe(c);
  expect(cache.get('slow', load)).not.toBe(old);
});

it('refreshes recency when a pending page is requested again', async () => {
  const cache = new DecodedImageCache(4);
  let finish!: (value: ReturnType<typeof image>) => void;
  const pending = cache.get('slow', () => new Promise((resolve) => (finish = resolve)));
  await cache.get('other', load);
  expect(cache.get('slow', load)).toBe(pending);
  finish(image());
  await pending;
  expect(cache.get('slow', load)).toBe(pending);
});

it('retries failed decodes and preserves other cached pages', async () => {
  const cache = new DecodedImageCache(8);
  const retained = await cache.get('retained', load);
  const failure = new Error('offline');
  await expect(cache.get('retry', () => Promise.reject(failure))).rejects.toBe(failure);
  expect(await cache.get('retry', load)).toEqual(image());
  expect(await cache.get('retained', load)).toBe(retained);
});

it('returns oversized images without retaining or altering caller-owned images', async () => {
  const cache = new DecodedImageCache(4);
  const small = await cache.get('small', load);
  const large = Object.freeze(image(2));
  const decode = vi.fn(() => Promise.resolve(large));
  expect(await cache.get('large', decode)).toBe(large);
  expect(await cache.get('large', decode)).toBe(large);
  expect(decode).toHaveBeenCalledTimes(2);
  expect(large).toEqual(image(2));
  expect(await cache.get('small', load)).toBe(small);
});

it('shares in-flight work even with a zero-byte warm cache', async () => {
  const cache = new DecodedImageCache(0);
  const first = cache.get('page', load);
  expect(cache.get('page', load)).toBe(first);
  await first;
  expect(cache.get('page', load)).not.toBe(first);
});
