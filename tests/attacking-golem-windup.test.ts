import { expect, it } from 'vitest';
import { GameModel, makeBuilding } from '../src/game/model';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { replayBattle } from '../src/game/replay';
import { nativeTroopFacingTarget } from '../src/game/native-troop-facing';
import { spawnGarrisonDefender } from '../src/game/garrison-combat';
import { nativeUnitRow, nativeUnitStats } from '../src/game/native-units';
import { splitTiming } from '../src/game/garrison-kinds';
import {
  attackingGolemBattle,
  attackingGolemRecording,
  attackingGolemiteRecording,
} from './fixtures/attacking-golem';

for (let level = 1; level <= 15; level++)
  for (const child of [false, true])
    it(`${child ? 'Golemite' : 'Golem'} ${level} spends a full fresh windup and preserves its source period`, () => {
      const r = attackingGolemBattle(level, undefined, 11.4, child),
        kind = child ? 'golemite' : 'golem',
        stats = nativeUnitStats(kind, level),
        timing = splitTiming(nativeUnitRow(kind, level));
      expect(timing).toMatchObject({
        period: child ? 3 : 2.4,
        recovery: child ? 1.5 : 0.9,
        windup: 1.5,
        charge: 0,
        firstHit: 1.5,
      });
      while (!r.unit.attacking) r.step();
      const engaged = r.battle.elapsed,
        hp = r.battle.buildings.find((b) => b.id === 2)!.hp;
      expect(r.unit.native!.attacks ?? 0).toBe(0);
      r.untilAttacks(1);
      const first = r.battle.elapsed;
      expect(first - engaged + 0.05).toBeCloseTo(1.5, 8);
      expect(r.battle.buildings.find((b) => b.id === 2)!.hp).toBeCloseTo(hp - stats.damage, 8);
      r.untilAttacks(2);
      expect(r.battle.elapsed - first).toBeCloseTo(timing.period, 8);
    });

for (const child of [false, true]) {
  it(`${child ? 'Golemite' : 'Golem'} starts the fresh clock after a long approach`, () => {
    const r = attackingGolemBattle(1, undefined, 6.9, child);
    while (!r.unit.attacking) r.step();
    const engaged = r.battle.elapsed;
    r.untilAttacks(1);
    expect(r.battle.elapsed - engaged + 0.05).toBeCloseTo(1.5, 8);
  });
  it(`${child ? 'Golemite' : 'Golem'} Freeze holds windup and recovery`, () => {
    const r = attackingGolemBattle(1, undefined, 11.4, child);
    while (!r.unit.attacking) r.step();
    const engaged = r.battle.elapsed;
    r.unit.native!.effects = { frozenUntil: engaged + 1 };
    r.untilAttacks(1);
    expect(r.battle.elapsed - engaged + 0.05).toBeCloseTo(2.5, 8);
    const first = r.battle.elapsed;
    r.step();
    r.unit.native!.effects.frozenUntil = r.battle.elapsed + 1;
    r.untilAttacks(2);
    expect(r.battle.elapsed - first).toBeCloseTo((child ? 3 : 2.4) + 1, 8);
  });
  it(`${child ? 'Golemite' : 'Golem'} retargeting spends recovery exactly once`, () => {
    const r = attackingGolemBattle(1, undefined, 11.4, child);
    r.battle.buildings.push(makeBuilding(3, 'goldstorage', 13, 10, 18));
    r.untilAttacks(1);
    const first = r.battle.elapsed,
      target = r.battle.buildings.find((b) => b.id === 2)!;
    r.model.damage(target, target.hp);
    r.untilAttacks(2);
    expect(r.unit.target).toBe(3);
    expect(r.battle.elapsed - first).toBeCloseTo(child ? 3 : 2.4, 8);
  });
  it(`version 161 retains ${child ? 'Golemite' : 'Golem'}'s immediate first hit`, () => {
    const r = attackingGolemBattle(1, 161, 11.4, child);
    while (!r.unit.attacking) r.step();
    expect(r.unit.native!.attacks).toBe(1);
    expect(r.unit.native!.attackWindup).toBeUndefined();
  });
  for (const slowed of [false, true])
    it(`${child ? 'Golemite' : 'Golem'} scales both attack phases, slowed=${slowed}`, () => {
      const r = attackingGolemBattle(1, undefined, 11.4, child);
      r.unit.native!.effects = slowed
        ? { poison: { since: 0, until: 100, dps: 0, speed: 0, attackSpeed: -0.5 } }
        : { boost: { until: 100, damage: 0, speed: 0, attackSpeed: 1 } };
      while (!r.unit.attacking) r.step();
      const engaged = r.battle.elapsed,
        scale = slowed ? 2 : 0.5;
      r.untilAttacks(1);
      const first = r.battle.elapsed;
      expect(first - engaged + 0.05).toBeCloseTo(1.5 * scale, 8);
      r.untilAttacks(2);
      expect(r.battle.elapsed - first).toBeCloseTo((child ? 3 : 2.4) * scale, 8);
    });
}
it('a committed Golem building windup continues to ignore alerted defenders', () => {
  const r = attackingGolemBattle();
  while (!r.unit.attacking) r.step();
  const guard = spawnGarrisonDefender(r.battle, 'golem', 8, 1, 13, 11.5, 0);
  guard.alerted = true;
  guard.stunnedUntil = 100;
  r.untilAttacks(1);
  expect(r.unit.target).toBe(2);
  expect(r.unit.defenderTarget).toBeUndefined();
  expect(guard.hp).toBe(guard.maxHp);
});
it('only carried Golem armies allocate the shared family windup capability', () => {
  const s = structuredClone(attackingGolemBattle().data.initial);
  expect(replayBattle(s).nativeGolemWindup).toBe(true);
  expect(replayBattle(s, 161).nativeGolemWindup).toBeUndefined();
  s.army.golem = 0;
  expect(replayBattle(s).nativeGolemWindup).toBeUndefined();
});

