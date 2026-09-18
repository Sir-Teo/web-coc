import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import tornadoNative from '../reference/tornado-trap/native.json';
import tornadoRuntime from '../reference/tornado-trap/runtime.json';
import tornadoVfx from '../reference/tornado-trap/vfx-runtime.json';
import tornadoEffects from '../reference/tornado-trap/effects.json';
import tornadoCombat from '../reference/tornado-trap/combat.json';
import freezeNative from '../reference/freeze-trap/native.json';
import freezeRuntime from '../reference/freeze-trap/runtime.json';
import freezeEffects from '../reference/freeze-trap/effects.json';
import freezeCombat from '../reference/freeze-trap/combat.json';
import campaign from '../reference/campaign/runtime.json';
import { nativeScenePoses, type NativeMeshGraph } from '../src/game/native-mesh';
import { TORNADO_TRAP_ART } from '../src/game/tornado-trap-art';
import { FREEZE_TRAP_ART } from '../src/game/freeze-trap-art';

const hash = (data: Buffer) => createHash('sha256').update(data).digest('hex');
type Textures = Record<
  string,
  {
    path: string;
    width: number;
    height: number;
    sourceSize: number[];
    rgbaSha256: string;
    regions: { bounds: number[]; placement: number[]; rgbaSha256: string }[];
  }
>;

