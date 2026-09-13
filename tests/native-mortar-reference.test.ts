import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import sharp from 'sharp';
import { expect, it } from 'vitest';
import native from '../reference/mortar/native.json';
import packed from '../reference/mortar/runtime.json';
import combat from '../reference/mortar/combat.json';
import projectiles from '../reference/mortar/projectiles.json';
import effects from '../reference/mortar/effects.json';
import bodyWitness from './fixtures/native-mortar-mesh/body.json';
import effectWitness from './fixtures/native-mortar-mesh/effects.json';
import { nativeScenePoses, type NativeMeshGraph } from '../src/game/native-mesh';
import { DEFENSE_PROGRESSION } from '../src/game/defense-progression';
import { nativeCampaignIssues } from '../src/game/native-campaign';

const hash = (data: Buffer) => createHash('sha256').update(data).digest('hex');

it('preserves eighteen original Mortar levels while preserving home limits and unsupported campaign gates', () => {
  expect(Object.keys(native.sources)).toHaveLength(16);
  expect(native.clientVersion).toBe('18.400.21');
  const rows = native.buildings.Mortar;
  expect(rows).toHaveLength(18);
  expect(rows[0]).toMatchObject({
    GlobalID: '1000013',
    Width: '3',
    Height: '3',
    AttackRange: '1100',
    MinAttackRange: '400',
    AttackSpeed: '5000',
    DamageRadius: '150',
    GroundTargets: 'TRUE',
    AirTargets: 'FALSE',
    AnimateTurret: 'TRUE',
    AltAttackSpeed: '3500',
    GearUpBuilding: 'BB Multi Mortar',
    GearUpLevelRequirement: '7',
  });
  expect(combat.levels.map((r) => r.hp)).toEqual([
    400, 450, 500, 550, 600, 650, 700, 800, 950, 1100, 1300, 1500, 1700, 1950, 2150, 2300, 2450,
    2550,
  ]);
  expect(combat.levels.map((r) => r.dps)).toEqual([
    4, 5, 6, 7, 9, 11, 15, 20, 25, 30, 35, 38, 42, 48, 54, 60, 66, 72,
  ]);
  expect(combat.levels.map((r) => r.townhall)).toEqual([
    3, 4, 5, 6, 7, 8, 9, 10, 11, 11, 12, 12, 13, 14, 15, 16, 17, 18,
  ]);
  expect(combat.levels.map((r) => r.cost)).toEqual([
    5000, 25000, 90000, 180000, 300000, 500000, 900000, 1200000, 1600000, 1800000, 2300000, 2400000,
    2800000, 4300000, 5000000, 7000000, 13000000, 21000000,
  ]);
  expect(combat.levels.map((r) => r.seconds)).toEqual([
    1800, 3600, 7200, 10800, 21600, 28800, 43200, 64800, 72000, 86400, 108000, 129600, 172800,
    216000, 259200, 345600, 432000, 1080000,
  ]);
  expect(combat).toMatchObject({
    intervalMs: 5000,
    attackRange: 1100,
    minAttackRange: 400,
    damageRadius: 150,
    size: 3,
    airTargets: false,
    groundTargets: true,
  });
  for (const [i, row] of combat.levels.entries()) {
    expect(row.level).toBe(i + 1);
    expect(row.body).toBe(rows[i].ExportName);
    expect(row.projectile).toBe(rows[i].Projectile);
    expect(row.hitEffect).toBe(rows[i].HitEffect);
    expect(row).toMatchObject(DEFENSE_PROGRESSION.mortar[i]);
  }
  expect(native.reconstruction.liveIntegration).toBe(true);
  expect(native.reconstruction.nativePlaybackVerified).toBe(false);
  expect(nativeCampaignIssues(55)).toEqual(['Cannon level 15']);
});

it('retains every turret degree, late terminal frame, optional gear and source state', () => {
  const graph = packed as unknown as NativeMeshGraph;
  expect(Object.keys(graph.exports)).toHaveLength(78);
  expect(Object.keys(graph.clips)).toHaveLength(110);
  expect(Object.keys(graph.shapes)).toHaveLength(346);
  expect(new Set(Object.values(graph.clips).flatMap((c) => c.blending))).toEqual(new Set([0, 8]));
  for (let level = 1; level <= 18; level++) {
    const name = `mortar_lvl${level}`;
    const root = graph.clips[graph.exports[name]];
    expect(root.timeline).toHaveLength(1);
    expect(root.fps).toBe(24);
    const turret = graph.clips[root.children[root.names.indexOf('turret')]];
    expect(turret.timeline).toHaveLength(level < 15 ? 360 : 361);
    expect(turret.children).toHaveLength(8);
    expect(turret.frames).toHaveLength(8);
    for (let frame = 0; frame < turret.timeline.length; frame++)
      expect(turret.timeline[frame]).toBe(Math.min(7, Math.floor(frame / 45)));
    expect(root.names.includes('gearup')).toBe(level >= 5);
    const normal = nativeScenePoses(graph, name, 0, { turret: 137, gearup: false });
    const hidden = nativeScenePoses(graph, name, 0, { turret: false, gearup: false });
    expect(normal.length).toBeGreaterThan(hidden.length);
    if (level >= 5)
      expect(nativeScenePoses(graph, name, 0, { turret: 137, gearup: 0 }).length).toBeGreaterThan(
        normal.length,
      );
    if (level >= 15)
      expect(nativeScenePoses(graph, name, 0, { turret: 360, gearup: false })).toEqual(
        nativeScenePoses(graph, name, 0, { turret: 359, gearup: false }),
      );
  }
  expect(graph.clips[graph.exports.destroyedBuilding_3s_pit_rock].timeline).toHaveLength(6);
  for (const row of native.buildings.Mortar)
    for (const [key, name] of Object.entries(row))
      if (key.startsWith('ExportName')) expect(graph.exports).toHaveProperty(name);
  const cases = [...bodyWitness.cases, ...effectWitness.cases];
  expect(bodyWitness.cases).toHaveLength(173);
  expect(effectWitness.cases).toHaveLength(140);
  expect(new Set(cases.map((c) => c.export))).toEqual(new Set(Object.keys(graph.exports)));
  expect(effectWitness.cases.filter((c) => c.empty)).toHaveLength(2);
});

