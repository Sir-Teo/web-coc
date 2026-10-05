import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import index from '../reference/full-client/village-art.json' with { type: 'json' };
import levelIndex from '../reference/full-client/village-levels.json' with { type: 'json' };
import {
  nativeScenePoses,
  type NativeMeshGraph,
  type NativeMeshPose,
  type NativeScenePose,
} from '../src/game/native-mesh';

interface Pack {
  levels: { level: number; refs: Record<string, { scene: string; export: string }> }[];
  scenes: Record<string, NativeMeshGraph>;
}
const read = (path: string) => JSON.parse(readFileSync(`public/${path}`, 'utf8')) as Pack;
const images = new Map<string, Promise<{ data: Buffer; width: number; height: number }>>();
const image = (path: string) => {
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
const ROOT = [1.2, 0, 0, 0, 1.2, -64] as [number, number, number, number, number, number];

// The starter village's families and a spread of others, low and high levels.
const SAMPLES: [string, number][] = [
  ['townhall', 2],
  ['townhall', 11],
  ['builder', 1],
  ['goldstorage', 1],
  ['elixirstorage', 2],
  ['goldmine', 2],
  ['collector', 1],
  ['barracks', 2],
  ['camp', 2],
  ['wall', 2],
  ['laboratory', 9],
  ['airdefense', 12],
];

describe('per-level village packs', () => {
  it('index only levels that have a pack, and cover the starter village', () => {
    const levels = levelIndex.levels as Record<string, number[]>;
    for (const [kind, list] of Object.entries(levels))
      for (const level of list)
        expect(() => read(`assets/village-levels/${kind}/${level}.json`)).not.toThrow();
    for (const [kind, level] of SAMPLES) expect(levels[kind]).toContain(level);
  });

  for (const [kind, level] of SAMPLES)
    it(`draw ${kind} level ${level} exactly as its family pack does`, async () => {
      const family = read((index.buildings as Record<string, { path: string }>)[kind].path);
      const split = read(`assets/village-levels/${kind}/${level}.json`);
      const row = split.levels[0];
      expect(row.level).toBe(level);
      const familyRow = family.levels.find((r) => r.level === level)!;
      let compared = 0;
      for (const [field, ref] of Object.entries(row.refs)) {
        expect(familyRow.refs[field]).toEqual(ref);
        for (const clock of [0, 0.37, 1.9, 7.25]) {
          const a = leaves(nativeScenePoses(family.scenes[ref.scene], ref.export, clock, {}, ROOT));
          const b = leaves(nativeScenePoses(split.scenes[ref.scene], ref.export, clock, {}, ROOT));
          expect(b.length).toBe(a.length);
          compared += a.length;
          for (let i = 0; i < a.length; i++) {
            const [p, q] = [a[i], b[i]];
            expect(q.key).toBe(p.key);
            expect(q.matrix).toEqual(p.matrix);
            expect(q.multiply).toEqual(p.multiply);
            expect(q.add).toEqual(p.add);
            expect(q.blend).toBe(p.blend);
            const from = family.scenes[ref.scene].textures[p.texture];
            const to = split.scenes[ref.scene].textures[q.texture];
            const [src, dst] = await Promise.all([image(from.path), image(to.path)]);
            // One whole-texel shift moves every vertex of the shape; positions are unchanged.
            const dx = q.vertices[2] * to.width - p.vertices[2] * from.width;
            const dy = q.vertices[3] * to.height - p.vertices[3] * from.height;
            expect(Math.abs(dx - Math.round(dx))).toBeLessThan(1e-6);
            expect(Math.abs(dy - Math.round(dy))).toBeLessThan(1e-6);
            let u0 = Infinity,
              v0 = Infinity,
              u1 = -Infinity,
              v1 = -Infinity;
            for (let k = 0; k < p.vertices.length; k += 4) {
              expect(q.vertices[k]).toBe(p.vertices[k]);
              expect(q.vertices[k + 1]).toBe(p.vertices[k + 1]);
              expect(q.vertices[k + 2] * to.width - p.vertices[k + 2] * from.width).toBeCloseTo(
                dx,
                6,
              );
              expect(q.vertices[k + 3] * to.height - p.vertices[k + 3] * from.height).toBeCloseTo(
                dy,
                6,
              );
              u0 = Math.min(u0, p.vertices[k + 2] * from.width);
              u1 = Math.max(u1, p.vertices[k + 2] * from.width);
              v0 = Math.min(v0, p.vertices[k + 3] * from.height);
              v1 = Math.max(v1, p.vertices[k + 3] * from.height);
            }
            // Every texel bilinear filtering can read for this shape is the one it read before,
            // past the atlas edge included, where the atlas clamped to its edge texel.
            const sx = Math.round(dx),
              sy = Math.round(dy);
            const clamp = (v: number, size: number) => Math.min(size - 1, Math.max(0, v));
            for (let y = Math.floor(v0) - 1; y < Math.ceil(v1) + 1; y++)
              for (let x = Math.floor(u0) - 1; x < Math.ceil(u1) + 1; x++) {
                const s = (clamp(y, from.height) * src.width + clamp(x, from.width)) * 4,
                  d = (clamp(y + sy, to.height) * dst.width + clamp(x + sx, to.width)) * 4;
                if (src.data.readUInt32LE(s) !== dst.data.readUInt32LE(d))
                  throw Error(`${kind} ${level}: texel ${x},${y} differs`);
              }
          }
        }
      }
      expect(compared).toBeGreaterThan(0);
    }, 60000);
});
