import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import { expect, it } from 'vitest';
import native from '../reference/cannon/native.json';
import packed from '../reference/cannon/runtime.json';
import combat from '../reference/cannon/combat.json';
import projectiles from '../reference/cannon/projectiles.json';
import effects from '../reference/cannon/effects.json';
import index from './fixtures/native-cannon-mesh/index.json';
import { nativeScenePoses, type NativeMeshGraph } from '../src/game/native-mesh';
import { DEFENSE_PROGRESSION } from '../src/game/defense-progression';
import { nativeCampaignIssues } from '../src/game/native-campaign';

const hash = (data: Buffer) => createHash('sha256').update(data).digest('hex');
const witnesses = index.map(({ category }) =>
  JSON.parse(readFileSync(`tests/fixtures/native-cannon-mesh/${category}.json`, 'utf8')),
);
const cases = witnesses.flatMap((w) => w.cases);

it('preserves all twenty-one Cannon source levels without changing live progression or campaign gates', () => {
  expect(Object.keys(native.sources)).toHaveLength(17);
  expect(native.clientVersion).toBe('18.400.21');
  const rows = native.buildings.Cannon;
  expect(rows).toHaveLength(21);
  expect(rows[0]).toMatchObject({
    GlobalID: '1000008',
    Width: '3',
    Height: '3',
    AttackRange: '900',
    AttackSpeed: '800',
    GroundTargets: 'TRUE',
    AirTargets: 'FALSE',
    AnimateTurret: 'TRUE',
    AltAttackRange: '700',
    AltAttackSpeed: '1600',
    AltBurstCount: '4',
    AltBurstDelay: '192',
    GearUpBuilding: 'BB Double Cannon',
    GearUpLevelRequirement: '3',
  });
  expect(combat.levels.map((r) => r.hp)).toEqual([
    300, 360, 420, 500, 600, 660, 730, 800, 880, 960, 1060, 1160, 1260, 1380, 1500, 1620, 1740,
    1870, 2000, 2150, 2250,
  ]);
  expect(combat.levels.map((r) => r.dps)).toEqual([
    7, 10, 13, 17, 23, 30, 40, 48, 56, 64, 74, 85, 95, 100, 105, 110, 115, 125, 135, 150, 160,
  ]);
  expect(combat.levels.map((r) => r.cost)).toEqual([
    250, 1000, 4000, 16000, 50000, 60000, 100000, 160000, 250000, 330000, 500000, 600000, 660000,
    1000000, 1200000, 1300000, 1500000, 1800000, 2000000, 2600000, 3000000,
  ]);
  expect(combat.levels.map((r) => r.seconds)).toEqual([
    5, 30, 120, 1200, 1800, 3600, 7200, 10800, 12600, 14400, 16200, 18000, 21600, 28800, 36000,
    39600, 43200, 57600, 72000, 86400, 129600,
  ]);
  expect(combat.levels.map((r) => r.townhall)).toEqual([
    1, 2, 2, 3, 4, 5, 6, 7, 8, 8, 9, 10, 10, 11, 11, 12, 12, 13, 13, 14, 15,
  ]);
  expect(combat).toMatchObject({
    intervalMs: 800,
    attackRange: 900,
    minAttackRange: 0,
    damageRadius: 0,
    size: 3,
    airTargets: false,
    groundTargets: true,
  });
  expect(DEFENSE_PROGRESSION.cannon).toHaveLength(12);
  for (const [i, row] of combat.levels.entries()) {
    expect(row.level).toBe(i + 1);
    expect(row.body).toBe(rows[i].ExportName);
    expect(row.projectile).toBe(rows[i].Projectile);
    if (i < 12) expect(row).toMatchObject(DEFENSE_PROGRESSION.cannon[i]);
  }
  expect(native.reconstruction.liveIntegration).toBe(false);
  expect(native.reconstruction.nativePlaybackVerified).toBe(false);
  expect(nativeCampaignIssues(55)).toEqual(['Cannon level 15']);
});

it('retains irregular turret frames, animated parents, alternate bodies and independently controlled gear', () => {
  const graph = packed as unknown as NativeMeshGraph;
  expect(Object.keys(graph.exports)).toHaveLength(101);
  expect(Object.keys(graph.clips)).toHaveLength(153);
  expect(Object.keys(graph.shapes)).toHaveLength(1305);
  expect(new Set(Object.values(graph.clips).flatMap((c) => c.blending))).toEqual(new Set([0, 8]));
  for (let level = 1; level <= 21; level++) {
    for (const suffix of level < 7 ? [''] : ['', '_down']) {
      const name = `basic_turret_lvl${level}${suffix}`;
      const root = graph.clips[graph.exports[name]];
      expect(root.timeline).toHaveLength(360);
      expect(root.fps).toBe(30);
      expect(root.frames).toHaveLength(level === 14 || level === 15 ? 81 : 1);
      expect(root.names.includes('gearup')).toBe(level >= 7);
      const turret = graph.clips[root.children[root.names.indexOf('turret')]];
      const covered = cases.filter((c) => c.export === name && c.category === 'direction');
      expect(new Set(covered.map((c) => turret.timeline[c.controls.turret]))).toEqual(
        new Set(turret.timeline),
      );
      expect(covered.some((c) => c.controls.turret === turret.timeline.length - 1)).toBe(true);
      const normal = nativeScenePoses(graph, name, 0, { turret: 137, gearup: false });
      expect(normal.length).toBeGreaterThan(
        nativeScenePoses(graph, name, 0, { turret: false, gearup: false }).length,
      );
      if (level >= 7)
        expect(nativeScenePoses(graph, name, 0, { turret: 137, gearup: 0 }).length).toBeGreaterThan(
          normal.length,
        );
      if (level === 14 || level === 15)
        expect(nativeScenePoses(graph, name, 1, { turret: 137, gearup: false })).not.toEqual(
          normal,
        );
      if (!suffix) {
        expect(turret.timeline).toHaveLength(level === 21 ? 365 : 360);
        expect(turret.frames).toHaveLength(
          level === 12 ? 41 : level >= 17 && level <= 20 ? 35 : 36,
        );
      }
    }
  }
  expect(new Set(cases.map((c) => c.export))).toEqual(new Set(Object.keys(graph.exports)));
  for (const witness of witnesses) {
    const entry = index.find((v) => v.category === witness.category)!;
    expect(witness.cases).toHaveLength(entry.cases);
    expect(witness.width).toBeLessThanOrEqual(2400);
    expect(witness.height).toBeLessThanOrEqual(12000);
  }
});