it('preserves thirteen ballistic shell families, repeated emitters and per-variant blending', () => {
  expect(projectiles).toEqual(native.projectiles);
  expect(Object.keys(native.projectiles)).toHaveLength(13);
  for (const rows of Object.values(native.projectiles)) {
    expect(rows[0]).toMatchObject({
      Speed: '500',
      StartHeight: '95',
      StartOffset: '20',
      IsBallistic: 'TRUE',
      DontTrackTarget: 'TRUE',
      ShadowExportName: 'simple_shadow_small',
      UseRotate: 'FALSE',
    });
    expect(packed.exports).toHaveProperty(rows[0].ExportName);
    expect(native.particles).toHaveProperty(rows[0].ParticleEmitter);
  }
  expect(effects).toEqual({
    effects: native.effects,
    particles: native.particles,
    sounds: native.sounds,
  });
  expect(Object.keys(native.effects)).toEqual([
    'Building Destroyed',
    'Mortar Attack',
    'Mortar Hit',
    'Mortar Hit lvl6',
    'Mortar Hit lvl8',
    'Mortar Pickup',
    'Mortar Placing',
  ]);
  expect(Object.keys(native.particles)).toHaveLength(24);
  expect(Object.values(native.particles).flat()).toHaveLength(64);
  expect(native.effects['Mortar Hit'].filter((r) => r.ParticleEmitter === 'Grass')).toHaveLength(3);
  expect(native.effects['Mortar Attack'][0]).toMatchObject({
    Sound: 'sfx/mortar_fire_02_with_fall.ogg',
    Volume: '70',
    MinPitch: '95',
    MaxPitch: '105',
  });
  expect(native.particles.yellow_fireball_trail_emitter.map((r) => r.AdditiveBlend)).toEqual([
    'TRUE',
    'FALSE',
    'TRUE',
    'FALSE',
    'TRUE',
  ]);
  const witnesses = effectWitness.cases.filter((c) => c.category === 'emitter-variant');
  expect(witnesses).toHaveLength(64);
  for (const [name, rows] of Object.entries(native.particles))
    for (const [variant, row] of rows.entries()) {
      expect(packed.exports).toHaveProperty(row.ParticleExportName);
      expect(witnesses.find((c) => c.emitter === name && c.variant === variant)).toMatchObject({
        export: row.ParticleExportName,
        particleBlend: row.AdditiveBlend === 'TRUE' ? 8 : 0,
      });
    }
});

it('preserves original polygons, transforms, timelines and exact texture sampling regions', async () => {
  const original = native.world;
  const graph = packed as unknown as NativeMeshGraph;
  for (const field of ['clips', 'matrices', 'colors', 'exports'] as const)
    expect(packed[field]).toEqual(original.graph[field]);
  const textures = original.textures as Record<string, (typeof native.world.textures)['8']>;
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

it('ships five exact texture crops, eighteen registered source portraits and five original Ogg files', async () => {
  const expected = [...Object.values(native.world.textures), ...Object.values(native.previews)].map(
    (v) => v.path.replace('assets/buildings/mortar-native/', ''),
  );
  expect(Object.keys(native.world.textures)).toEqual(['8', '25', '36', '39', '66']);
  expect(expected).toHaveLength(23);
  const hashes = new Set<string>();
  for (const [key, preview] of Object.entries(native.previews)) {
    expect(preview.export).toBe(`mortar_lvl${key}`);
    expect(preview.baseExport).toBe('mortar_base');
    expect(preview.controls).toEqual({ turret: 0, gearup: false });
    expect(preview.bounds).toEqual([-84, -22, 89, 146]);
    const { data, info } = await sharp(`public/${preview.path}`)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect([info.width, info.height, hash(data)]).toEqual([346, 336, preview.rgbaSha256]);
    hashes.add(hash(data));
    let border = 0,
      opaque = 0;
    for (let y = 0; y < info.height; y++)
      for (let x = 0; x < info.width; x++) {
        const alpha = data[(y * info.width + x) * 4 + 3];
        if (x < 16 || x >= info.width - 16 || y < 16 || y >= info.height - 16)
          border = Math.max(border, alpha);
        if (alpha === 255) opaque++;
      }
    expect(border, key).toBe(0);
    expect(opaque, key).toBeGreaterThan(0);
  }
  expect(hashes.size).toBe(18);
  expect(Object.keys(native.sounds)).toHaveLength(5);
  for (const sound of Object.values(native.sounds)) {
    expected.push(sound.path.split('/').at(-1)!);
    const bytes = await readFile(`public/${sound.path}`);
    expect(bytes.subarray(0, 4).toString()).toBe('OggS');
    expect(hash(bytes)).toBe(sound.sha256);
  }
  const files = await readdir('public/assets/buildings/mortar-native', {
    recursive: true,
    withFileTypes: true,
  });
  expect(
    files
      .filter((f) => f.isFile())
      .map((f) => `${f.parentPath}/${f.name}`.replace('public/assets/buildings/mortar-native/', ''))
      .sort(),
  ).toEqual(expected.sort());
});
