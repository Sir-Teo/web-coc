import { expect, it } from 'vitest';
import { GameModel, makeBuilding } from '../src/game/model';
import { spawnGarrisonDefender } from '../src/game/garrison-combat';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { replayBattle } from '../src/game/replay';
import { nativeDirectBattle, nativeDirectRecording } from './fixtures/native-direct-attacks';

const damage = [475, 525, 575, 600];
for (let level = 1; level <= 4; level++)
  for (const x of [11.4, 1.2])
    it(`Thrower ${level} honors its 1.25 s override phases after approaching from ${x}`, () => {
      const r = nativeDirectBattle('thrower', level, undefined, x),
        target = r.battle.buildings.find((b) => b.id === 2)!;
      while (!r.unit.attacking) r.step();
      const engaged = r.battle.elapsed,
        hp = target.hp;
      expect(r.unit.native!.attacks ?? 0).toBe(0);
      r.untilAttacks(1);
      const first = r.battle.elapsed,
        shot = r.battle.projectiles!.find((p) => p.sourceId === r.unit.id)!;
      expect(first - engaged + 0.05).toBeCloseTo(1.25, 8);
      expect(r.unit.native!.attackWindup!.recovery).toBeCloseTo(1.25, 8);
      expect(shot.native).toMatchObject({
        name: `ThrowerProjectile${level}`,
        kind: 'thrower',
        level,
      });
      expect(shot.damage).toBe(damage[level - 1]);
      expect(shot.impact - shot.launched).toBeCloseTo(
        Math.hypot(shot.x - shot.fromX, shot.y - shot.fromY) / 7,
        8,
      );
      expect(target.hp).toBe(hp);
      r.until(shot.impact);
      expect(target.hp).toBeCloseTo(hp - damage[level - 1], 8);
      r.untilAttacks(2);
      expect(r.battle.elapsed - first).toBeCloseTo(2.5, 8);
    });

for (const air of [false, true])
  it(`retains native single-target damage on the ${air ? 'air' : 'ground'} defender layer`, () => {
    const r = nativeDirectBattle('thrower'),
      kind = air ? 'dragon' : 'golem',
      tier = air ? 7 : 8,
      guard = spawnGarrisonDefender(r.battle, kind, tier, 1, 12, 11.5, 0),
      neighbor = spawnGarrisonDefender(r.battle, kind, tier, 1, 12.2, 11.5, 0);
    for (const d of [guard, neighbor]) {
      d.alerted = true;
      d.stunnedUntil = 100;
    }
    while (!r.unit.attacking) r.step();
    const engaged = r.battle.elapsed;
    r.untilAttacks(1);
    const shot = r.battle.projectiles!.find((p) => p.sourceId === r.unit.id)!;
    expect(r.battle.elapsed - engaged + 0.05).toBeCloseTo(1.25, 8);
    expect(shot).toMatchObject({
      weapon: 'native',
      targetDefender: true,
      toAir: air,
      targetId: guard.id,
    });
    expect(guard.hp).toBe(guard.maxHp);
    r.until(shot.impact);
    expect(guard.hp).toBe(guard.maxHp - 475);
    expect(neighbor.hp).toBe(neighbor.maxHp);
  });

it('Freeze holds both the initial charge and post-release recovery', () => {
  const r = nativeDirectBattle('thrower');
  while (!r.unit.attacking) r.step();
  const engaged = r.battle.elapsed;
  r.unit.native!.effects = { frozenUntil: engaged + 1 };
  r.untilAttacks(1);
  expect(r.battle.elapsed - engaged + 0.05).toBeCloseTo(2.25, 8);
  const first = r.battle.elapsed;
  r.step();
  r.unit.native!.effects.frozenUntil = r.battle.elapsed + 0.5;
  r.untilAttacks(2);
  expect(r.battle.elapsed - first).toBeCloseTo(3, 8);
});

