import { expect, it } from 'vitest';
import { GameModel, makeBuilding } from '../src/game/model';
import { nativeUnitStats } from '../src/game/native-units';
import { HOG_ATTACK_KINDS, hogPuppetLevel } from '../src/game/native-hog-attacks';
import { nativeTroopFacingTarget } from '../src/game/native-troop-facing';
import { spawnGarrisonDefender } from '../src/game/garrison-combat';
import { replayBattle } from '../src/game/replay';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import {
  attackingHogBattle,
  attackingHogRecording,
  attackingHogHalvesRecording,
  hogPuppetRecording,
} from './fixtures/attacking-hog';

for (const kind of HOG_ATTACK_KINDS) {
  const ceiling = kind === 'hogrider' ? 15 : 12;
  for (let level = 1; level <= ceiling; level++)
    it(`${kind} ${level} winds up for one second and repeats at its source period`, () => {
      const r = attackingHogBattle(kind, level),
        target = r.battle.buildings.find((b) => b.id === 2)!,
        hp = target.hp;
      while (!r.unit.attacking) r.step();
      const engaged = r.battle.elapsed;
      expect(target.hp).toBe(hp);
      r.untilAttacks(1);
      const first = r.battle.elapsed;
      expect(first - engaged + 0.05).toBeCloseTo(1, 8);
      expect(target.hp).toBeCloseTo(hp - nativeUnitStats(kind, level).damage, 8);
      r.untilAttacks(2);
      expect(r.battle.elapsed - first).toBeCloseTo(1, 8);
    });

  it(`${kind} starts a fresh clock after a distant approach`, () => {
    const r = attackingHogBattle(kind, 1, undefined, 6.9);
    while (!r.unit.attacking) r.step();
    const engaged = r.battle.elapsed;
    r.untilAttacks(1);
    expect(r.battle.elapsed - engaged + 0.05).toBeCloseTo(1, 8);
  });
  it(`${kind} Freeze and stun hold both attack cycles`, () => {
    const r = attackingHogBattle(kind);
    while (!r.unit.attacking) r.step();
    const engaged = r.battle.elapsed;
    (r.unit.native!.effects ??= {}).frozenUntil = engaged + 1;
    r.untilAttacks(1);
    expect(r.battle.elapsed - engaged + 0.05).toBeCloseTo(2, 8);
    const first = r.battle.elapsed;
    r.step();
    r.unit.native!.effects!.stunUntil = r.battle.elapsed + 1;
    r.untilAttacks(2);
    expect(r.battle.elapsed - first).toBeCloseTo(2, 8);
  });
  for (const slowed of [false, true])
    it(`${kind} scales action time, slowed=${slowed}`, () => {
      const r = attackingHogBattle(kind),
        until = r.battle.elapsed + 100;
      r.unit.native!.effects = slowed
        ? { poison: { since: 0, until, dps: 0, speed: 0, attackSpeed: -0.5 } }
        : { boost: { until, damage: 0, speed: 0, attackSpeed: 1 } };
      while (!r.unit.attacking) r.step();
      const engaged = r.battle.elapsed;
      r.untilAttacks(1);
      const first = r.battle.elapsed;
      expect(first - engaged + 0.05).toBeCloseTo(slowed ? 2 : 0.5, 8);
      r.untilAttacks(2);
      expect(r.battle.elapsed - first).toBeCloseTo(slowed ? 2 : 0.5, 8);
    });
  it(`${kind} starts a fresh windup when its target is destroyed`, () => {
    const r = attackingHogBattle(kind);
    r.battle.buildings.push(makeBuilding(3, 'goldstorage', 13, 10, 18));
    r.untilAttacks(1);
    const first = r.battle.elapsed,
      target = r.battle.buildings.find((b) => b.id === 2)!;
    r.model.damage(target, target.hp);
    r.untilAttacks(2);
    expect(r.unit.target).toBe(3);
    expect(r.battle.elapsed - first).toBeCloseTo(1, 8);
  });
  it(`${kind} retains defense preference and ground-only retaliation`, () => {
    const r = attackingHogBattle(kind),
      cannon = makeBuilding(3, 'cannon', 13, 10, 21);
    r.battle.buildings.push(cannon);
    cannon.cooldown = 100;
    const guard = spawnGarrisonDefender(r.battle, 'golem', 8, 1, 11.8, 11.5, 0),
      air = spawnGarrisonDefender(r.battle, 'dragon', 7, 1, 11.4, 11.6, 0);
    for (const d of [guard, air]) {
      d.alerted = true;
      d.stunnedUntil = 100;
    }
    const hp = cannon.hp;
    r.untilAttacks(1);
    if (kind === 'superrider')
      expect(guard.hp).toBeCloseTo(guard.maxHp - nativeUnitStats(kind, 1).damage, 8);
    else {
      expect(cannon.hp).toBeCloseTo(hp - nativeUnitStats(kind, 1).damage, 8);
      expect(guard.hp).toBe(guard.maxHp);
      r.model.damage(cannon, cannon.hp);
      r.untilAttacks(2);
      expect(guard.hp).toBeCloseTo(guard.maxHp - nativeUnitStats(kind, 1).damage, 8);
    }
    expect(air.hp).toBe(air.maxHp);
    expect(r.battle.projectiles!.filter((p) => p.sourceId === r.unit.id)).toHaveLength(0);
  });
  it(`${kind} retains its source wall traversal and wall damage`, () => {
    const r = attackingHogBattle(kind);
    const walls = Array.from({ length: 48 }, (_, y) => makeBuilding(2000 + y, 'wall', 12, y, 15));
    r.battle.buildings.push(...walls);
    if (kind !== 'superrider') {
      while (r.unit.x < 12.2) r.step();
      expect(walls.every((w) => w.hp === w.maxHp)).toBe(true);
    } else {
      while (!r.unit.attacking) r.step();
      const engaged = r.battle.elapsed,
        wall = walls.find((w) => w.id === r.unit.native!.attackWindup!.target!.id)!;
      expect(wall).toBeDefined();
      expect(nativeTroopFacingTarget(r.battle, r.unit)).toEqual({
        x: wall.x + 0.5,
        y: wall.y + 0.5,
      });
      r.untilAttacks(1);
      expect(r.battle.elapsed - engaged + 0.05).toBeCloseTo(1, 8);
      expect(wall.hp).toBeCloseTo(wall.maxHp - 2 * nativeUnitStats(kind, 1).damage, 8);
    }
  });
}

