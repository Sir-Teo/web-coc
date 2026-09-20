import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import sharp from 'sharp';
import { expect, it } from 'vitest';
import native from '../reference/xbow/native.json';
import runtime from '../reference/xbow/runtime.json';
import combat from '../reference/xbow/combat.json';

type Clip = {
  fps: number;
  children: number[];
  names: string[];
  blending: number[];
  frames: number[][][];
  timeline: number[];
  labels: (string | number)[][];
};
const clips = native.graph.clips as Record<string, Clip>;
const shapes = native.graph.shapes as unknown as Record<string, [number, number[]][]>;
const compact = runtime.shapes as unknown as Record<string, [number, number[]][]>;
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

it('retains the home X-Bow identity, cadence, ammunition and both targeting modes', () => {
  expect(native.building).toHaveLength(13);
  expect(native.building[0]).toMatchObject({
    GlobalID: '1000021',
    AttackSpeed: '128',
    AttackRange: '1400',
    AltAttackRange: '1150',
    GroundTargets: 'TRUE',
    AirTargets: 'FALSE',
    AltGroundTargets: 'TRUE',
    AltAirTargets: 'TRUE',
    AmmoCount: '1500',
    AmmoResource: 'Elixir',
    AnimateTurret: 'TRUE',
  });
  expect(native.building.map((r) => Number(r.DPS))).toEqual([
    60, 70, 80, 85, 95, 110, 130, 155, 185, 205, 225, 235, 245,
  ]);
  expect(native.building.map((r) => Number(r.Hitpoints))).toEqual([
    1500, 1900, 2300, 2700, 3100, 3400, 3700, 4000, 4200, 4400, 4600, 4800, 5000,
  ]);
  expect(combat).toMatchObject({
    intervalMs: 128,
    ammunition: 1500,
    groundRange: 1400,
    groundAirRange: 1150,
  });
  const inherited: Record<string, string> = {};
  for (const [i, row] of native.building.entries()) {
    Object.assign(inherited, row);
    expect(combat.levels[i]).toEqual({
      level: Number(inherited.BuildingLevel),
      townhall: Number(inherited.TownHallLevel),
      hp: Number(inherited.Hitpoints),
      dps: Number(inherited.DPS),
      cost: Number(inherited.BuildCost),
      seconds:
        Number(inherited.BuildTimeD) * 86400 +
        Number(inherited.BuildTimeH) * 3600 +
        Number(inherited.BuildTimeM) * 60 +
        Number(inherited.BuildTimeS),
      projectile: Object.keys(native.projectiles).indexOf(inherited.Projectile) + 1,
    });
  }
  expect(Object.values(native.projectiles).map((r) => Number(r[0].Speed))).toEqual([
    2300, 2400, 2500, 2500, 2500, 2500, 2500,
  ]);
  expect(native.reconstruction).toMatchObject({
    nativePlaybackVerified: false,
    directionMappingVerified: false,
    weaponEngineVerified: false,
  });
});

it('preserves all 52 building variants and distinct engine-controlled directional instances', () => {
  expect(Object.keys(native.graph.exports)).toHaveLength(63);
  expect(Object.keys(clips)).toHaveLength(99);
  expect(Object.keys(shapes)).toHaveLength(1038);
  expect(Object.keys(native.directions)).toHaveLength(28);
  expect(runtime.levels).toHaveLength(13);
  for (let level = 1; level <= 13; level++)
    for (const suffix of ['', '_air', '_upgrade', '_upgrade_air']) {
      const name = `rapidfire_turret_lvl${level}${suffix}`;
      const root = clips[(native.graph.exports as Record<string, number>)[name]];
      expect(root.fps).toBe(30);
      expect(root.timeline).toHaveLength(1);
      expect(root.names.filter((n) => n === 'turret')).toHaveLength(1);
      expect(root.names.includes('ammo')).toBe(!suffix.includes('upgrade'));
      for (const [slot, role] of root.names.entries()) {
        if (role !== 'turret' && role !== 'ammo') continue;
        const directional = clips[root.children[slot]];
        expect(directional.timeline).toHaveLength(360);
        expect(directional.frames).toHaveLength(36);
        for (let frame = 0; frame < 360; frame += 10)
          expect(new Set(directional.timeline.slice(frame, frame + 10)).size).toBe(1);
      }
    }
  // The same native turret is reused while its base changes with level.
  const one = clips[native.graph.exports.rapidfire_turret_lvl1];
  const three = clips[native.graph.exports.rapidfire_turret_lvl3];
  expect(one.children[one.names.indexOf('turret')]).toBe(
    three.children[three.names.indexOf('turret')],
  );
  expect(one.children[0]).not.toBe(three.children[0]);
  expect(clips['26527'].children).toEqual([]);
  expect(clips['26527'].timeline).toHaveLength(100);
});

