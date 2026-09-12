import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import sharp from 'sharp';
import { expect, it } from 'vitest';
import native from '../reference/tesla/native.json';
import runtime from '../reference/tesla/runtime.json';
import combat from '../reference/tesla/combat.json';
import { nativeMeshPoses, type NativeMeshGraph } from '../src/game/native-mesh';

const graph = runtime as unknown as NativeMeshGraph;
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

it('preserves all 17 Tesla records and the source reveal/weapon boundaries', () => {
  expect(native.building).toHaveLength(17);
  expect(native.building[0]).toMatchObject({ GlobalID: '1000019', Hidden: 'TRUE', BaseGfx: '-1' });
  expect(combat).toMatchObject({
    intervalMs: 600,
    triggerRange: 600,
    attackRange: 700,
    airTargets: true,
    groundTargets: true,
    size: 2,
  });
  expect(combat.levels.map((r) => r.hp)).toEqual([
    600, 630, 660, 690, 730, 770, 810, 850, 900, 980, 1100, 1200, 1350, 1450, 1550, 1650, 1750,
  ]);
  const inherited: Record<string, string> = {};
  for (const [i, row] of native.building.entries()) {
    Object.assign(inherited, row);
    expect(combat.levels[i]).toEqual({
      level: i + 1,
      townhall: Number(inherited.TownHallLevel),
      hp: Number(inherited.Hitpoints),
      dps: Number(inherited.DPS),
      cost: Number(inherited.BuildCost),
      seconds:
        Number(inherited.BuildTimeD) * 86400 +
        Number(inherited.BuildTimeH) * 3600 +
        Number(inherited.BuildTimeM) * 60 +
        Number(inherited.BuildTimeS),
      attackEffect: inherited.AttackEffect,
      secondaryEffect: inherited.AttackEffect2 ?? null,
    });
    expect(inherited.Projectile).toBeUndefined();
  }
  expect(native.globals.HIDDEN_BUILDING_APPEAR_DESTRUCTION_PERCENTAGE[0].NumberValue).toBe('50');
  expect(native.globals.REMOVE_UNTRIGGERED_TESLA[0].BooleanValue).toBe('FALSE');
});

it('retains trapdoor emergence, later idle groups and distinct particle blend variants', () => {
  expect(Object.keys(graph.exports)).toHaveLength(54);
  expect(Object.keys(graph.shapes)).toHaveLength(124);
  expect(Object.keys(graph.clips)).toHaveLength(65);
  expect(native.reconstruction.additiveGroups).toHaveLength(7);
  for (const level of runtime.levels) {
    const root = graph.clips[graph.exports[level.ExportNameTriggered]];
    expect(root.fps).toBe(24);
    expect(root.timeline).toHaveLength(18);
    expect(nativeMeshPoses(graph, level.ExportNameTriggered, 0)).toEqual([]);
    const slot = root.names.indexOf('idle_electricity');
    expect(
      root.timeline.flatMap((f, i) => (root.frames[f].some((p) => p[0] === slot) ? [i] : [])),
    ).toEqual([17]);
    expect(
      nativeMeshPoses(graph, level.ExportNameTriggered, 4 / 24, { idle_electricity: false }),
    ).not.toEqual(
      nativeMeshPoses(graph, level.ExportNameTriggered, 17 / 24, { idle_electricity: false }),
    );
  }
  expect(native.particles.Lightning_3.map((r) => r.AdditiveBlend)).toEqual([
    'TRUE',
    'FALSE',
    'TRUE',
  ]);
  expect(native.particles.Lightning_4[0].ParticleCount).toBe('5');
  expect(native.particles.Lightning_4).toHaveLength(4);
  expect(native.effects['Tesla Attack_4'].map((r) => r.Sound)).toEqual([
    'sfx/tesla_zap_01.ogg',
    'sfx/tesla_zap_03.ogg',
  ]);
  expect(native.reconstruction.particleEngineVerified).toBe(false);
});

it('preserves all source geometry while translating UVs into exact packed sampling regions', () => {
  expect(runtime.clips).toEqual(native.graph.clips);
  expect(runtime.matrices).toEqual(native.graph.matrices);
  expect(runtime.colors).toEqual(native.graph.colors);
  expect(runtime.exports).toEqual(native.graph.exports);
  const textures = native.textures as Record<string, (typeof native.textures)['18']>;
  for (const [id, commands] of Object.entries(native.graph.shapes))
    for (const [i, [t, vertices]] of (commands as [number, number[]][]).entries()) {
      const [texture, packed] = graph.shapes[id][i];
      expect(texture).toBe(t);
      expect(packed.length).toBe(vertices.length);
      const info = textures[t];
      const du = packed[2] * info.width - (vertices[2] / 65535) * info.sourceSize[0];
      const dv = packed[3] * info.height - (vertices[3] / 65535) * info.sourceSize[1];
      expect(
        info.regions.some(
          (r) =>
            Math.abs(r.placement[0] - r.bounds[0] - du) < 1e-9 &&
            Math.abs(r.placement[1] - r.bounds[1] - dv) < 1e-9,
        ),
      ).toBe(true);
      for (let j = 0; j < vertices.length; j += 4) {
        expect(packed.slice(j, j + 2)).toEqual(vertices.slice(j, j + 2));
        expect(packed[j + 2] * info.width - du).toBeCloseTo(
          (vertices[j + 2] / 65535) * info.sourceSize[0],
          10,
        );
        expect(packed[j + 3] * info.height - dv).toBeCloseTo(
          (vertices[j + 3] / 65535) * info.sourceSize[1],
          10,
        );
      }
    }
});

it('ships exact sampling pixels, 17 distinct portraits and five original Ogg files', async () => {
  const expected: string[] = [];
  for (const value of [...Object.values(native.textures), ...Object.values(native.previews)]) {
    expected.push(value.path.split('/').at(-1)!);
    const { data, info } = await sharp(`public/${value.path}`)
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect([info.width, info.height, info.channels]).toEqual([value.width, value.height, 4]);
    expect(hash(data)).toBe(value.rgbaSha256);
    if ('regions' in value)
      for (const region of value.regions) {
        const [left, top, right, bottom] = region.bounds,
          [x, y] = region.placement;
        const digest = createHash('sha256');
        for (let row = 0; row < bottom - top; row++) {
          const at = ((y + row) * info.width + x) * 4;
          digest.update(data.subarray(at, at + (right - left) * 4));
        }
        expect(digest.digest('hex')).toBe(region.rgbaSha256);
      }
  }
  expect(new Set(Object.values(native.previews).map((p) => p.rgbaSha256)).size).toBe(17);
  expect(Object.keys(native.sounds)).toHaveLength(5);
  for (const sound of Object.values(native.sounds)) {
    expected.push(sound.path.split('/').at(-1)!);
    const bytes = await readFile(`public/${sound.path}`);
    expect(bytes.subarray(0, 4).toString()).toBe('OggS');
    expect(hash(bytes)).toBe(sound.sha256);
  }
  expect((await readdir('public/assets/buildings/tesla-native')).sort()).toEqual(expected.sort());
  expect(expected).toHaveLength(26);
});
