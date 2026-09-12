import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import sharp from 'sharp';
import { expect, it } from 'vitest';
import native from '../reference/wizard-tower/native.json';
import body from '../reference/wizard-tower/body.json';
import defender from '../reference/wizard-tower/defender.json';
import combat from '../reference/wizard-tower/combat.json';
import effects from '../reference/wizard-tower/effects.json';
import effectArt from '../reference/wizard-tower/effect_art.json';
import { nativeScenePoses, type NativeMeshGraph } from '../src/game/native-mesh';

const hash = (data: Buffer) => createHash('sha256').update(data).digest('hex');

it('resolves all seventeen sparse source levels without losing inherited weapon or art fields', () => {
  expect(native.building).toHaveLength(17);
  expect(native.building[0]).toMatchObject({ GlobalID: '1000011', Width: '3', Height: '3' });
  expect(combat).toMatchObject({
    intervalMs: 1300,
    range: 700,
    radius: 100,
    size: 3,
    airTargets: true,
    groundTargets: true,
  });
  expect(combat.levels.map((v) => v.hp)).toEqual([
    620, 650, 680, 730, 840, 960, 1200, 1440, 1600, 1900, 2120, 2240, 2500, 2800, 3000, 3150, 3300,
  ]);
  expect(combat.levels.map((v) => v.dps)).toEqual([
    11, 13, 16, 20, 24, 32, 40, 45, 50, 62, 70, 78, 84, 90, 95, 102, 110,
  ]);
  expect(combat.levels.map((v) => v.body)).toEqual(
    [1, 4, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21].map(
      (n) => `wizard_tower_lvl${n}`,
    ),
  );
  let inherited: Record<string, string> = {};
  for (const [i, row] of native.building.entries()) {
    inherited = { ...inherited, ...row };
    expect(combat.levels[i]).toMatchObject({
      level: i + 1,
      townhall: Number(inherited.TownHallLevel),
      cost: Number(inherited.BuildCost),
      defender: inherited.DefenderCharacter,
      defenderZ: Number(inherited.DefenderZ),
      projectile: inherited.Projectile,
      attackEffect: inherited.AttackEffect,
      hitEffect: inherited.HitEffect,
      seconds:
        Number(inherited.BuildTimeD) * 86400 +
        Number(inherited.BuildTimeH) * 3600 +
        Number(inherited.BuildTimeM) * 60 +
        Number(inherited.BuildTimeS),
    });
    for (const [field, name] of Object.entries(body.levels[i])) {
      expect(name).toBe(inherited[field]);
      expect(body.exports).toHaveProperty(name);
    }
  }
  expect(combat.levels[10]).toMatchObject({
    townhall: 12,
    hp: 2120,
    dps: 70,
    defender: 'Wizard8',
    cost: 2500000,
    seconds: 129600,
  });
  expect(native.reconstruction.liveIntegration).toBe(false);
  expect(native.reconstruction.nativePlaybackVerified).toBe(false);
});

it('retains eleven Wizard families, three directions, and the source action frame without inventing a death source', () => {
  expect(Object.keys(native.animations)).toHaveLength(11);
  expect(Object.keys(defender.exports)).toHaveLength(66);
  const graph = defender as unknown as NativeMeshGraph;
  for (const table of Object.values(native.animations)) {
    expect(table.rows.map((r) => r.Name)).toEqual(['walk', 'idle', 'attack', 'celebrate', 'die']);
    const idle = table.rows[1],
      attack = table.rows[2],
      death = table.rows[4];
    expect(attack).toMatchObject({ ActionFrame: '14', Looping: 'FALSE', StopToLast: 'TRUE' });
    expect(death).toMatchObject({ ExportName: 'barbarian_death_1' });
    expect(death).not.toHaveProperty('SWF');
    for (const [row, frames] of [
      [idle, 1],
      [attack, 24],
    ] as const)
      for (const direction of [1, 2, 3]) {
        const name = `${row.ExportName}_${direction}`;
        expect(graph.clips[graph.exports[name]].fps).toBe(24);
        expect(graph.clips[graph.exports[name]].timeline).toHaveLength(frames);
        expect(nativeScenePoses(graph, name, 14 / 24).length).toBeGreaterThan(0);
      }
  }
});

