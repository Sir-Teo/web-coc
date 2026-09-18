import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import sharp from 'sharp';
import { expect, it } from 'vitest';
import native from '../reference/shrink-trap/native.json';
import packed from '../reference/shrink-trap/runtime.json';
import effects from '../reference/shrink-trap/effects.json';
import campaign from '../reference/campaign/runtime.json';
import { nativeScenePoses, type NativeMeshGraph } from '../src/game/native-mesh';

const hash = (data: Buffer) => createHash('sha256').update(data).digest('hex');

it('retains both original trap identities and distinguishes campaign-only placement from home availability', () => {
  expect(Object.keys(native.sources)).toHaveLength(14);
  expect(native.clientVersion).toBe('18.400.21');
  expect(Object.keys(native.traps)).toEqual(['ShrinkTrap', 'ShrinkTrap_SinglePlayer']);
  const home = native.traps.ShrinkTrap[0],
    npc = native.traps.ShrinkTrap_SinglePlayer[0];
  expect(home).toMatchObject({
    GlobalID: '12000015',
    EnabledByCalendar: 'TRUE',
    TownHallLevel: '1',
  });
  expect(npc).toMatchObject({ GlobalID: '12000017', Disabled: 'TRUE', TownHallLevel: '9999' });
  for (const row of [home, npc]) {
    expect(row).toMatchObject({
      Width: '2',
      Height: '2',
      Passable: 'TRUE',
      TriggerRadius: '200',
      DamageRadius: '300',
      AirTrigger: 'TRUE',
      GroundTrigger: 'TRUE',
      MinTriggerHousingLimit: '1',
      Spell: 'ShrinkTrap',
      ActionFrame: '14',
      DurationMS: '20000',
    });
  }
  expect(campaign.stages[54].name).toBe('Magic Practice');
  const placements = campaign.stages[54].traps.filter((v) => v[0] === 12000017);
  expect(placements).toHaveLength(8);
  expect(placements.every((v) => v[3] === 1)).toBe(true);
  expect(native.reconstruction.liveIntegration).toBe(true);
});

it('retains source timing and legacy health fields without treating them as verified executable behavior', () => {
  expect(native.spells.ShrinkTrap).toHaveLength(1);
  expect(native.spells.ShrinkTrap[0]).toMatchObject({
    GlobalID: '26000021',
    DisableProduction: 'TRUE',
    ChargingTimeMS: '300',
    HitTimeMS: '1000',
    Radius: '400',
    NumberOfHits: '75',
    TimeBetweenHitsMS: '250',
    RandomRadiusAffectsOnlyGfx: 'TRUE',
    ShrinkReduceSpeedRatio: '-50',
    ShrinkHitpointsRatio: '50',
  });
  expect(native.globals.SHRINK_SPELL_DURATION_SECONDS[0].NumberValue).toBe('7');
  expect(native.reconstruction.health).toContain('no longer reduces HP');
  expect(native.reconstruction.nativePlaybackVerified).toBe(false);
});

it('keeps all trap frames, the direct reveal clip, original aura playback and repeated emitter variants', () => {
  const graph = packed as unknown as NativeMeshGraph;
  expect(Object.keys(graph.exports)).toHaveLength(23);
  expect(Object.keys(graph.clips)).toHaveLength(25);
  expect(Object.keys(graph.shapes)).toHaveLength(35);
  for (const [name, frames, fps] of [
    ['Shrink_trap_armed', 1, 24],
    ['Shrink_trap_unarmed', 1, 24],
    ['Shrink_trap_trigger', 14, 24],
    ['gen_appear_fx', 18, 30],
    ['shrink_glow', 601, 24],
    ['shrink_range', 1, 24],
    ['shrink_circle', 1, 24],
  ] as const) {
    const clip = graph.clips[graph.exports[name]];
    expect(clip.fps).toBe(fps);
    expect(clip.timeline).toHaveLength(frames);
  }
  for (let frame = 0; frame < 13; frame++)
    expect(nativeScenePoses(graph, 'Shrink_trap_trigger', frame / 24).length).toBeGreaterThan(0);
  expect(nativeScenePoses(graph, 'Shrink_trap_trigger', 13 / 24)).toEqual([]);
  expect(effects).toEqual({
    effects: native.effects,
    particles: native.particles,
    sounds: native.sounds,
  });
  expect(Object.keys(native.effects)).toHaveLength(6);
  expect(Object.keys(native.particles)).toHaveLength(8);
  expect(native.effects['Shrink Trap Appear'][0]).toMatchObject({
    ExportName: 'gen_appear_fx',
    SWF: 'sc/buildings.sc',
    Sound: 'sfx/shrink_spell_03.ogg',
    Volume: '90',
  });
  expect(native.effects['Shrink deploy'].map((v) => v.ParticleEmitter)).toEqual([
    'Grass',
    'Shrink_glow',
    'Shrink_deploy_range',
    'Shrink_deploy_range_anim',
    'Birthday_confetti_explosion',
  ]);
  expect(native.particles.Birthday_confetti_explosion.map((v) => v.AdditiveBlend)).toEqual([
    'TRUE',
    'FALSE',
    'TRUE',
    'TRUE',
  ]);
  for (const rows of Object.values(native.particles)) {
    for (const row of rows as Record<string, string>[])
      if (row.ParticleExportName) expect(graph.exports).toHaveProperty(row.ParticleExportName);
  }
});

it('preserves original polygons, transforms, timelines and exact texture sampling regions', async () => {
  const original = native.world;
  const graph = packed as unknown as NativeMeshGraph;
  for (const field of ['clips', 'matrices', 'colors', 'exports'] as const)
    expect(packed[field]).toEqual(original.graph[field]);
  const textures = original.textures as Record<string, (typeof native.world.textures)['18']>;
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

it('ships exactly three lossless texture crops, two registered previews and four unchanged Ogg files', async () => {
  const references = [...Object.values(native.world.textures), ...Object.values(native.previews)];
  const expected = references.map(
    (v) => v.path.replace('assets/buildings/shrink-trap-native/', ''),
  );
  expect(expected).toHaveLength(5);
  // Duplicate texture pages consolidate into shared files: the directory holds
  // the unique locally-referenced entries.
  const local = [...new Set(
    references
      .map((v) => v.path)
      .filter((p) => p.startsWith('assets/buildings/shrink-trap-native/'))
      .map((p) => p.replace('assets/buildings/shrink-trap-native/', '')),
  )];
  for (const preview of Object.values(native.previews)) {
    const { data, info } = await sharp(`public/${preview.path}`)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect([info.width, info.height, hash(data)]).toEqual([226, 340, preview.rgbaSha256]);
    expect(preview.bounds).toEqual([-55, -84, 58, 86]);
  }
  expect(Object.keys(native.sounds)).toHaveLength(4);
  for (const sound of Object.values(native.sounds)) {
    local.push(sound.path.split('/').at(-1)!);
    const bytes = await readFile(`public/${sound.path}`);
    expect(bytes.subarray(0, 4).toString()).toBe('OggS');
    expect(hash(bytes)).toBe(sound.sha256);
  }
  const files = await readdir('public/assets/buildings/shrink-trap-native', {
    recursive: true,
    withFileTypes: true,
  });
  expect(
    files
      .filter((f) => f.isFile())
      .map((f) =>
        `${f.parentPath}/${f.name}`.replace('public/assets/buildings/shrink-trap-native/', ''),
      )
      .sort(),
  ).toEqual(local.sort());
});
