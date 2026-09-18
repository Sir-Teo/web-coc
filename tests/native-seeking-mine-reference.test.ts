import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import sharp from 'sharp';
import { expect, it } from 'vitest';
import native from '../reference/seeking-mine/native.json';
import world from '../reference/seeking-mine/runtime.json';
import info from '../reference/seeking-mine/info.json';
import combat from '../reference/seeking-mine/combat.json';
import effects from '../reference/seeking-mine/effects.json';
import { nativeScenePoses, type NativeMeshGraph } from '../src/game/native-mesh';

const hash = (data: Buffer) => createHash('sha256').update(data).digest('hex');
const graph = world as unknown as NativeMeshGraph;

it('retains all eight source levels, four projectile families and actual 24 fps trigger timing', () => {
  expect(native.trap).toHaveLength(8);
  expect(native.trap[0]).toMatchObject({ GlobalID: '12000006', ActionFrame: '7' });
  expect(combat).toMatchObject({
    triggerRadius: 400,
    damageRadius: 0,
    minHousing: 5,
    actionFrame: 7,
    triggerFps: 24,
    airTrigger: true,
    groundTrigger: false,
    size: 1,
  });
  expect(combat.levels.map((v) => v.damage)).toEqual([
    1500, 1800, 2100, 2500, 2800, 3000, 3200, 3350,
  ]);
  expect(combat.levels.map((v) => v.cost)).toEqual([
    12000, 600000, 1200000, 2500000, 5000000, 6500000, 12000000, 19000000,
  ]);
  expect(combat.levels.map((v) => v.seconds)).toEqual([
    0, 21600, 43200, 129600, 172800, 259200, 432000, 993600,
  ]);
  expect(combat.levels.map((v) => v.townhall)).toEqual([1, 9, 10, 13, 15, 16, 17, 18]);
  expect(new Set(combat.levels.map((v) => v.setup)).size).toBe(4);
  expect(Object.keys(native.projectiles)).toHaveLength(4);
  for (const rows of Object.values(native.projectiles))
    expect(rows[0]).toMatchObject({
      Speed: '350',
      StartHeight: '0',
      StartOffset: '20',
      PlayOnce: 'TRUE',
      UseTopLayer: 'TRUE',
      IsBallistic: 'FALSE',
      DontTrackTarget: 'FALSE',
      RetargetRadius: '0',
      UseRotate: 'FALSE',
      ParticleEmitter: 'large_airTrap_redSmoke',
    });
  expect(effects).toEqual({
    effects: native.effects,
    particles: native.particles,
    sounds: native.sounds,
  });
  expect(Object.keys(effects.effects)).toHaveLength(6);
  expect(Object.keys(effects.particles)).toHaveLength(15);
});

it('preserves empty opening frames, the complete reveal and all setup/projectile timelines', () => {
  expect(Object.keys(world.exports)).toHaveLength(31);
  expect(Object.keys(world.clips)).toHaveLength(36);
  expect(Object.keys(world.shapes)).toHaveLength(53);
  for (const name of new Set(combat.levels.map((v) => v.setup))) {
    expect(graph.clips[graph.exports[name]].timeline).toHaveLength(200);
    expect(graph.clips[graph.exports[name]].fps).toBe(24);
    expect(nativeScenePoses(graph, name, 0).length).toBeGreaterThan(0);
  }
  for (const rows of Object.values(native.projectiles)) {
    const name = rows[0].ExportName;
    expect(graph.clips[graph.exports[name]].timeline).toHaveLength(120);
    expect(nativeScenePoses(graph, name, 0)).toEqual([]);
    expect(nativeScenePoses(graph, name, 6 / 24).length).toBeGreaterThan(0);
  }
  expect(graph.clips[graph.exports.air_trap].timeline).toHaveLength(75);
  expect(nativeScenePoses(graph, 'air_trap', 0)).toEqual([]);
  expect(nativeScenePoses(graph, 'air_trap', 7 / 24).length).toBeGreaterThan(0);
});