it('preserves four nontracking projectile tiers and all repeated effect/particle variants', () => {
  const projectiles = Object.values(native.projectiles).map((rows) => rows[0]);
  expect(projectiles.map((p) => p.Speed)).toEqual(['500', '900', '900', '900']);
  expect(projectiles.map((p) => p.Scale)).toEqual(['50', '50', '60', '65']);
  for (const p of projectiles)
    expect(p).toMatchObject({
      DontTrackTarget: 'TRUE',
      IsBallistic: 'FALSE',
      UseRotate: 'TRUE',
      StartHeight: '180',
      StartOffset: '70',
      PlayOnce: 'FALSE',
    });
  expect(effects).toEqual({
    effects: native.effects,
    particles: native.particles,
    projectiles: native.projectiles,
    sounds: native.sounds,
  });
  expect(Object.keys(native.effects)).toHaveLength(11);
  expect(Object.keys(native.particles)).toHaveLength(26);
  for (const rows of Object.values(native.particles)) {
    let swf = rows[0].ParticleSwf;
    for (const row of rows as Record<string, string>[]) {
      swf = row.ParticleSwf ?? swf;
      if (row.ParticleExportName)
        expect(swf === 'sc/buildings.sc' ? body.exports : effectArt.exports).toHaveProperty(
          row.ParticleExportName,
        );
    }
  }
});

it('retains the higher-tier isolated screen layers and their animated group color transforms', () => {
  const graph = effectArt as unknown as NativeMeshGraph;
  for (const tier of [3, 4]) {
    const poses = nativeScenePoses(graph, `fx_chr_WizardAttack_Projectile_Lvl${tier}`, 1 / 24);
    const group = poses.find((p) => 'group' in p && p.blend === 4);
    expect(group).toBeDefined();
    expect({ multiply: group!.multiply, add: group!.add }).not.toEqual({
      multiply: [1, 1, 1, 1],
      add: [0, 0, 0, 0],
    });
  }
});

for (const [name, packed, original] of [
  ['body', body, native.body],
  ['defender', defender, native.defender],
  ['particles', effectArt, native.effectArt],
] as const)
  it(`preserves ${name} polygons, transforms, timelines and exact texture sampling regions`, async () => {
    const graph = packed as unknown as NativeMeshGraph;
    for (const field of ['clips', 'matrices', 'colors', 'exports'] as const)
      expect(packed[field]).toEqual(original.graph[field]);
    const textures = original.textures as Record<string, (typeof native.body.textures)['8']>;
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

it('ships the verified textures, seventeen source portraits and seven original sounds', async () => {
  const expected = [
    ...Object.values(native.body.textures),
    ...Object.values(native.defender.textures),
    ...Object.values(native.effectArt.textures),
    ...Object.values(native.previews),
  ].map((v) => v.path.replace('assets/buildings/wizard-tower-native/', ''));
  expect(expected).toHaveLength(24);
  for (const preview of Object.values(native.previews)) {
    const { data, info } = await sharp(`public/${preview.path}`)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect([info.width, info.height, hash(data)]).toEqual([360, 380, preview.rgbaSha256]);
  }
  expect(Object.keys(native.sounds)).toHaveLength(7);
  for (const sound of Object.values(native.sounds)) {
    expected.push(sound.path.split('/').at(-1)!);
    const bytes = await readFile(`public/${sound.path}`);
    expect(bytes.subarray(0, 4).toString()).toBe('OggS');
    expect(hash(bytes)).toBe(sound.sha256);
  }
  const files = await readdir('public/assets/buildings/wizard-tower-native', {
    recursive: true,
    withFileTypes: true,
  });
  expect(
    files
      .filter((f) => f.isFile())
      .map((f) =>
        `${f.parentPath}/${f.name}`.replace('public/assets/buildings/wizard-tower-native/', ''),
      )
      .sort(),
  ).toEqual(expected.sort());
});