function expectPortable(r: {
  data: Parameters<typeof makeReplayFile>[0];
  snapshots: { at: number; battle: unknown }[];
}) {
  const model = new GameModel();
  expect(model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(true);
  for (const s of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
    model.seekReplay(s.at);
    while (model.replay!.seeking) model.step(0.05);
    expect(JSON.parse(JSON.stringify(model.battle))).toEqual(s.battle);
  }
}
for (const version of [176, 177]) {
  for (const kind of ['hogrider', 'superhogrider'] as const)
    for (const level of [1, kind === 'hogrider' ? 15 : 12])
      it(`${kind} ${level} Cannon fight replays version ${version}`, () => {
        expectPortable(attackingHogRecording(kind, level, version));
      });
  for (const level of [1, 12])
    it(`both level-${level} split bodies replay their first independent version-${version} hit`, () => {
      expectPortable(attackingHogHalvesRecording(level, version));
    });
  for (const item of [1, 18])
    it(`Puppet ${item} fixed-level waves replay without a Hog army at version ${version}`, () => {
      const r = hogPuppetRecording(item, version),
        expectedLevel = item === 1 ? 5 : 12;
      expect(r.level).toBe(expectedLevel);
      expect(r.data.initial.army.hogrider).toBe(0);
      expect(r.spawns).toHaveLength(item === 1 ? 8 : 10);
      expect(r.spawns.every((s) => s.level === expectedLevel)).toBe(true);
      expect(r.spawns.map((s) => s.at)).toEqual(
        item === 1
          ? [0, 0, 0, 0.25, 0.25, 0.25, 0.5, 0.5]
          : [0, 0, 0, 0.25, 0.25, 0.25, 0.5, 0.5, 0.5, 0.75],
      );
      if (version >= 177) {
        expect(r.first - r.engaged + 0.05).toBeCloseTo(1, 8);
        expect(r.second - r.first).toBeCloseTo(1, 8);
      }
      expectPortable(r);
    });
}

for (let level = 1; level <= 18; level++)
  it(`Puppet item ${level} resolves its source summon tier`, () => {
    expect(
      hogPuppetLevel([
        { kind: 'champion', level: 1, items: [{ slug: 'hog-rider-puppet', level }] },
      ]),
    ).toBe([5, 5, 6, 6, 6, 7, 7, 7, 8, 8, 8, 9, 9, 9, 10, 10, 10, 12][level - 1]);
  });

it('only carried Hog family armies or an equipped Champion Puppet enable the clock', () => {
  const s = structuredClone(attackingHogBattle().data.initial);
  expect(replayBattle(s).nativeHogWindup).toBe(true);
  expect(replayBattle(s, 176).nativeHogWindup).toBeUndefined();
  s.army.hogrider = 0;
  expect(replayBattle(s).nativeHogWindup).toBeUndefined();
  s.army.superhogrider = 1;
  expect(replayBattle(s).nativeHogWindup).toBe(true);
  s.army.superhogrider = 0;
  s.heroes = [{ kind: 'champion', level: 1, items: [{ slug: 'hog-rider-puppet', level: 1 }] }];
  expect(replayBattle(s).nativeHogWindup).toBe(true);
  expect(replayBattle(s, 176).nativeHogWindup).toBeUndefined();
  s.heroes[0].items = [];
  expect(replayBattle(s).nativeHogWindup).toBeUndefined();
});