it('preserves eleven tracking projectile families, seven effects and all forty-seven ordered emitter variants', () => {
  expect(projectiles).toEqual(native.projectiles);
  expect(Object.keys(projectiles)).toHaveLength(11);
  const names = [
    'Cannonball',
    'Cannonball2',
    'Cannonball4',
    'Cannonball5',
    'Cannonball7',
    'Cannonball10',
    'Cannonball12',
    'Cannonball13',
    'Cannonball14',
    'Cannonball15',
    'Cannonball16',
  ];
  expect(names.map((n) => Number(projectiles[n][0].StartHeight))).toEqual([
    50, 48, 54, 56, 60, 65, 70, 75, 75, 75, 75,
  ]);
  expect(names.map((n) => Number(projectiles[n][0].StartOffset))).toEqual([
    50, 54, 58, 62, 66, 70, 72, 74, 76, 76, 76,
  ]);
  for (const rows of Object.values(projectiles)) {
    expect(rows[0]).toMatchObject({
      Speed: '1200',
      IsBallistic: 'FALSE',
      DontTrackTarget: 'FALSE',
      UseRotate: 'TRUE',
      ScaleTimeline: 'FALSE',
      Scale: '100',
    });
    expect(rows[0]).not.toHaveProperty('ShadowExportName');
    expect(packed.exports).toHaveProperty(rows[0].ExportName);
  }
  expect(effects).toEqual({
    effects: native.effects,
    particles: native.particles,
    sounds: native.sounds,
  });
  expect(Object.keys(native.effects)).toEqual([
    'Basic Turret Pickup',
    'Basic Turret Placing',
    'Building Destroyed',
    'Cannon Attack',
    'Cannon Attack Large',
    'Cannon Attack Larger',
    'Generic Hit',
  ]);
  expect(Object.keys(native.particles)).toHaveLength(20);
  expect(Object.values(native.particles).flat()).toHaveLength(47);
  const variants = cases.filter((c) => c.category === 'emitter-variant');
  expect(variants).toHaveLength(47);
  for (const [name, rows] of Object.entries(native.particles))
    for (const [variant, row] of rows.entries()) {
      expect(packed.exports).toHaveProperty(row.ParticleExportName);
      expect(variants.find((c) => c.emitter === name && c.variant === variant)).toMatchObject({
        export: row.ParticleExportName,
        particleBlend: (row.AdditiveBlend ?? rows[0].AdditiveBlend) === 'TRUE' ? 8 : 0,
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
      const width = right - x,
        height = bottom - y;
      const pixels = Buffer.alloc(width * height * 4);
      for (let row = 0; row < height; row++) {
        const start = ((top + row) * info.width + left) * 4;
        data.copy(pixels, row * width * 4, start, start + width * 4);
      }
      expect(hash(pixels)).toBe(region.rgbaSha256);
    }
  }
}, 30000);

it('ships six exact texture crops, twenty-one registered source portraits and five original Ogg files', async () => {
  const expected = [...Object.values(native.world.textures), ...Object.values(native.previews)].map(
    (v) => v.path.replace('assets/buildings/cannon-native/', ''),
  );
  expect(Object.keys(native.world.textures)).toEqual(['2', '8', '18', '25', '39', '41']);
  expect(expected).toHaveLength(27);
  const hashes = new Set<string>();
  for (const [key, preview] of Object.entries(native.previews)) {
    expect(preview.export).toBe(`basic_turret_lvl${key}`);
    expect(preview.baseExport).toBe(`basic_cannon_lvl${Math.min(11, Number(key))}_base`);
    expect(preview.controls).toEqual({ turret: 0, gearup: false });
    expect(preview.bounds).toEqual([-101, -25, 104, 148]);
    const { data, info } = await sharp(`public/${preview.path}`)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect([info.width, info.height, hash(data)]).toEqual([410, 346, preview.rgbaSha256]);
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
  expect(hashes.size).toBe(21);
  expect(Object.keys(native.sounds)).toHaveLength(5);
  for (const sound of Object.values(native.sounds)) {
    expected.push(sound.path.split('/').at(-1)!);
    const bytes = await readFile(`public/${sound.path}`);
    expect(bytes.subarray(0, 4).toString()).toBe('OggS');
    expect(hash(bytes)).toBe(sound.sha256);
  }
  const files = await readdir('public/assets/buildings/cannon-native', {
    recursive: true,
    withFileTypes: true,
  });
  expect(
    files
      .filter((f) => f.isFile())
      .map((f) => `${f.parentPath}/${f.name}`.replace('public/assets/buildings/cannon-native/', ''))
      .sort(),
  ).toEqual(expected.sort());
});
