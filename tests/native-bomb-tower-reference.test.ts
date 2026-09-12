import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import sharp from 'sharp';
import { expect, it } from 'vitest';
import native from '../reference/bombtower/native.json';
import body from '../reference/bombtower/body.json';
import defender from '../reference/bombtower/defender.json';
import combat from '../reference/bombtower/combat.json';
import effects from '../reference/bombtower/effects.json';
import { nativeScenePoses, type NativeMeshGraph } from '../src/game/native-mesh';

const hash = (data: Buffer) => createHash('sha256').update(data).digest('hex');

it('retains all 13 native levels and the level-three weapon/defender transition', () => {
  expect(native.building).toHaveLength(13);
  expect(native.building[0]).toMatchObject({ GlobalID: '1000032', Width: '3', Height: '3' });
  expect(combat).toMatchObject({
    intervalMs: 1100,
    attackRange: 600,
    damageRadius: 150,
    deathRadius: 275,
    deathDelayMs: 1000,
    defenderZ: 145,
    airTargets: false,
    groundTargets: true,
    size: 3,
  });
  expect(combat.levels.map((v) => v.hp)).toEqual([
    650, 700, 750, 850, 1050, 1300, 1600, 1900, 2300, 2500, 2700, 2900, 3050,
  ]);
  expect(combat.levels.map((v) => v.deathDamage)).toEqual([
    150, 180, 220, 260, 300, 350, 400, 450, 500, 550, 600, 650, 700,
  ]);
  expect(combat.levels[2]).toEqual({
    level: 3,
    townhall: 9,
    hp: 750,
    dps: 32,
    cost: 1300000,
    deathDamage: 220,
    seconds: 86400,
    projectile: 'Bomb Tower Ammo2',
    defender: 'BomberTower_lvl2',
    hitEffect: 'Bomb Tower Hit2',
    destroyedEffect: 'Bomb Tower Destroyed2',
    body: 'bomb_tower_lvl3',
  });
  for (const rows of Object.values(native.projectiles))
    expect(rows[0]).toMatchObject({
      Speed: '800',
      StartHeight: '200',
      StartOffset: '10',
      IsBallistic: 'TRUE',
      DontTrackTarget: 'TRUE',
      UseRotate: 'TRUE',
      MaxBounceDistance: '0',
    });
  expect(effects).toEqual({
    effects: native.effects,
    particles: native.particles,
    sounds: native.sounds,
  });
  expect(native.reconstruction.liveIntegration).toEqual({
    body: true,
    defender: true,
    projectile: true,
    deathBomb: true,
    impactParticles: false,
    audio: false,
  });
});

it('preserves each animation table header, the original three directions and action frame 11', () => {
  expect(Object.keys(defender.exports)).toHaveLength(18);
  for (const table of Object.values(native.animations)) {
    expect(table.headers).toEqual([
      'Name',
      'HasDirections',
      'ActionFrame',
      'ExportName',
      'Looping',
      'StopToLast',
      'Scale',
      'SWF',
    ]);
    const [idle, attack, walk] = table.rows;
    expect(idle).toMatchObject({ Name: 'idle', Scale: '108', Looping: 'TRUE' });
    expect(attack).toMatchObject({
      Name: 'attack',
      ActionFrame: '11',
      Looping: 'FALSE',
      StopToLast: 'TRUE',
    });
    expect(walk.ExportName).toBe(idle.ExportName);
    for (const [row, frames] of [
      [idle, 101],
      [attack, 21],
    ] as const)
      for (let direction = 1; direction <= 3; direction++) {
        const name = `${row.ExportName}_${direction}`;
        const graph = defender as unknown as NativeMeshGraph;
        expect(graph.clips[graph.exports[name]].fps).toBe(24);
        expect(graph.clips[graph.exports[name]].timeline).toHaveLength(frames);
        expect(
          nativeScenePoses(graph, name, 11 / 24, { ability_on: false }).length,
        ).toBeGreaterThan(0);
      }
  }
});

for (const [name, packed, original] of [
  ['body', body, native.body],
  ['defender', defender, native.defender],
] as const)
  it(`preserves ${name} polygons, transforms, timelines and exact texture sampling regions`, async () => {
    const graph = packed as unknown as NativeMeshGraph;
    for (const field of ['clips', 'matrices', 'colors', 'exports'] as const)
      expect(packed[field]).toEqual(original.graph[field]);
    const textures = original.textures as Record<string, (typeof native.body.textures)['5']>;
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

it('ships the verified textures, thirteen source portraits and six original sounds', async () => {
  const expected = [
    ...Object.values(native.body.textures),
    ...Object.values(native.defender.textures),
    ...Object.values(native.previews),
  ].map((v) => v.path.replace('assets/buildings/bombtower-native/', ''));
  for (const sound of Object.values(native.sounds)) {
    expected.push(sound.path.split('/').at(-1)!);
    const bytes = await readFile(`public/${sound.path}`);
    expect(bytes.subarray(0, 4).toString()).toBe('OggS');
    expect(hash(bytes)).toBe(sound.sha256);
  }
  const files = await readdir('public/assets/buildings/bombtower-native', {
    recursive: true,
    withFileTypes: true,
  });
  expect(
    files
      .filter((f) => f.isFile())
      .map((f) =>
        `${f.parentPath}/${f.name}`.replace('public/assets/buildings/bombtower-native/', ''),
      )
      .sort(),
  ).toEqual(expected.sort());
});
