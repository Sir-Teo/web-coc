import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import index from '../reference/full-client/village-art.json' with { type: 'json' };
import { pageNativePack } from '../scripts/native-pages.mjs';
import {
  nativeScenePoses,
  type NativeMeshGraph,
  type NativeMeshPose,
  type NativeScenePose,
} from '../src/game/native-mesh';

type Row = {
  level: number;
  refs?: Record<string, { scene: string; export: string }>;
  states?: Record<string, { scene: string; exports: string[] }>;
};
interface Pack {
  levels: Row[];
  scenes: Record<string, NativeMeshGraph>;
}
interface Image {
  data: Buffer;
  width: number;
  height: number;
}
const images = new Map<string, Promise<Image>>();
const read = (path: string) => {
  let pending = images.get(path);
  if (!pending) {
    pending = sharp(`public/${path}`)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
      .then(({ data, info }) => ({ data, width: info.width, height: info.height }));
    images.set(path, pending);
  }
  return pending;
};
const leaves = (poses: NativeScenePose[]): NativeMeshPose[] =>
  poses.flatMap((p) => ('group' in p ? leaves(p.group) : [p]));
const exportsOf = (row: Row) =>
  row.refs
    ? Object.values(row.refs).map((r) => [r.scene, r.export] as const)
    : Object.values(row.states ?? {}).flatMap((s) => s.exports.map((e) => [s.scene, e] as const));
const ROOT = [1.2, 0, 0, 0, 1.2, -64] as [number, number, number, number, number, number];
const village = (kind: string) => (index.buildings as Record<string, { path: string }>)[kind].path;

// The starter village and army, and larger families whose levels share art.
const SAMPLES = [
  village('townhall'),
  village('builder'),
  village('goldmine'),
  village('scattershot'),
  'assets/troops-native/swordsman/graph.json',
  'assets/troops-native/archer/graph.json',
  'assets/troops-native/giant/graph.json',
];

describe('level-paged native packs', () => {
  for (const file of SAMPLES)
    it(`page ${file} so every level draws exactly what it drew`, async () => {
      const family = JSON.parse(readFileSync(`public/${file}`, 'utf8')) as Pack;
      const result = await pageNativePack(family, read, 'assets/native-pages/test');
      expect(result).not.toBeNull();
      const paged = result!.pack as Pack;
      const pages = new Map<string, Image>(
        result!.pages.map((p: { path: string; pixels: Buffer; width: number; height: number }) => [
          p.path,
          { data: p.pixels, width: p.width, height: p.height },
        ]),
      );
      let compared = 0;
      for (const row of family.levels)
        for (const [scene, exportName] of exportsOf(row)) {
          const from = family.scenes[scene];
          const to = paged.scenes[scene];
          if (from?.exports[exportName] === undefined) continue;
          for (const clock of [0, 0.37, 1.9]) {
            const a = leaves(nativeScenePoses(from, exportName, clock, {}, ROOT));
            const b = leaves(nativeScenePoses(to, exportName, clock, {}, ROOT));
            expect(b.length).toBe(a.length);
            for (let i = 0; i < a.length; i++) {
              const [p, q] = [a[i], b[i]];
              compared++;
              expect(q.key).toBe(p.key);
              expect(q.matrix).toEqual(p.matrix);
              expect(q.multiply).toEqual(p.multiply);
              expect(q.add).toEqual(p.add);
              expect(q.blend).toBe(p.blend);
              const fromTexture = from.textures[p.texture];
              const toTexture = to.textures[q.texture];
              // The loader fetches only pages tagged with the level it draws.
              expect(toTexture.levels).toContain(row.level);
              const src = await read(fromTexture.path);
              const dst = pages.get(toTexture.path)!;
              expect([dst.width, dst.height]).toEqual([toTexture.width, toTexture.height]);
              const dx = q.vertices[2] * toTexture.width - p.vertices[2] * fromTexture.width;
              const dy = q.vertices[3] * toTexture.height - p.vertices[3] * fromTexture.height;
              expect(Math.abs(dx - Math.round(dx))).toBeLessThan(1e-6);
              expect(Math.abs(dy - Math.round(dy))).toBeLessThan(1e-6);
              let u0 = Infinity,
                v0 = Infinity,
                u1 = -Infinity,
                v1 = -Infinity;
              for (let k = 0; k < p.vertices.length; k += 4) {
                expect(q.vertices[k]).toBe(p.vertices[k]);
                expect(q.vertices[k + 1]).toBe(p.vertices[k + 1]);
                const ku =
                  q.vertices[k + 2] * toTexture.width - p.vertices[k + 2] * fromTexture.width;
                const kv =
                  q.vertices[k + 3] * toTexture.height - p.vertices[k + 3] * fromTexture.height;
                expect(ku).toBeCloseTo(dx, 6);
                expect(kv).toBeCloseTo(dy, 6);
                u0 = Math.min(u0, p.vertices[k + 2] * fromTexture.width);
                u1 = Math.max(u1, p.vertices[k + 2] * fromTexture.width);
                v0 = Math.min(v0, p.vertices[k + 3] * fromTexture.height);
                v1 = Math.max(v1, p.vertices[k + 3] * fromTexture.height);
              }
              // Every texel bilinear filtering can read for this shape is the one it read
              // before, past the atlas edge included, where the atlas clamped to its edge.
              const sx = Math.round(dx),
                sy = Math.round(dy);
              const clamp = (v: number, size: number) => Math.min(size - 1, Math.max(0, v));
              for (let y = Math.floor(v0) - 1; y < Math.ceil(v1) + 1; y++)
                for (let x = Math.floor(u0) - 1; x < Math.ceil(u1) + 1; x++) {
                  const s = (clamp(y, src.height) * src.width + clamp(x, src.width)) * 4,
                    d = (clamp(y + sy, dst.height) * dst.width + clamp(x + sx, dst.width)) * 4;
                  if (src.data.readUInt32LE(s) !== dst.data.readUInt32LE(d))
                    throw Error(`${file} level ${row.level}: texel ${x},${y} differs`);
                }
            }
          }
        }
      expect(compared).toBeGreaterThan(0);
      // A low level fetches a small share of what the family atlases held.
      const total = Object.values(family.scenes)
        .flatMap((g) => Object.values(g.textures))
        .reduce((n, t) => n + t.width * t.height, 0);
      const first = Math.min(...family.levels.map((r) => r.level));
      const firstTexels = Object.values(paged.scenes)
        .flatMap((g) => Object.values(g.textures))
        .filter((t) => t.levels!.includes(first))
        .reduce((n, t) => n + t.width * t.height, 0);
      expect(firstTexels).toBeLessThan(total * 0.5);
    }, 120000);

  it('leaves a pack whose levels share most of their art unpaged', async () => {
    const file = 'assets/troops-native/superdragon/graph.json';
    const family = JSON.parse(readFileSync(`public/${file}`, 'utf8')) as Pack;
    expect(await pageNativePack(family, read, 'assets/native-pages/test')).toBeNull();
  }, 120000);
});
