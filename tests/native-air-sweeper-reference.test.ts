import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import sharp from 'sharp';
import { expect, it } from 'vitest';
import native from '../reference/air-sweeper/native.json';
import packed from '../reference/air-sweeper/runtime.json';
import combat from '../reference/air-sweeper/combat.json';
import effects from '../reference/air-sweeper/effects.json';
import witness from './fixtures/native-air-sweeper-mesh/manifest.json';
import { nativeScenePoses, type NativeMeshGraph } from '../src/game/native-mesh';

const hash = (data: Buffer) => createHash('sha256').update(data).digest('hex');

it('preserves all seven original levels and the distinct cone, timing and projectile fields', () => {
  expect(Object.keys(native.sources)).toHaveLength(16);
  expect(native.clientVersion).toBe('18.400.21');
  const rows = native.buildings['Air Sweeper'];
  expect(rows).toHaveLength(7);
  expect(rows[0]).toMatchObject({
    GlobalID: '1000028',
    Width: '2',
    Height: '2',
    AirTargets: 'TRUE',
    AttackRange: '1500',
    MinAttackRange: '100',
    PrepareSpeed: '600',
    AttackSpeed: '5000',
    CoolDownOverride: '4800',
    ShockwaveArcLength: '700',
    ShockwaveExpandRadius: '250',
    TargetingConeAngle: '105',
    AimRotateStep: '45',
    AnimateTurret: 'TRUE',
  });
  expect(rows.map((r) => Number(r.Hitpoints))).toEqual([750, 800, 850, 900, 950, 1000, 1050]);
  expect(rows.map((r) => Number(r.BuildCost))).toEqual([
    200000, 300000, 450000, 800000, 1200000, 1900000, 3400000,
  ]);
  expect(rows.map((r) => (Number(r.BuildTimeD) * 24 + Number(r.BuildTimeH)) * 3600)).toEqual([
    14400, 21600, 28800, 43200, 86400, 172800, 259200,
  ]);
  expect(rows.map((r) => Number(r.TownHallLevel))).toEqual([6, 6, 7, 8, 9, 10, 11]);
  expect(rows.map((r) => Number(r.ShockwavePushStrength))).toEqual([
    160, 200, 240, 280, 320, 360, 400,
  ]);
  expect(combat).toEqual({
    building: rows[0],
    levels: rows,
    projectile: native.projectiles['Air Blaster Ammo1'][0],
  });
  expect(combat.projectile).toMatchObject({
    ExportName: 'dummy_particle',
    Speed: '600',
    StartHeight: '125',
    StartOffset: '125',
    UseRotate: 'TRUE',
    UseTopLayer: 'TRUE',
  });
  expect(native.reconstruction.liveIntegration).toBe(true);
  expect(native.reconstruction.nativePlaybackVerified).toBe(false);
});

it('keeps all original 360-frame rotating parts and the complete labeled loading timeline', () => {
  const graph = packed as unknown as NativeMeshGraph;
  expect(Object.keys(graph.exports)).toHaveLength(45);
  expect(Object.keys(graph.clips)).toHaveLength(54);
  expect(Object.keys(graph.shapes)).toHaveLength(166);
  for (let level = 1; level <= 7; level++) {
    const root = graph.clips[graph.exports[`air_mortar_lvl${level}`]];
    expect(root.names).toEqual(['turret_load', '', 'turret_sector', 'turret']);
    expect(root.timeline).toHaveLength(1);
    expect(root.fps).toBe(30);
    for (const name of ['turret', 'turret_sector'])
      expect(graph.clips[root.children[root.names.indexOf(name)]].timeline).toHaveLength(360);
    const loading = packed.clips['981'];
    expect(loading.timeline).toHaveLength(325);
    expect(loading.fps).toBe(30);
    expect(loading.labels).toEqual([
      [0, 'idle_start'],
      [223, 'idle_end'],
      [224, 'load_start'],
      [314, 'load_end'],
      [315, 'attack_start'],
      [324, 'attack_end'],
    ]);
    const upgrade = graph.clips[graph.exports[`air_mortar_lvl${level}_upgrade`]];
    expect(
      graph.clips[upgrade.children[upgrade.names.indexOf('turret_load')]].timeline,
    ).toHaveLength(1);
  }
  expect(new Set(Object.values(graph.clips).flatMap((c) => c.blending))).toEqual(new Set([0]));
  expect(new Set(witness.cases.map((c) => c.export))).toEqual(new Set(Object.keys(graph.exports)));
  expect(witness.cases).toHaveLength(128);
  for (const row of native.buildings['Air Sweeper'])
    for (const [key, name] of Object.entries(row))
      if (key.startsWith('ExportName')) expect(graph.exports).toHaveProperty(name);
  // The source projectile is a real tiny polygon with coincident UVs, not an
  // empty export and not evidence for a textured traveling shockwave.
  const dummy = nativeScenePoses(graph, 'dummy_particle', 0);
  expect(dummy).toHaveLength(1);
  expect('group' in dummy[0]).toBe(false);
});

