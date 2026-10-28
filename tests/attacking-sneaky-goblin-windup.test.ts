import { expect, it } from 'vitest';
import { GameModel, makeBuilding } from '../src/game/model';
import { nativeUnitStats } from '../src/game/native-units';
import { spawnGarrisonDefender } from '../src/game/garrison-combat';
import { replayBattle } from '../src/game/replay';
import { unitInvisible } from '../src/game/native-status';
import { nativeTargetingSpellRecording } from './fixtures/native-targeting-spells';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { nativeDirectBattle } from './fixtures/native-direct-attacks';
import {
  sneakyGoblinRecording,
  frozenCannonSneakyGoblinRecording,
} from './fixtures/attacking-sneaky-goblin';

for (let level = 1; level <= 6; level++)
  for (const x of [11.4, 6.9])
    it(`Sneaky Goblin ${level} charges after approaching from ${x} and resolves a direct swing`, () => {
      const r = nativeDirectBattle('sneakygoblin', level, 196, x),
        target = r.battle.buildings.find((b) => b.id === 2)!,
        damage = nativeUnitStats('sneakygoblin', level).damage * 2;
      while (!r.unit.attacking) r.step();
      const engaged = r.battle.elapsed;
      expect(target.hp).toBe(target.maxHp);
      r.untilAttacks(1);
      const first = r.battle.elapsed;
      expect(first - engaged + 0.05).toBeCloseTo(1, 8);
      expect(target.hp).toBe(target.maxHp - damage);
      expect(r.battle.projectiles?.some((p) => p.sourceId === r.unit.id) ?? false).toBe(false);
      r.untilAttacks(2);
      expect(r.unit.native!.lastAttackAt! - first).toBeCloseTo(1, 8);
      expect(target.hp).toBe(target.maxHp - 2 * damage);
    });

it('a direct swing hits a ground defender once and ignores the air layer', () => {
  const r = nativeDirectBattle('sneakygoblin', 1, 196),
    ground = spawnGarrisonDefender(r.battle, 'golem', 8, 1, 12, 11.5, 0),
    air = spawnGarrisonDefender(r.battle, 'dragon', 7, 1, 12, 11.5, 0);
  // Resource preference ends before the ordinary defender fight starts.
  r.battle.buildings[0].kind = 'barracks';
  r.model.damage(
    r.battle.buildings.find((b) => b.id === 2)!,
    100000,
  );
  for (const d of [ground, air]) {
    d.alerted = true;
    d.stunnedUntil = 100;
  }
  while (!r.unit.attacking) r.step();
  const engaged = r.battle.elapsed;
  r.untilAttacks(1);
  expect(r.battle.elapsed - engaged + 0.05).toBeCloseTo(1, 8);
  expect(ground.hp).toBe(ground.maxHp - 120);
  expect(air.hp).toBe(air.maxHp);
});

it('Freeze and stun hold the fresh charge and repeat clock', () => {
  const r = nativeDirectBattle('sneakygoblin', 1, 196);
  r.unit.x = 12.7;
  r.until(0.3);
  const before = structuredClone(r.unit.native!.attackWindup);
  (r.unit.native!.effects ??= {}).frozenUntil = 1.3;
  r.until(1);
  expect(r.unit.native!.attackWindup).toEqual(before);
  r.untilAttacks(1);
  expect(r.battle.elapsed).toBeCloseTo(2, 8);
  const first = r.battle.elapsed;
  r.step();
  r.unit.native!.effects!.stunUntil = r.battle.elapsed + 1;
  r.untilAttacks(2);
  expect(r.battle.elapsed - first).toBeCloseTo(2, 8);
});
for (const slowed of [false, true])
  it(`action modifiers scale both phases, slowed=${slowed}`, () => {
    const r = nativeDirectBattle('sneakygoblin', 1, 196);
    r.unit.x = 12.7;
    (r.unit.native ??= {}).effects = slowed
      ? { poison: { since: 0, until: 100, dps: 0, speed: 0, attackSpeed: -0.5 } }
      : { boost: { until: 100, damage: 0, speed: 0, attackSpeed: 1 } };
    r.untilAttacks(1);
    const first = r.battle.elapsed,
      period = slowed ? 2 : 0.5;
    expect(first - period).toBeGreaterThanOrEqual(-1e-8);
    expect(first - period).toBeLessThan(0.05 + 1e-8);
    r.untilAttacks(5);
    expect(Math.abs(r.unit.native!.lastAttackAt! - first - 4 * period)).toBeLessThan(0.05 + 1e-8);
  });