it('a wall blocking defender pursuit receives a full Golem windup before damage', () => {
  const r = attackingGolemBattle();
  for (let y = 0; y < 48; y++) r.battle.buildings.push(makeBuilding(1000 + y, 'wall', 12, y, 1));
  const guard = spawnGarrisonDefender(r.battle, 'golem', 8, 1, 17.4, 11.5, 0);
  guard.alerted = true;
  guard.stunnedUntil = 100;
  while (!r.unit.attacking) r.step();
  const engaged = r.battle.elapsed,
    ref = r.unit.native!.attackWindup?.target;
  expect(ref?.building).toBe(true);
  const wall = r.battle.buildings.find((b) => b.id === ref!.id)!;
  expect(wall.kind).toBe('wall');
  expect(wall.hp).toBe(wall.maxHp);
  r.untilAttacks(1);
  expect(r.battle.elapsed - engaged + 0.05).toBeCloseTo(1.5, 8);
  expect(wall.hp).toBeCloseTo(wall.maxHp - nativeUnitStats('golem', 1).damage, 8);
});

for (const child of [false, true])
  for (const version of [161, 162])
    it(`actual ${child ? 'Monolith split' : 'Cannon fight'} inputs reproduce all version-${version} snapshots`, () => {
      const r = child ? attackingGolemiteRecording(version) : attackingGolemRecording(version),
        model = new GameModel();
      expect(model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(true);
      for (const snapshot of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
        model.seekReplay(snapshot.at);
        while (model.replay!.seeking) model.step(0.05);
        expect(JSON.parse(JSON.stringify(model.battle))).toEqual(snapshot.battle);
      }
    });

for (const version of [161, 162])
  it(`level-15 Golem actual long approach replays under version ${version}`, () => {
    const r = attackingGolemRecording(version, 6.9, 15),
      model = new GameModel();
    expect(model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(true);
    for (const snapshot of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
      model.seekReplay(snapshot.at);
      while (model.replay!.seeking) model.step(0.05);
      expect(JSON.parse(JSON.stringify(model.battle))).toEqual(snapshot.battle);
    }
  });

it('a Golemite from an actual Monolith defeat completes a full first windup', () => {
  const r = attackingGolemiteRecording();
  expect(r.first - r.engaged + 0.05).toBeCloseTo(1.5, 8);
  const born = r.snapshots.find((s) => s.at === r.born)!.battle;
  expect(born.units.find((u) => u.id === r.parentId)!.hp).toBeLessThanOrEqual(0);
  expect(born.units.find((u) => u.id === r.parentId)!.defeatedAt).toBeDefined();
  expect(born.units.filter((u) => u.kind === 'golemite')).toHaveLength(2);
});

it('a newly available preferred defense interrupts a Golem defender windup', () => {
  const r = attackingGolemBattle();
  const guard = spawnGarrisonDefender(r.battle, 'golem', 8, 1, 12.2, 11.5, 0);
  guard.alerted = true;
  guard.stunnedUntil = 100;
  r.until(0.2);
  expect(r.unit.native!.attackWindup!.target).toEqual({ id: guard.id, building: false });
  r.battle.buildings.push(makeBuilding(3, 'cannon', 13, 10, 1));
  r.untilAttacks(1);
  expect(r.unit.target).toBe(3);
  expect(r.unit.defenderTarget).toBeUndefined();
  expect(guard.hp).toBe(guard.maxHp);
});

it('a pursued defender entering melee range interrupts the blocking-wall windup', () => {
  const r = attackingGolemBattle();
  for (let y = 0; y < 48; y++) r.battle.buildings.push(makeBuilding(1000 + y, 'wall', 12, y, 1));
  const guard = spawnGarrisonDefender(r.battle, 'golem', 8, 1, 17.4, 11.5, 0);
  guard.alerted = true;
  guard.stunnedUntil = 100;
  while (!r.unit.attacking) r.step();
  const wall = r.battle.buildings.find((b) => b.id === r.unit.native!.attackWindup!.target!.id)!;
  guard.y = 14;
  r.step();
  expect(nativeTroopFacingTarget(r.battle, r.unit)).toEqual({ x: wall.x + 0.5, y: wall.y + 0.5 });
  guard.x = r.unit.x + 0.1;
  guard.y = r.unit.y;
  r.step();
  const engaged = r.battle.elapsed;
  expect(r.unit.native!.attackWindup!.target).toEqual({ id: guard.id, building: false });
  r.untilAttacks(1);
  expect(r.battle.elapsed - engaged + 0.05).toBeCloseTo(1.5, 8);
  expect(wall.hp).toBe(wall.maxHp);
  expect(guard.hp).toBeCloseTo(guard.maxHp - nativeUnitStats('golem', 1).damage, 8);
});