/** Packed runtime graphs keep every source transform and sample exactly the retained texels. */
async function expectPackedGraph(
  original: { graph: Record<string, unknown>; textures: unknown },
  packed: Record<string, unknown>,
) {
  const graph = packed as unknown as NativeMeshGraph;
  for (const field of ['clips', 'matrices', 'colors', 'exports'] as const)
    expect(packed[field]).toEqual(original.graph[field]);
  const textures = original.textures as Textures;
  for (const [id, commands] of Object.entries(
    original.graph.shapes as Record<string, [number, number[]][]>,
  ))
    for (const [i, [t, vertices]] of commands.entries()) {
      const [texture, v] = graph.shapes[id][i];
      expect(texture).toBe(t);
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
          9,
        );
        expect(v[j + 3] * info.height - dy).toBeCloseTo(
          (vertices[j + 3] / 65535) * info.sourceSize[1],
          9,
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
}
async function files(folder: string) {
  const entries = await readdir(`public/${folder}`, { recursive: true, withFileTypes: true });
  return entries
    .filter((f) => f.isFile())
    .map((f) => `${f.parentPath}/${f.name}`.replace(`public/${folder}/`, ''))
    .sort();
}

describe('original Tornado Trap source', () => {
  it('retains all three pinned levels, the named spell and the four campaign villages', () => {
    expect(Object.keys(tornadoNative.sources)).toHaveLength(14);
    expect(tornadoNative.clientVersion).toBe('18.400.21');
    const [one, two, three] = tornadoCombat.trap;
    expect(one).toMatchObject({
      GlobalID: '12000016',
      Width: '1',
      Height: '1',
      TriggerRadius: '300',
      DamageRadius: '300',
      MinTriggerHousingLimit: '1',
      EjectVictims: 'FALSE',
      AirTrigger: 'TRUE',
      GroundTrigger: 'TRUE',
      ActionFrame: '8',
      SpeedMod: '100',
      Spell: 'Tornado Trap',
      ExportName: 'tornado_trap_setup_lvl1',
      ExportNameTriggered: 'tornado_trap_lvl1',
      ExportNameBroken: 'tornado_trap_unarmed_lvl1',
      AppearEffect: 'Shrink Trap Appear',
    });
    expect([one, two, three].map((row) => row.DurationMS)).toEqual(['5000', '6000', '7000']);
    expect(three).toMatchObject({
      ExportName: 'tornado_trap_setup_lvl2',
      ExportNameTriggered: 'tornado_trap_lvl2',
    });
    expect(tornadoCombat.spell.map((row) => row.NumberOfHits)).toEqual(['39', '47', '55']);
    for (const row of tornadoCombat.spell)
      expect(row).toMatchObject({
        GlobalID: '26000025',
        DeployTimeMS: '0',
        ChargingTimeMS: '300',
        HitTimeMS: '375',
        Damage: '1',
        Radius: '400',
        TimeBetweenHitsMS: '128',
        RandomRadiusAffectsOnlyGfx: 'TRUE',
        DeployEffect: 'ps_trap_tornadoTrap',
        TornadoForce1: '400',
        TornadoForce5: '100',
        TornadoForceAir1: '500',
        TornadoForceAir5: '150',
        TornadoRotationSpeed: '-180',
        TornadoSpeedTowardsCenter: '75',
        TornadoInnerRadius: '70',
        TornadoInnerForcePercent: '100',
        TornadoOuterForcePercent: '65',
      });
    expect(tornadoCombat.siegeForceTier).toBe(1);
    const placements = campaign.stages.flatMap((stage, index) =>
      stage.traps.filter((p) => p[0] === 12000016).map((p) => [index, p[3]]),
    );
    expect(placements).toEqual([
      ...Array(4).fill([66, 1]),
      [76, 1],
      ...Array(2).fill([81, 3]),
      ...Array(4).fill([82, 3]),
    ]);
  });

  it('keeps the trap clips, the reveal clip and the current vfx deploy effect with every emitter', () => {
    const world = tornadoRuntime as unknown as NativeMeshGraph,
      vfx = tornadoVfx as unknown as NativeMeshGraph;
    for (const [graph, name, frames, fps] of [
      [world, 'tornado_trap_setup_lvl1', 200, 24],
      [world, 'tornado_trap_setup_lvl2', 200, 24],
      [world, 'tornado_trap_unarmed_lvl1', 200, 24],
      [world, 'tornado_trap_lvl1', 614, 24],
      [world, 'tornado_trap_lvl2', 614, 24],
      [world, 'gen_appear_fx', 18, 30],
      [vfx, 'vfx_trap_tornado_Model', 614, 24],
      [vfx, 'vfx_trap_tornado_Wind', 1, 24],
      [vfx, 'vfx_trap_tornado_WindOverlay', 1, 24],
    ] as const) {
      const clip = graph.clips[graph.exports[name]];
      expect([name, clip.timeline.length, clip.fps]).toEqual([name, frames, fps]);
    }
    expect(world.clips[world.exports.tornado_trap_lvl1]).toBeDefined();
    expect(Object.keys(vfx.textures)).toEqual(['0']);
    expect(Object.keys(world.textures).sort()).toEqual(['18', '39', '66']);
    expect(tornadoEffects).toEqual({
      effects: {
        'Shrink Trap Appear': tornadoNative.effects['Shrink Trap Appear'],
        ps_trap_tornadoTrap: tornadoNative.effects.ps_trap_tornadoTrap,
      },
      particles: tornadoNative.particles,
      sounds: tornadoNative.sounds,
    });
    expect(tornadoEffects.effects.ps_trap_tornadoTrap.map((r) => r.ParticleEmitter)).toEqual([
      'e_trap_TornadoTrap_Shadow',
      'e_trap_TornadoTrap_Model',
      'e_trap_TornadoTrap_branches',
      'e_trap_TornadoTrap_WindStart',
      'e_trap_TornadoTrap_Wind',
      'e_trap_TornadoTrap_WindOverlay',
      'e_trap_TornadoTrap_branches',
    ]);
    for (const [name, rows] of Object.entries(tornadoEffects.particles))
      for (const row of rows as Record<string, string>[])
        if (row.ParticleExportName)
          expect((name === 'Grass' ? world : vfx).exports).toHaveProperty(row.ParticleExportName);
    // The Model particle opens from its closed box (frame 0) into the spinning machine.
    expect(nativeScenePoses(vfx, 'vfx_trap_tornado_Model', 0).length).toBeGreaterThan(0);
    expect(nativeScenePoses(world, 'tornado_trap_lvl1', 8 / 24).length).toBeGreaterThan(0);
  });

  it('preserves original polygons, transforms, timelines and exact sampling regions', async () => {
    await expectPackedGraph(tornadoNative.world, tornadoRuntime);
    await expectPackedGraph(tornadoNative.vfx, tornadoVfx);
  }, 30000);

  it('ships only lossless crops, two registered previews and two unchanged Ogg files', async () => {
    const references = [
      ...Object.values(tornadoNative.world.textures),
      ...Object.values(tornadoNative.vfx.textures),
      ...Object.values(tornadoNative.previews),
      ...Object.values(tornadoNative.sounds),
    ];
    // Duplicate texture pages consolidate into shared files: the directory
    // holds the unique locally-referenced entries.
    const expected = [...new Set(
      references
        .map((v) => v.path)
        .filter((p) => p.startsWith('assets/buildings/tornado-trap-native/'))
        .map((p) => p.replace('assets/buildings/tornado-trap-native/', '')),
    )];
    expect(await files('assets/buildings/tornado-trap-native')).toEqual(expected.sort());
    for (const preview of Object.values(tornadoNative.previews)) {
      const { data, info } = await sharp(`public/${preview.path}`)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      expect([info.width, info.height, hash(data)]).toEqual([216, 172, preview.rgbaSha256]);
      expect(preview.bounds).toEqual([...TORNADO_TRAP_ART.bounds]);
    }
    expect(Object.keys(tornadoNative.sounds)).toEqual([
      'sfx/shrink_spell_03.ogg',
      'sfx/total_suckage_01.ogg',
    ]);
    for (const sound of Object.values(tornadoNative.sounds)) {
      const bytes = await readFile(`public/${sound.path}`);
      expect(bytes.subarray(0, 4).toString()).toBe('OggS');
      expect(hash(bytes)).toBe(sound.sha256);
    }
  });
});

describe('original Goblin Freeze Trap source', () => {
  it('retains both identities, the FreezeTrap spell and every campaign placement', () => {
    expect(Object.keys(freezeNative.sources)).toHaveLength(11);
    expect(Object.keys(freezeNative.traps)).toEqual(['FreezeBomb', 'FreezeTrap_SinglePlayer']);
    expect(freezeNative.traps.FreezeBomb[0]).toMatchObject({
      GlobalID: '12000009',
      EnabledByCalendar: 'TRUE',
    });
    expect(freezeCombat.trap).toEqual(freezeNative.traps.FreezeTrap_SinglePlayer[0]);
    expect(freezeCombat.trap).toMatchObject({
      GlobalID: '12000018',
      TID: 'TID_TRAP_FREEZE_SP',
      Width: '2',
      Height: '2',
      TriggerRadius: '200',
      DamageRadius: '300',
      MinTriggerHousingLimit: '1',
      ActionFrame: '14',
      DurationMS: '5000',
      AirTrigger: 'TRUE',
      GroundTrigger: 'TRUE',
      Spell: 'FreezeTrap',
      AppearEffect: 'Bomb Appear',
      Disabled: 'TRUE',
    });
    expect(freezeCombat.spell).toMatchObject({
      GlobalID: '26000018',
      DeployTimeMS: '0',
      ChargingTimeMS: '300',
      HitTimeMS: '10',
      Radius: '350',
      NumberOfHits: '1',
      RandomRadiusAffectsOnlyGfx: 'TRUE',
      FreezeTimeMS: '5000',
      FreezeOuterTimeMS: '4500',
      DeployEffect: 'Freeze deploy lvl1',
      DeployEffect2: 'Freeze deploy2 lvl1',
      ScaleByTH: 'TRUE',
    });
    expect(freezeCombat.spell).not.toHaveProperty('Damage');
    expect(freezeCombat.triggerFps).toBe(24);
    const placements = campaign.stages.flatMap((stage, index) =>
      stage.traps.filter((p) => p[0] === 12000018).map((p) => [index, p[3]]),
    );
    expect(placements).toEqual([...Array(12).fill([64, 1]), ...Array(10).fill([81, 1])]);
  });

  it('keeps the compartment, rising bottle, reveal and both deploy effects', () => {
    const graph = freezeRuntime as unknown as NativeMeshGraph;
    for (const [name, frames, fps] of [
      ['Freeze_trap_armed', 1, 24],
      ['Freeze_trap_unarmed', 1, 24],
      ['Freeze_trap_trigger', 14, 24],
      ['gen_appear_fx', 18, 30],
      ['freeze_blue_glow', 610, 24],
      ['frost_star_1', 600, 24],
    ] as const) {
      const clip = graph.clips[graph.exports[name]];
      expect([name, clip.timeline.length, clip.fps]).toEqual([name, frames, fps]);
    }
    for (let frame = 0; frame < 13; frame++)
      expect(nativeScenePoses(graph, 'Freeze_trap_trigger', frame / 24).length).toBeGreaterThan(0);
    expect(nativeScenePoses(graph, 'Freeze_trap_trigger', 13 / 24)).toEqual([]);
    expect(freezeEffects).toEqual({
      effects: {
        'Bomb Appear': freezeNative.effects['Bomb Appear'],
        'Freeze deploy lvl1': freezeNative.effects['Freeze deploy lvl1'],
        'Freeze deploy2 lvl1': freezeNative.effects['Freeze deploy2 lvl1'],
      },
      particles: freezeNative.particles,
      sounds: freezeNative.sounds,
    });
    expect(Object.keys(freezeEffects.particles)).toEqual([
      'Freeze1_lvl1',
      'Freeze2_lvl1',
      'Freeze3_lvl1',
      'Freeze_crystal_lvl1',
      'Freeze_dots1_lvl1',
      'Freeze_dots2_lvl1',
      'Freeze_glow_blue_lvl1',
      'Grass',
    ]);
    for (const rows of Object.values(freezeEffects.particles))
      for (const row of rows as Record<string, string>[])
        if (row.ParticleExportName) expect(graph.exports).toHaveProperty(row.ParticleExportName);
  });

  it('preserves original polygons, transforms, timelines and exact sampling regions', async () => {
    await expectPackedGraph(freezeNative.world, freezeRuntime);
  }, 30000);

  it('ships only lossless crops, two registered previews and two unchanged Ogg files', async () => {
    const expected = [
      ...Object.values(freezeNative.world.textures),
      ...Object.values(freezeNative.previews),
      ...Object.values(freezeNative.sounds),
    ].map((v) => v.path.replace('assets/buildings/freeze-trap-native/', ''));
    expect(await files('assets/buildings/freeze-trap-native')).toEqual(expected.sort());
    for (const preview of Object.values(freezeNative.previews)) {
      const { data, info } = await sharp(`public/${preview.path}`)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      expect([info.width, info.height, hash(data)]).toEqual([242, 344, preview.rgbaSha256]);
      expect(preview.bounds).toEqual([...FREEZE_TRAP_ART.bounds]);
    }
    expect(Object.keys(freezeNative.sounds)).toEqual([
      'sfx/bad_move_06.ogg',
      'sfx/freeze_spell_01.ogg',
    ]);
    for (const sound of Object.values(freezeNative.sounds)) {
      const bytes = await readFile(`public/${sound.path}`);
      expect(bytes.subarray(0, 4).toString()).toBe('OggS');
      expect(hash(bytes)).toBe(sound.sha256);
    }
  });
});