it('keeps every polygon, transform, color, layer, label and timeline while remapping UVs', () => {
  expect(runtime.clips).toEqual(native.graph.clips);
  expect(runtime.matrices).toEqual(native.graph.matrices);
  expect(runtime.colors).toEqual(native.graph.colors);
  expect(runtime.exports).toEqual(native.graph.exports);
  const textures = native.textures as Record<string, (typeof native.textures)['39']>;
  let advancedStrips = 0;
  for (const [id, commands] of Object.entries(shapes)) {
    expect(compact[id]).toHaveLength(commands.length);
    for (const [index, [texture, vertices]] of commands.entries()) {
      const [page, remapped] = compact[id][index];
      expect(page).toBe(texture);
      expect(remapped).toHaveLength(vertices.length);
      if (vertices.length > 16) advancedStrips++;
      const t = textures[texture];
      const us = vertices.filter((_, i) => i % 4 === 2).map((u) => (u / 65535) * t.sourceSize[0]);
      const vs = vertices.filter((_, i) => i % 4 === 3).map((v) => (v / 65535) * t.sourceSize[1]);
      const bounds = [
        Math.max(0, Math.floor(Math.min(...us) - 0.5)),
        Math.max(0, Math.floor(Math.min(...vs) - 0.5)),
        Math.min(t.sourceSize[0], Math.floor(Math.max(...us) - 0.5) + 2),
        Math.min(t.sourceSize[1], Math.floor(Math.max(...vs) - 0.5) + 2),
      ];
      const region = t.regions.find((r) => r.bounds.every((v, i) => v === bounds[i]))!;
      expect(region).toBeDefined();
      for (let v = 0; v < vertices.length; v += 4) {
        expect(remapped.slice(v, v + 2)).toEqual(vertices.slice(v, v + 2));
        expect(remapped[v + 2]).toBeCloseTo(
          (us[v / 4] - bounds[0] + region.placement[0]) / t.width,
          12,
        );
        expect(remapped[v + 3]).toBeCloseTo(
          (vs[v / 4] - bounds[1] + region.placement[1]) / t.height,
          12,
        );
      }
    }
  }
  expect(advancedStrips).toBeGreaterThan(100);
  const arrow = clips[native.graph.exports.rapidfire_arrow_ammo_lvl3];
  expect(arrow.children[0]).toBe(arrow.children[1]);
  expect(arrow.blending).toEqual([0, 8]);
  expect(native.graph.colors.some((c) => c.slice(4, 7).some((n) => n > 0))).toBe(true);
});

it('ships exact source sampling regions and native sound bytes in a bounded asset set', async () => {
  const expected: string[] = [];
  // Duplicate texture pages consolidate into shared files: the directory holds
  // the unique locally-referenced entries.
  const local = (p: string) => p.startsWith('assets/buildings/xbow-native/');
  for (const texture of Object.values(native.textures)) {
    if (local(texture.path)) expected.push(texture.path.split('/').at(-1)!);
    const { data, info } = await sharp(`public/${texture.path}`)
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect([info.width, info.height, info.channels]).toEqual([texture.width, texture.height, 4]);
    expect(Math.max(info.width, info.height)).toBeLessThanOrEqual(4096);
    expect(hash(data)).toBe(texture.rgbaSha256);
    for (const region of texture.regions) {
      const [left, top, right, bottom] = region.bounds;
      const [x, y] = region.placement;
      const digest = createHash('sha256');
      for (let row = 0; row < bottom - top; row++) {
        const start = ((y + row) * info.width + x) * 4;
        digest.update(data.subarray(start, start + (right - left) * 4));
      }
      expect(digest.digest('hex')).toBe(region.rgbaSha256);
    }
  }
  const projectiles = native.textures['39'];
  expect(projectiles.packing).toBe('packed source regions');
  expect(projectiles.width * projectiles.height).toBeLessThan(20000);
  expect(Object.keys(native.sounds)).toHaveLength(7);
  for (const sound of Object.values(native.sounds)) {
    expected.push(sound.path.split('/').at(-1)!);
    const data = await readFile(`public/${sound.path}`);
    expect(data.subarray(0, 4).toString()).toBe('OggS');
    expect(hash(data)).toBe(sound.sha256);
  }
  expect(Object.keys(native.previews)).toHaveLength(26);
  for (const preview of Object.values(native.previews)) {
    if (local(preview.path)) expected.push(preview.path.split('/').at(-1)!);
    const { data, info } = await sharp(`public/${preview.path}`)
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect([info.width, info.height, info.channels]).toEqual([400, 340, 4]);
    expect(preview.bounds).toEqual([-100, -30, 100, 140]);
    expect(preview.direction).toBe(225);
    expect(hash(data)).toBe(preview.rgbaSha256);
  }
  expect((await readdir('public/assets/buildings/xbow-native')).sort()).toEqual(
    [...new Set(expected)].sort(),
  );
});
