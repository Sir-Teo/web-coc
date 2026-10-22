import { describe, expect, it } from 'vitest';
import { compareSourcePixels } from './fixtures/source-pixel-comparison';

describe('source pixel comparisons', () => {
  // WebGL starts with the bottom row; RGB background pixels ignore differing alpha.
  const actual = new Uint8Array([
    48, 65, 53, 0, 70, 90, 120, 255, 48, 65, 53, 99, 10, 20, 30, 255, 100, 100, 100, 255, 48, 65,
    53, 255,
  ]);
  const expected = new Uint8Array([
    48, 65, 53, 255, 54, 90, 120, 255, 48, 65, 53, 255, 10, 20, 30, 255, 80, 105, 120, 255, 49, 65,
    53, 255,
  ]);
  const frame = { width: 3, height: 2 };

  it('counts either image’s foreground, maximum RGB error and differences above sixteen', () => {
    expect(compareSourcePixels(actual, expected, frame, { x: 0, y: 0, ...frame })).toEqual({
      colored: 4,
      meanError: 9.25,
      largeFraction: 0.25,
      maximum: 20,
      largePixels: [{ x: 1, y: 0, actual: [100, 100, 100], expected: [80, 105, 120] }],
    });
  });

  it('uses top-left tile coordinates and reports differences relative to the tile', () => {
    const result = compareSourcePixels(actual, expected, frame, {
      x: 1,
      y: 0,
      width: 2,
      height: 2,
    });
    expect(result).toEqual({
      colored: 3,
      meanError: 37 / 3,
      largeFraction: 1 / 3,
      maximum: 20,
      largePixels: [{ x: 0, y: 0, actual: [100, 100, 100], expected: [80, 105, 120] }],
    });
    expect(
      compareSourcePixels(actual, expected, frame, { x: 0, y: 1, width: 1, height: 1 }),
    ).toEqual({ colored: 0, meanError: 0, largeFraction: 0, maximum: 0, largePixels: [] });
  });

  it('limits diagnostic pixels while counting every significant difference', () => {
    const actual = new Uint8Array(40 * 4);
    const expected = new Uint8Array(40 * 4);
    for (let i = 0; i < 40; i++) expected[i * 4] = 40;
    const result = compareSourcePixels(
      actual,
      expected,
      { width: 40, height: 1 },
      { x: 0, y: 0, width: 40, height: 1 },
    );
    expect(result).toMatchObject({ colored: 40, meanError: 40, largeFraction: 1, maximum: 40 });
    expect(result.largePixels).toHaveLength(32);
    expect(result.largePixels.at(-1)?.x).toBe(31);
  });

  it('rejects incomplete buffers and regions outside the captured frame', () => {
    const tile = { x: 0, y: 0, ...frame };
    expect(() => compareSourcePixels(actual.subarray(4), expected, frame, tile)).toThrow(
      RangeError,
    );
    expect(() => compareSourcePixels(actual, expected, frame, { ...tile, x: 1 })).toThrow(
      RangeError,
    );
    expect(() => compareSourcePixels(actual, expected, frame, { ...tile, x: 0.5 })).toThrow(
      RangeError,
    );
  });
});