it('retains sub-step remainder through successive melee releases', () => {
  const r = nativeDirectBattle('sneakygoblin', 1, 196),
    releases: number[] = [];
  r.step();
  for (let n = 1; n <= 8; n++) {
    while ((r.unit.native!.attacks ?? 0) < n) r.model.step(0.08);
    releases.push(r.unit.native!.lastAttackAt!);
  }
  expect(Math.abs(releases[7] - releases[0] - 7 * 1)).toBeLessThan(0.08 + 1e-8);
});
it('a replacement target starts a fresh charge', () => {
  const r = nativeDirectBattle('sneakygoblin', 1, 196),
    target = r.battle.buildings.find((b) => b.id === 2)!;
  r.unit.x = 12.7;
  r.battle.buildings.push(makeBuilding(3, 'goldstorage', 13, 10, 18));
  r.until(0.4);
  r.model.damage(target, target.hp);
  r.step();
  const changed = r.battle.elapsed;
  r.untilAttacks(1);
  expect(r.battle.elapsed - changed + 0.05).toBeCloseTo(1, 8);
  expect(r.unit.target).toBe(3);
});
it('opens a blocking Wall before continuing its ground route', () => {
  const r = nativeDirectBattle('sneakygoblin', 1, 196, 6.9);
  r.battle.buildings.find((b) => b.id === 2)!.x = 22;
  const walls = Array.from({ length: 48 }, (_, y) => makeBuilding(1000 + y, 'wall', 12, y, 18));
  r.battle.buildings.push(...walls);
  r.untilAttacks(1);
  const wall = walls.find((w) => w.id === r.unit.native!.attackWindup!.target!.id)!;
  expect(wall).toBeDefined();
  expect(r.unit.x).toBeLessThan(12);
  expect(wall.hp).toBe(wall.maxHp - 120);
});

