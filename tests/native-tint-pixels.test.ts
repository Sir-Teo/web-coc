import { expect, it } from 'vitest';
import { nativeTintPixels } from '../src/game/native-tint-pixels';

it('clamps transformed straight colors before premultiplying alpha', () => {
  const source = { width: 1, height: 1, data: new Uint8ClampedArray([200, 100, 50, 128]) };
  expect([...nativeTintPixels(source, [2, 0.5, -1], [0, 0.25, 1])]).toEqual([128, 57, 103, 128]);
});

it('keeps positive and negative additions within the source channel range', () => {
  const source = { width: 1, height: 1, data: new Uint8ClampedArray([200, 100, 50, 64]) };
  expect([...nativeTintPixels(source, [1, 1, 1], [0.5, -0.5, 0.125])]).toEqual([64, 0, 21, 64]);
});

it('rounds once after premultiplication rather than quantizing the straight intermediate', () => {
  const source = { width: 1, height: 1, data: new Uint8ClampedArray([1, 1, 1, 200]) };
  expect([...nativeTintPixels(source, [0.5, 0.5, 0.5], [0, 0, 0])]).toEqual([0, 0, 0, 200]);
});

it('packs bottom-up rows, clears transparent RGB and leaves cached source texels untouched', () => {
  const original = [255, 200, 123, 0, 12, 34, 56, 255, 51, 102, 153, 128];
  const source = { width: 1, height: 3, data: new Uint8ClampedArray(original) };
  expect([...nativeTintPixels(source, [1, 1, 1], [0, 0, 0])]).toEqual([
    26, 51, 77, 128, 12, 34, 56, 255, 0, 0, 0, 0,
  ]);
  expect([...source.data]).toEqual(original);
});