it('retains the original Info image and its nonpainting named layout bound', async () => {
  expect(info.emptyTextBounds['16136']).toMatchObject({
    text: '',
    bounds: [-2, -2, 218, 158],
    font: 'Arial',
  });
  expect(info.clips['17471'].names).toEqual(['', 'bounds']);
  expect(info.clips['17471'].children).toEqual([15044, 16136]);
  const poses = nativeScenePoses(info as unknown as NativeMeshGraph, 'evil_airtrap_lvl1_info', 0);
  expect(poses.length).toBeGreaterThan(0);
  expect(poses.every((p) => p.key.startsWith('17471/0:'))).toBe(true);
  const { data, info: image } = await sharp(`public/${native.info.path}`)
    .raw()
    .toBuffer({ resolveWithObject: true });
  expect([image.width, image.height, image.channels]).toEqual([360, 420, 4]);
  expect(hash(data)).toBe(native.info.rgbaSha256);
});

for (const [name, packed, original] of [
  ['world', world, native.world],
  ['info', info, native.info],
] as const)
  it(`keeps ${name} geometry and every original bilinear texture sampling region`, async () => {
    const graph = packed as unknown as NativeMeshGraph;
    for (const field of ['clips', 'matrices', 'colors', 'exports'] as const)
      expect(packed[field]).toEqual(original.graph[field]);
    const textures = original.textures as Record<string, (typeof native.world.textures)['8']>;
    for (const [id, commands] of Object.entries(original.graph.shapes))
      for (const [i, [t, vertices]] of (commands as [number, number[]][]).entries()) {
        const [texture, v] = graph.shapes[id][i],
          info = textures[t];
        expect(texture).toBe(t);
        expect(v.length).toBe(vertices.length);
        const dx = v[2] * info.width - (vertices[2] / 65535) * info.sourceSize[0];
        const dy = v[3] * info.height - (vertices[3] / 65535) * info.sourceSize[1];
        expect(
          info.regions.some(
            (r) =>
              Math.abs(r.placement[0] - r.bounds[0] - dx) < 1e-9 &&
              Math.abs(r.placement[1] - r.bounds[1] - dy) < 1e-9,
          ),
        ).toBe(true);
        for (let j = 0; j < v.length; j += 4) {
          expect(v.slice(j, j + 2)).toEqual(vertices.slice(j, j + 2));
          expect(v[j + 2] * info.width - dx).toBeCloseTo(
            (vertices[j + 2] / 65535) * info.sourceSize[0],
            10,
          );
          expect(v[j + 3] * info.height - dy).toBeCloseTo(
            (vertices[j + 3] / 65535) * info.sourceSize[1],
            10,
          );
        }
      }
    for (const texture of Object.values(textures)) {
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
        const [left, top] = region.placement,
          [x, y, right, bottom] = region.bounds;
        const pixels = await sharp(file)
          .extract({ left, top, width: right - x, height: bottom - y })
          .ensureAlpha()
          .raw()
          .toBuffer();
        expect(hash(pixels)).toBe(region.rgbaSha256);
      }
    }
  });

it('ships exactly seven texture crops, four world previews, the original Info image and five sounds', async () => {
  const references = [
    ...Object.values(native.world.textures),
    ...Object.values(native.info.textures),
    ...Object.values(native.previews),
    native.info,
  ];
  // Duplicate texture pages consolidate into shared files: the directory holds
  // the unique locally-referenced entries.
  const local = [...new Set(
    references
      .map((v) => v.path)
      .filter((p) => p.startsWith('assets/buildings/seeking-mine-native/'))
      .map((p) => p.replace('assets/buildings/seeking-mine-native/', '')),
  )];
  for (const preview of Object.values(native.previews)) {
    const pixels = await sharp(`public/${preview.path}`).raw().toBuffer();
    expect(hash(pixels)).toBe(preview.rgbaSha256);
  }
  for (const sound of Object.values(native.sounds)) {
    local.push(sound.path.split('/').at(-1)!);
    const bytes = await readFile(`public/${sound.path}`);
    expect(bytes.subarray(0, 4).toString()).toBe('OggS');
    expect(hash(bytes)).toBe(sound.sha256);
  }
  const files = await readdir('public/assets/buildings/seeking-mine-native', {
    recursive: true,
    withFileTypes: true,
  });
  expect(
    files
      .filter((f) => f.isFile())
      .map((f) =>
        `${f.parentPath}/${f.name}`.replace('public/assets/buildings/seeking-mine-native/', ''),
      )
      .sort(),
  ).toEqual(local.sort());
});