it('retains repeated particle variants, source sound settings and only real referenced effects', () => {
  expect(effects).toEqual({
    effects: native.effects,
    particles: native.particles,
    sounds: native.sounds,
  });
  expect(Object.keys(native.effects)).toEqual([
    'Building Destroyed',
    'Wind Machine Attack',
    'Wind Machine Pickup',
    'Wind Machine Place',
  ]);
  expect(Object.keys(native.particles)).toEqual([
    'Building Destroyed',
    'Grass',
    'Smoke',
    'wind_attack_particle',
  ]);
  expect(native.particles['Building Destroyed']).toHaveLength(19);
  expect(native.particles.Grass).toHaveLength(4);
  expect(native.effects['Wind Machine Attack'][0]).toMatchObject({
    ParticleEmitter: 'wind_attack_particle',
    AttachToParent: 'TRUE',
    Sound: 'sfx/air_cannon_fire_04.ogg',
    Volume: '90',
    MinPitch: '95',
    MaxPitch: '105',
  });
  expect(native.particles.wind_attack_particle[0]).toMatchObject({
    ParticleExportName: 'soft_smoke1',
    ParticleCount: '10',
    MinLife: '800',
    MaxLife: '1500',
    Gravity: '-100',
    AdditiveBlend: 'FALSE',
  });
  for (const rows of Object.values(native.particles))
    for (const row of rows as Record<string, string>[])
      expect(packed.exports).toHaveProperty(row.ParticleExportName);
});

it('preserves original polygons, transforms, timelines and exact texture sampling regions', async () => {
  const original = native.world;
  const graph = packed as unknown as NativeMeshGraph;
  for (const field of ['clips', 'matrices', 'colors', 'exports'] as const)
    expect(packed[field]).toEqual(original.graph[field]);
  const textures = original.textures as Record<string, (typeof native.world.textures)['1']>;
  for (const [id, commands] of Object.entries(original.graph.shapes))
    for (const [i, [t, vertices]] of (commands as [number, number[]][]).entries()) {
      const [texture, v] = graph.shapes[id][i];
      expect(texture).toBe(t);
      expect(v.length).toBe(vertices.length);
      const info = textures[t];
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

it('ships six lossless texture crops, 56 aligned transparent previews and four unchanged Ogg files', async () => {
  const references = [...Object.values(native.world.textures), ...Object.values(native.previews)];
  const expected = references.map(
    (v) => v.path.replace('assets/buildings/air-sweeper-native/', ''),
  );
  expect(expected).toHaveLength(62);
  // Duplicate texture pages consolidate into shared files: the directory holds
  // the unique locally-referenced entries.
  const local = [...new Set(
    references
      .map((v) => v.path)
      .filter((p) => p.startsWith('assets/buildings/air-sweeper-native/'))
      .map((p) => p.replace('assets/buildings/air-sweeper-native/', '')),
  )];
  const hashes = new Set<string>();
  for (const [key, preview] of Object.entries(native.previews)) {
    const [level, direction] = key.split('-').map(Number);
    expect(preview.export).toBe(`air_mortar_lvl${level}`);
    expect(preview.baseExport).toBe('windmachine_base');
    expect(preview.controls).toEqual({
      turret: direction * 45,
      turret_sector: direction * 45,
      turret_load: 0,
    });
    const { data, info } = await sharp(`public/${preview.path}`)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect([info.width, info.height, hash(data)]).toEqual([284, 330, preview.rgbaSha256]);
    expect(preview.bounds).toEqual([-71, -52, 71, 113]);
    hashes.add(hash(data));
    let borderAlpha = 0;
    for (let y = 0; y < info.height; y++)
      for (let x = 0; x < info.width; x++)
        if (x < 16 || x >= info.width - 16 || y < 16 || y >= info.height - 16)
          borderAlpha = Math.max(borderAlpha, data[(y * info.width + x) * 4 + 3]);
    expect(borderAlpha, key).toBe(0);
  }
  expect(hashes.size).toBe(56);
  expect(Object.keys(native.sounds)).toHaveLength(4);
  for (const sound of Object.values(native.sounds)) {
    local.push(sound.path.split('/').at(-1)!);
    const bytes = await readFile(`public/${sound.path}`);
    expect(bytes.subarray(0, 4).toString()).toBe('OggS');
    expect(hash(bytes)).toBe(sound.sha256);
  }
  const files = await readdir('public/assets/buildings/air-sweeper-native', {
    recursive: true,
    withFileTypes: true,
  });
  expect(
    files
      .filter((f) => f.isFile())
      .map((f) =>
        `${f.parentPath}/${f.name}`.replace('public/assets/buildings/air-sweeper-native/', ''),
      )
      .sort(),
  ).toEqual(local.sort());
});
