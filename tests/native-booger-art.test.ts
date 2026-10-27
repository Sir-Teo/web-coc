import { expect, it } from 'vitest';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import index from '../reference/full-client/booger-art.json';
import { nativeUnitStats, isSpawnKind, isPetUnitKind } from '../src/game/native-units';
import { troopSoundFiles, TROOP_SOUNDS } from '../src/game/troop-sounds';

it('keeps Booger as a ten-tier spawned flying troop with source trap immunity', () => {
  expect(isSpawnKind('booger')).toBe(true);
  expect(isPetUnitKind('booger')).toBe(false);
  expect(nativeUnitStats('booger', 1)).toMatchObject({
    hp: 1100,
    dps: 105,
    damage: 105,
    rate: 1,
    speed: 2,
    housing: 4,
    range: 0.9,
    flying: true,
    groundTargets: true,
    airTargets: true,
    triggersTraps: false,
  });
  expect(nativeUnitStats('booger', 10)).toMatchObject({ hp: 2000, dps: 150, damage: 150 });
});

it('keeps the original four-state Booger rig, eight directions and matching published texture hashes', () => {
  const source = index.characters.booger;
  expect(source.record).toBe('logic/characters.csv:Booger');
  expect(source.geometry).toBe('sc3d/batbubble_default_geo.glb');
  expect(source.animation).toBe('AirSplitPetSpawn');
  const atlas = JSON.parse(
    fs.readFileSync('public/assets/heroes-native/booger/atlas.json', 'utf8'),
  );
  expect(Object.keys(atlas.states).sort()).toEqual(['attack', 'die', 'idle', 'walk']);
  for (const state of Object.values(atlas.states) as { frames: unknown[][]; fps: number }[]) {
    expect(state.frames).toHaveLength(8);
    expect(state.fps).toBeGreaterThan(0);
  }
  for (const [name, image] of Object.entries(source.images)) {
    const bytes = fs.readFileSync('public/assets/heroes-native/booger/' + name);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(image.sha256);
  }
});

it('ships all four original Booger samples with their source hashes', () => {
  const files = troopSoundFiles('booger');
  expect(files).toHaveLength(4);
  for (const path of files) {
    const record = TROOP_SOUNDS[path];
    expect(
      createHash('sha256')
        .update(fs.readFileSync('public/' + record.path))
        .digest('hex'),
    ).toBe(record.sha256);
  }
});
