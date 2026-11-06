import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { expect, it } from 'vitest';
import evidence from '../reference/characters/art.json';
import balloon from '../reference/characters/balloon/balloon-goblin3.json';
import hound from '../reference/characters/lava_hound/adseeker-lvl5.json';
import icegolem from '../reference/characters/ice_golem/icegolem-lvl5.json';
import type { NativeMeshGraph } from '../src/game/native-mesh';

const hash = (data: Buffer) => createHash('sha256').update(data).digest('hex');
for (const [name, value] of [
  ['balloon/balloon-goblin3', balloon],
  ['lava_hound/adseeker-lvl5', hound],
  ['ice_golem/icegolem-lvl5', icegolem],
] as const)
  it(`${name} retains source timelines, geometry and every sampling region`, async () => {
    const source = evidence.worlds[name];
    const runtime = value as unknown as NativeMeshGraph;
    for (const key of ['clips', 'exports', 'matrices', 'colors', 'emptyTextBounds'] as const)
      expect(runtime[key]).toEqual(source.graph[key]);
    for (const texture of Object.values(source.textures)) {
      const image = await sharp(`public/${texture.path}`)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      expect([image.info.width, image.info.height, hash(image.data)]).toEqual([
        texture.width,
        texture.height,
        texture.rgbaSha256,
      ]);
      for (const region of texture.regions) {
        const [left, top] = region.placement;
        const [x, y, right, bottom] = region.bounds;
        const pixels = await sharp(`public/${texture.path}`)
          .extract({ left, top, width: right - x, height: bottom - y })
          .ensureAlpha()
          .raw()
          .toBuffer();
        expect(hash(pixels)).toBe(region.rgbaSha256);
      }
    }
    for (const [id, commands] of Object.entries(source.graph.shapes))
      for (const [index, [textureId, vertices]] of (commands as [number, number[]][]).entries()) {
        const [actualTexture, actual] = runtime.shapes[id][index];
        const texture = source.textures[textureId] ?? source.textures[String(textureId)];
        expect(actualTexture).toBe(textureId);
        expect(actual.length).toBe(vertices.length);
        const dx = actual[2] * texture.width - (vertices[2] / 65535) * texture.sourceSize[0];
        const dy = actual[3] * texture.height - (vertices[3] / 65535) * texture.sourceSize[1];
        expect(
          texture.regions.some(
            (r) =>
              Math.abs(r.placement[0] - r.bounds[0] - dx) < 1e-9 &&
              Math.abs(r.placement[1] - r.bounds[1] - dy) < 1e-9,
          ),
        ).toBe(true);
        for (let i = 0; i < actual.length; i += 4) {
          expect(actual.slice(i, i + 2)).toEqual(vertices.slice(i, i + 2));
          expect(actual[i + 2] * texture.width - dx).toBeCloseTo(
            (vertices[i + 2] / 65535) * texture.sourceSize[0],
            9,
          );
          expect(actual[i + 3] * texture.height - dy).toBeCloseTo(
            (vertices[i + 3] / 65535) * texture.sourceSize[1],
            9,
          );
        }
      }
  });
