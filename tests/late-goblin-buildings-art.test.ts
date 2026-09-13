import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import goblinNative from '../reference/late-goblin-buildings/native.json';
import goblinRuntime from '../reference/late-goblin-buildings/runtime.json';
import goblinCharacters from '../reference/late-goblin-buildings/characters-runtime.json';
import hutNative from '../reference/builder-hut/native.json';
import hutRuntime from '../reference/builder-hut/runtime.json';
import { lateGoblinBodyPoses, lateSceneBounds } from '../src/game/late-goblin-buildings-poses';
import { builderHutBodyPoses } from '../src/game/builder-hut-poses';
import { LATE_GOBLIN_BUILDING_ART } from '../src/game/late-goblin-buildings-art';
import { builderHutArt } from '../src/game/builder-hut-art';
import type { NativeScenePose } from '../src/game/native-mesh';

const hash = (data: Buffer) => createHash('sha256').update(data).digest('hex');
type Texture = {
  path: string;
  width: number;
  height: number;
  rgbaSha256: string;
  regions: { bounds: number[]; placement: number[]; rgbaSha256: string }[];
};
const worlds = [
  ['late Goblin buildings', goblinNative.world, goblinRuntime],
  ['Goblin Hall arrow', goblinNative.characters, goblinCharacters],
  ["Builder's Hut", hutNative.world, hutRuntime],
] as const;
const leaves = (poses: NativeScenePose[]): number =>
  poses.reduce((n, pose) => n + ('group' in pose ? leaves(pose.group) : 1), 0);

describe('original late Goblin building art', () => {
  it.each(worlds)('keeps the %s graph and every packed source texel', async (_, world, runtime) => {
    expect(runtime.exports).toEqual(world.graph.exports);
    expect(Object.keys(runtime.shapes)).toEqual(Object.keys(world.graph.shapes));
    for (const commands of Object.values(runtime.shapes))
      for (const [texture, vertices] of commands as [number, number[]][]) {
        expect(Object.hasOwn(runtime.textures, String(texture))).toBe(true);
        for (let i = 2; i < vertices.length; i += 4) {
          expect(vertices[i]).toBeGreaterThanOrEqual(0);
          expect(vertices[i]).toBeLessThanOrEqual(1);
        }
      }
    for (const texture of Object.values(world.textures) as Texture[]) {
      const file = `public/${texture.path}`;
      const { data, info } = await sharp(file)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      expect([info.width, info.height, hash(data)]).toEqual([
        texture.width,
        texture.height,
        texture.rgbaSha256,
      ]);
      for (const region of texture.regions) {
        const [left, top] = region.placement;
        const [x, y, right, bottom] = region.bounds;
        const pixels = await sharp(file)
          .extract({ left, top, width: right - x, height: bottom - y })
          .ensureAlpha()
          .raw()
          .toBuffer();
        expect(hash(pixels)).toBe(region.rgbaSha256);
      }
    }
  });

  it('ships exactly the verified textures, previews and original sounds', async () => {
    for (const [prefix, native, extra] of [
      ['assets/buildings/late-goblin-native/', goblinNative, goblinNative.characters.textures],
      ['assets/buildings/builder-hut-native/', hutNative, {}],
    ] as const) {
      const expected = [
        ...Object.values(native.world.textures),
        ...Object.values(extra),
        ...Object.values(native.previews),
      ].map((v) => (v as { path: string }).path.replace(prefix, ''));
      for (const sound of Object.values(native.sounds)) {
        const bytes = await readFile(`public/${sound.path}`);
        expect(bytes.subarray(0, 4).toString()).toBe('OggS');
        expect(hash(bytes)).toBe(sound.sha256);
        expected.push(sound.path.replace(prefix, ''));
      }
      for (const preview of Object.values(native.previews)) {
        const { data, info } = await sharp(`public/${preview.path}`)
          .ensureAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });
        expect([info.width, info.height, hash(data)]).toEqual([
          preview.width,
          preview.height,
          preview.rgbaSha256,
        ]);
      }
      const files = await readdir(`public/${prefix}`, { recursive: true, withFileTypes: true });
      expect(
        files
          .filter((f) => f.isFile())
          .map((f) => join(f.parentPath, f.name).replace(`public/${prefix}`, ''))
          .sort(),
      ).toEqual(expected.sort());
    }
    expect(LATE_GOBLIN_BUILDING_ART['goblin-boss-th'].asset).toBe(
      '/assets/buildings/late-goblin-native/goblin-th02.png',
    );
    expect(builderHutArt(4).originY).toBeCloseTo((40 + 43) / (83 + 43), 9);
  });

  it('adds original activation geometry to the Goblin Hall and hut turret states', () => {
    const hall = (frame: number) =>
      lateGoblinBodyPoses({ npc: 'goblin-hall', level: 2, state: 'intact', frame, flag: 0 });
    // goblin_th02 raises its eight barrels at frame 14, CombatActivationDelay after active_start.
    expect(leaves(hall(14)) - leaves(hall(13))).toBe(8);
    expect(lateSceneBounds(hall(0))).toEqual(lateSceneBounds(hall(1)));
    const hut = (state: 'dormant' | 'active') =>
      builderHutBodyPoses({
        level: 4,
        state,
        root: 0,
        load: state === 'active' ? 38 : 0,
        turret: 90,
        ruin: 0,
      });
    expect(leaves(hut('active'))).toBeGreaterThan(leaves(hut('dormant')));
    const sleeping = builderHutBodyPoses({
      level: 4,
      state: 'dormant',
      root: 30,
      load: 0,
      turret: 0,
      ruin: 0,
    });
    expect(leaves(sleeping) - leaves(hut('dormant'))).toBe(3);
  });
});