for (const slowed of [false, true])
  it(`scales both source phases and carries the sub-step remainder, slowed=${slowed}`, () => {
    const r = nativeDirectBattle('thrower');
    r.unit.native!.effects = slowed
      ? { poison: { since: 0, until: 100, dps: 0, speed: 0, attackSpeed: -0.5 } }
      : { boost: { until: 100, damage: 0, speed: 0, attackSpeed: 1 } };
    while (!r.unit.attacking) r.step();
    const engaged = r.battle.elapsed,
      scale = slowed ? 2 : 0.5;
    r.untilAttacks(1);
    const first = r.battle.elapsed;
    expect(first - engaged + 0.05).toBeCloseTo(0.05 * Math.ceil((1.25 * scale) / 0.05 - 1e-9), 8);
    r.untilAttacks(2);
    expect(r.battle.elapsed - first).toBeCloseTo(2.5 * scale, 8);
  });

it('spends the remaining recovery once when an adjacent replacement is selected', () => {
  const r = nativeDirectBattle('thrower');
  r.battle.buildings.push(makeBuilding(3, 'goldstorage', 13, 10, 18));
  r.untilAttacks(1);
  const first = r.battle.elapsed;
  r.until(first + 0.2);
  const target = r.battle.buildings.find((b) => b.id === 2)!;
  r.model.damage(target, target.hp);
  r.untilAttacks(2);
  expect(r.unit.target).toBe(3);
  expect(r.battle.elapsed - first).toBeCloseTo(2.5, 8);
});

it('charges blocking Walls while routing to a structure beyond throwing range', () => {
  const r = nativeDirectBattle('thrower', 1, undefined, 6.9);
  r.battle.buildings.find((b) => b.id === 2)!.x = 22;
  const walls = Array.from({ length: 48 }, (_, y) => makeBuilding(1000 + y, 'wall', 12, y, 15));
  r.battle.buildings.push(...walls);
  while (!r.unit.attacking) r.step();
  const engaged = r.battle.elapsed,
    wall = r.battle.buildings.find((b) => b.id === r.unit.native!.attackWindup!.target!.id)!;
  expect(wall.kind).toBe('wall');
  r.untilAttacks(1);
  expect(r.battle.elapsed - engaged + 0.05).toBeCloseTo(1.25, 8);
  const shot = r.battle.projectiles!.find((p) => p.sourceId === r.unit.id)!;
  r.until(shot.impact);
  expect(wall.hp).toBe(wall.maxHp - 475);
  expect(walls.filter((w) => w.id !== wall.id).every((w) => w.hp === w.maxHp)).toBe(true);
});

it('lets a released native projectile land after the shooter leaves the field', () => {
  const r = nativeDirectBattle('thrower'),
    target = r.battle.buildings.find((b) => b.id === 2)!;
  r.untilAttacks(1);
  const shot = r.battle.projectiles!.find((p) => p.sourceId === r.unit.id)!;
  r.battle.units = r.battle.units.filter((u) => u.id !== r.unit.id);
  r.until(shot.impact);
  expect(target.hp).toBe(target.maxHp - 475);
});

for (const version of [182, 183])
  for (const level of [1, 4])
    for (const guard of [false, true, 'air'] as const)
      it(`level ${level} ${guard || 'Cannon'} reconstructs complete version ${version} portable state`, () => {
        const r = nativeDirectRecording('thrower', 183, version, level, guard),
          viewer = new GameModel();
        expect(viewer.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(
          true,
        );
        for (const s of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
          viewer.seekReplay(s.at);
          while (viewer.replay!.seeking) viewer.step(0.05);
          expect(JSON.parse(JSON.stringify(viewer.battle))).toEqual(s.battle);
        }
      });

it('only carried Throwers enable the new override clock', () => {
  const s = structuredClone(nativeDirectBattle('thrower').data.initial);
  expect(replayBattle(s).nativeThrowerWindup).toBe(true);
  expect(replayBattle(s, 182).nativeThrowerWindup).toBeUndefined();
  s.army.thrower = 0;
  expect(replayBattle(s).nativeThrowerWindup).toBeUndefined();
});
