import { expect, it } from 'vitest';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import source from '../reference/full-client/unit-art.json';
import { nativeUnitStats } from '../src/game/native-units';
import { troopSoundFiles, TROOP_SOUNDS } from '../src/game/troop-sounds';
import { nativeProjectilePack } from '../src/game/native-projectile-poses';
import effects from '../reference/full-client/effect-art.json';

it('keeps Frostmite source scale, direction roots and animation graph intact', () => {
  const record = source.units.frostmite,
    bytes = fs.readFileSync('public/' + record.path),
    pack = JSON.parse(bytes.toString());
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(record.sha256);
  expect(record.clientName).toBe('Icemite');
  expect(record.levels).toBe(1);
  for (const name of ['walk', 'idle', 'attack']) {
    const state = pack.levels[0].states[name];
    expect(state.scale).toBe(1.3);
    expect(state.exports).toHaveLength(3);
    expect(state.exports.every((s: string) => s.startsWith('frostmite_lvl1_'))).toBe(true);
  }
  expect(pack.levels[0].states.attack.actionFrame).toBe(14);
});

it('uses original Frostmite jump/impact art and source single-use combat values', () => {
  expect(nativeProjectilePack('FrostmiteJump')).toContain('frostmitejump');
  expect(effects.effects['Frostmite Splat']).toBe('frostmite-splat');
  expect(nativeUnitStats('frostmite', 1)).toMatchObject({
    hp: 450,
    damage: 15,
    dps: 15,
    range: 2,
    rate: 1,
    speed: 3,
    jumper: true,
    attackCount: 1,
    splash: 0.8,
    frostTime: 4,
    frostPercent: 0.5,
    newTargetDelay: 0.5,
    triggersTraps: false,
    storageReduction: 0.5,
  });
});

it('ships its original deploy and jump-death samples with pinned hashes', () => {
  const files = troopSoundFiles('frostmite');
  expect(files).toHaveLength(2);
  for (const path of files) {
    const record = TROOP_SOUNDS[path];
    expect(
      createHash('sha256')
        .update(fs.readFileSync('public/' + record.path))
        .digest('hex'),
    ).toBe(record.sha256);
  }
});
