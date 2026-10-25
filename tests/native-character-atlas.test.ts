import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { expect, it } from 'vitest';
import evidence from '../reference/characters/art.json';
import dragon5 from '../reference/characters/dragon/dragon5.json';
import golden from '../reference/characters/dragon/golden-dragon.json';
import dragon7 from '../reference/garrison/dragon7.json';
import { nativeMeshTexture } from '../src/game/native-mesh';

const hash = (data: Buffer) => createHash('sha256').update(data).digest('hex');

for (const [name, runtime, bytes] of [
  ['dragon/dragon5', dragon5, 13_329_792],
  ['dragon/golden-dragon', golden, 15_955_328],
] as const)
  it(`${name} packs exact source sampling regions and retains the legacy atlas`, async () => {
    const source = evidence.worlds[name];
    for (const field of ['exports', 'clips', 'matrices', 'colors', 'emptyTextBounds'] as const)
      expect(runtime[field]).toEqual(source.graph[field]);
    const texture = source.textures['0'];
    expect(texture.width * texture.height * 4).toBe(bytes);
    expect(runtime.textures['0'].path).toBe(texture.path);
    expect(texture.path).not.toBe(texture.legacy.path);
    const packed = await sharp(`public/${texture.path}`)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const legacy = await sharp(`public/${texture.legacy.path}`)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    for (const [actual, expected] of [
      [packed, texture],
      [legacy, texture.legacy],
    ] as const)
      expect([actual.info.width, actual.info.height, hash(actual.data)]).toEqual([
        expected.width,
        expected.height,
        expected.rgbaSha256,
      ]);
    for (const region of texture.regions) {
      const [left, top, right, bottom] = region.bounds;
      const width = right - left,
        height = bottom - top;
      for (const [image, x, y] of [
        [packed, ...region.placement],
        [legacy, left - texture.bounds[0], top - texture.bounds[1]],
      ] as const) {
        const pixels = Buffer.alloc(width * height * 4);
        for (let row = 0; row < height; row++) {
          const start = ((y + row) * image.info.width + x) * 4;
          image.data.copy(pixels, row * width * 4, start, start + width * 4);
        }
        expect(hash(pixels)).toBe(region.rgbaSha256);
      }
    }
    for (const [id, commands] of Object.entries(source.graph.shapes))
      for (const [index, [textureId, vertices]] of (commands as [number, number[]][]).entries()) {
        const [actualTexture, actual] = runtime.shapes[id][index];
        expect(actualTexture).toBe(textureId);
        expect(actual.length).toBe(vertices.length);
        const dx = actual[2] * texture.width - (vertices[2] / 65535) * texture.sourceSize[0];
        const dy = actual[3] * texture.height - (vertices[3] / 65535) * texture.sourceSize[1];
        expect(
          texture.regions.some(
            (region) =>
              Math.abs(region.placement[0] - region.bounds[0] - dx) < 1e-9 &&
              Math.abs(region.placement[1] - region.bounds[1] - dy) < 1e-9,
          ),
        ).toBe(true);
        for (let i = 0; i < vertices.length; i += 4) {
          expect(actual.slice(i, i + 2)).toEqual(vertices.slice(i, i + 2));
          expect(actual[i + 2] * texture.width - dx).toBeCloseTo(
            (vertices[i + 2] / 65535) * texture.sourceSize[0],
            10,
          );
          expect(actual[i + 3] * texture.height - dy).toBeCloseTo(
            (vertices[i + 3] / 65535) * texture.sourceSize[1],
            10,
          );
        }
      }
  });

it('shares the packed Golden Dragon page with Dragon 7', () => {
  expect(dragon7.textures).toEqual(golden.textures);
  expect(dragon7.shapes).toEqual(golden.shapes);
  expect(nativeMeshTexture('character-golden-dragon', 0)).toBe(
    nativeMeshTexture('garrison-dragon', '0'),
  );
  expect(nativeMeshTexture('character-golden-dragon', 1)).toBe('character-golden-dragon:mesh:1');
});