for (const version of [195, 196])
  for (const level of [1, 6])
    it(`tier ${level} actual Storage fight preserves version ${version}`, () => {
      const r = sneakyGoblinRecording(version, level),
        viewer = new GameModel();
      const expired = r.snapshots.find((s) => s.at === r.expired)!.battle,
        u = expired.units.find((u) => u.id === r.id)!;
      expect(r.invisibleUntil - r.born).toBeCloseTo(5.05, 8);
      expect(unitInvisible(u, expired.elapsed)).toBe(false);
      expect(u.hp).toBe(u.maxHp);
      expect(u.native!.attacks).toBeGreaterThanOrEqual(2);
      expect(viewer.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(true);
      for (const s of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
        viewer.seekReplay(s.at);
        while (viewer.replay!.seeking) viewer.step(0.05);
        expect(JSON.parse(JSON.stringify(viewer.battle))).toEqual(s.battle);
      }
    });
it('only a carried Sneaky Goblin enables version 196', () => {
  const r = nativeDirectBattle('sneakygoblin', 1, 196);
  expect(replayBattle(r.data.initial, 195).nativeSneakyGoblinWindup).toBeUndefined();
  expect(replayBattle(r.data.initial, 196).nativeSneakyGoblinWindup).toBe(true);
  r.data.initial.army.sneakygoblin = 0;
  expect(replayBattle(r.data.initial, 196).nativeSneakyGoblinWindup).toBeUndefined();
});

for (const kind of [
  'townhall',
  'clancastle',
  'goldmine',
  'collector',
  'goldstorage',
  'elixirstorage',
  'darkdrill',
  'darkstorage',
  'cannon',
  'builder',
  'barracks',
] as const)
  it(`keeps the resource multiplier specific to ${kind}`, () => {
    const r = nativeDirectBattle('sneakygoblin', 1, 196),
      target = makeBuilding(2, kind, 13, 10, 4),
      resource = !['cannon', 'builder', 'barracks'].includes(kind);
    r.battle.buildings[0].kind = 'barracks';
    r.battle.buildings[1] = target;
    r.battle.buildingEffects = { [target.id]: { frozenUntil: 100 } };
    r.unit.x = 12.7;
    expect(target.maxHp).toBeGreaterThan(resource ? 240 : 120);
    r.untilAttacks(1);
    expect(target.hp).toBe(target.maxHp - (resource ? 240 : 120));
    expect(r.unit.target).toBe(target.id);
  });

it('ignores a nearby defender until resources fall, then starts a fresh single-damage charge', () => {
  const r = nativeDirectBattle('sneakygoblin', 1, 196),
    ground = spawnGarrisonDefender(r.battle, 'golem', 8, 1, 12, 11.5, 0),
    storage = r.battle.buildings.find((b) => b.id === 2)!;
  ground.alerted = true;
  ground.stunnedUntil = 100;
  r.untilAttacks(1);
  expect(r.unit.native!.attackWindup!.target).toEqual({ id: 2, building: true });
  expect(storage.hp).toBe(storage.maxHp - 240);
  expect(ground.hp).toBe(ground.maxHp);
  r.battle.buildings[0].kind = 'barracks';
  r.model.damage(storage, storage.hp);
  while (r.unit.defenderTarget !== ground.id || !r.unit.attacking) r.step();
  const engaged = r.battle.elapsed;
  r.untilAttacks(2);
  expect(r.battle.elapsed - engaged + 0.05).toBeCloseTo(1, 8);
  expect(ground.hp).toBe(ground.maxHp - 120);
});
for (const kind of ['bomb', 'airbomb', 'seekingairmine'] as const)
  it(`retains ${kind} trigger eligibility during charge`, () => {
    const r = nativeDirectBattle('sneakygoblin', 1, 196),
      trap = makeBuilding(3, kind, 11, 11, 1);
    r.battle.buildings.push(trap);
    r.step();
    expect(r.unit.native?.attacks ?? 0).toBe(0);
    expect(r.battle.traps[trap.id] !== undefined).toBe(kind === 'bomb');
  });
for (const version of [195, 196])
  for (const level of [1, 6])
    it(`actual Overgrowth and Freeze allow normal Cannon damage at tier ${level} under version ${version}`, () => {
      const r = frozenCannonSneakyGoblinRecording(level, version),
        viewer = new GameModel(),
        born = r.snapshots[0].battle,
        first = r.snapshots.find((s) => s.at === r.first)!.battle,
        second = r.snapshots.find((s) => s.at === r.second)!.battle,
        target = first.buildings.find((b) => b.id === 2)!;
      expect(born.buildingEffects![1].overgrownUntil).toBeGreaterThan(r.expired);
      expect(born.buildingEffects![2].frozenUntil).toBeGreaterThan(r.expired);
      expect(born.nativeOvergrowthCasts!.some((c) => c.name === 'Overgrowth')).toBe(true);
      expect(born.nativeFreezeCasts!.some((c) => c.name === 'Freeze')).toBe(true);
      expect(target.maxHp - target.hp).toBe(nativeUnitStats('sneakygoblin', level).damage);
      expect(second.buildings.find((b) => b.id === 2)!.hp).toBe(
        target.maxHp - 2 * nativeUnitStats('sneakygoblin', level).damage,
      );
      const expired = r.snapshots.find((s) => s.at === r.expired)!.battle,
        u = expired.units.find((u) => u.id === r.id)!;
      expect(r.invisibleUntil - r.born).toBeCloseTo(5.05, 8);
      expect(unitInvisible(u, expired.elapsed)).toBe(false);
      expect(u.hp).toBe(u.maxHp);
      expect(u.native!.attacks).toBeGreaterThanOrEqual(2);
      expect(viewer.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(true);
      for (const s of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
        viewer.seekReplay(s.at);
        while (viewer.replay!.seeking) viewer.step(0.05);
        expect(JSON.parse(JSON.stringify(viewer.battle))).toEqual(s.battle);
      }
    });
for (const version of [195, 196])
  for (const level of [1, 4])
    it(`actual Angry Spell ${level} retargets the Sneaky Goblin under version ${version}`, () => {
      const r = nativeTargetingSpellRecording('AngrySpell', level, version, 'sneakygoblin'),
        viewer = new GameModel(),
        at = (t: number) =>
          r.snapshots.find((s) => s.at === t)!.battle as import('../src/game/model').Battle,
        pending = at(r.pending).units.find((u) => u.id === r.unitId)!,
        after = at(r.impact),
        u = after.units.find((u) => u.id === r.unitId)!,
        mine = after.buildings.find((b) => b.id === 2)!;
      if (version >= 196) {
        expect(pending.native!.attackWindup).toMatchObject({
          engaged: true,
          target: { id: 2, building: true },
        });
        expect(pending.native!.attackWindup!.remaining).toBeGreaterThan(0);
        expect(u.native!.attackWindup!.engaged).toBeUndefined();
        expect(u.native!.attackWindup!.target).toBeUndefined();
        expect(u.native!.attacks ?? 0).toBe(0);
        expect(mine.hp).toBe(mine.maxHp);
      } else expect(mine.maxHp - mine.hp).toBe(240);
      expect(u.target).toBe(3);
      expect(viewer.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(true);
      for (const s of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
        viewer.seekReplay(s.at);
        while (viewer.replay!.seeking) viewer.step(0.05);
        expect(JSON.parse(JSON.stringify(viewer.battle))).toEqual(s.battle);
      }
    });

for (let level = 1; level <= 6; level++)
  it(`tier ${level} invisibility expires independently while Freeze holds a positive charge`, () => {
    const r = nativeDirectBattle('sneakygoblin', level, 196),
      target = r.battle.buildings.find((b) => b.id === 2)!;
    r.unit.x = 12.7;
    r.until(0.2);
    const before = structuredClone(r.unit.native!.attackWindup),
      until = r.unit.native!.effects!.invisibleUntil!,
      damage = nativeUnitStats('sneakygoblin', level).damage * 2;
    expect(until).toBeCloseTo(5.05, 8);
    expect(unitInvisible(r.unit, r.battle.elapsed)).toBe(true);
    expect(before).toMatchObject({ engaged: true });
    expect(before!.remaining).toBeGreaterThan(0);
    r.unit.native!.effects!.frozenUntil = until + 0.1;
    r.until(until + 0.05);
    expect(r.unit.native!.attackWindup).toEqual(before);
    expect(r.unit.native!.attacks ?? 0).toBe(0);
    expect(unitInvisible(r.unit, r.battle.elapsed)).toBe(false);
    r.untilAttacks(1);
    const first = r.battle.elapsed;
    expect(target.hp).toBe(target.maxHp - damage);
    r.untilAttacks(2);
    expect(r.battle.elapsed - first).toBeCloseTo(1, 8);
    expect(target.hp).toBe(target.maxHp - 2 * damage);
    expect(r.unit.hp).toBe(r.unit.maxHp);
  });
