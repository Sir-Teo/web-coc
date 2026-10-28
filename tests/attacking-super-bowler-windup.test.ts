import { expect, it } from 'vitest';
import { nativeUnitStats } from '../src/game/native-units';
import { replayBattle } from '../src/game/replay';
import { spawnGarrisonDefender } from '../src/game/garrison-combat';
import { nativeDirectBattle } from './fixtures/native-direct-attacks';
import { GameModel, makeBuilding } from '../src/game/model';
import { hurtUnit } from '../src/game/native-status';
import { emptyArmy } from '../src/game/army';
import { applyShrink } from '../src/game/shrink-trap';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { superBowlerRecording } from './fixtures/attacking-super-bowler';
import { nativeTargetingSpellRecording } from './fixtures/native-targeting-spells';

for (let level = 1; level <= 10; level++)
  for (const x of [11.4, 6.9])
    it(`Super Bowler ${level} spends a fresh 0.4-second charge after approaching from ${x}`, () => {
      const r = nativeDirectBattle('superbowler', level, 201, x),
        target = r.battle.buildings.find((b) => b.id === 2)!,
        damage = nativeUnitStats('superbowler', level).damage;
      while (!r.unit.attacking) r.step();
      const engaged = r.battle.elapsed;
      expect(target.hp).toBe(target.maxHp);
      r.untilAttacks(1);
      const first = r.battle.elapsed,
        shot = r.battle.projectiles!.find((p) => p.sourceId === r.unit.id && !p.native?.bounce)!;
      expect(first - engaged + 0.05).toBeCloseTo(0.4, 8);
      expect(shot).toMatchObject({
        weapon: 'native',
        damage,
        splash: 0.6,
        native: { kind: 'superbowler', level, name: 'SuperBowlerProjectile' },
      });
      expect(shot.impact - first).toBeCloseTo(
        Math.max(0.12, Math.hypot(shot.x - shot.fromX, shot.y - shot.fromY) / 4.75),
        8,
      );
      expect(r.unit.native!.attackWindup!.recovery).toBeCloseTo(0.7, 8);
      expect(r.unit.native!.attackWindup!.audio).toBeUndefined();
      expect(target.hp).toBe(target.maxHp);
      r.until(shot.impact);
      expect(target.hp).toBe(target.maxHp - damage);
      r.untilAttacks(2);
      expect(r.unit.native!.lastAttackAt! - first).toBeCloseTo(2.2, 8);
    });

it('the native ground-defender projectile hits its primary and nearby ground defender once', () => {
  const r = nativeDirectBattle('superbowler', 1, 201),
    primary = spawnGarrisonDefender(r.battle, 'golem', 8, 1, 12, 11.5, 0),
    neighbor = spawnGarrisonDefender(r.battle, 'golem', 8, 1, 12.5, 11.5, 0),
    air = spawnGarrisonDefender(r.battle, 'dragon', 7, 1, 12.5, 11.5, 0);
  for (const d of [primary, neighbor, air]) {
    d.alerted = true;
    d.stunnedUntil = 100;
  }
  r.untilAttacks(1);
  const shot = r.battle.projectiles!.find((p) => p.sourceId === r.unit.id)!;
  expect(r.battle.elapsed).toBeCloseTo(0.4, 8);
  expect(shot).toMatchObject({
    weapon: 'native',
    targetDefender: true,
    targetId: primary.id,
    damage: 275,
    splash: 0.6,
    native: { name: 'SuperBowlerProjectile' },
  });
  expect(primary.hp).toBe(primary.maxHp);
  r.until(shot.impact);
  expect(primary.hp).toBe(primary.maxHp - 275);
  expect(neighbor.hp).toBe(neighbor.maxHp - 275);
  expect(air.hp).toBe(air.maxHp);
  expect(r.unit.native!.attacks).toBe(1);
});
it('only a carried Super Bowler enables the version 201 phase', () => {
  const r = nativeDirectBattle('superbowler');
  expect(replayBattle(r.data.initial, 200).nativeSuperBowlerWindup).toBeUndefined();
  expect(replayBattle(r.data.initial, 201).nativeSuperBowlerWindup).toBe(true);
  r.data.initial.army.superbowler = 0;
  expect(replayBattle(r.data.initial, 201).nativeSuperBowlerWindup).toBeUndefined();
});

it('Freeze holds the fresh charge and post-release recovery', () => {
  const r = nativeDirectBattle('superbowler');
  r.until(0.15);
  const before = structuredClone(r.unit.native!.attackWindup);
  r.unit.native!.effects = { frozenUntil: 1.15 };
  r.until(1.1);
  expect(r.unit.native!.attackWindup).toEqual(before);
  r.untilAttacks(1);
  expect(r.battle.elapsed).toBeCloseTo(1.4, 8);
  const first = r.battle.elapsed;
  r.step();
  r.unit.native!.effects!.stunUntil = r.battle.elapsed + 1;
  r.untilAttacks(2);
  expect(r.battle.elapsed - first).toBeCloseTo(3.2, 8);
});
for (const slowed of [false, true])
  it(`action modifiers scale windup and recovery, slowed=${slowed}`, () => {
    const r = nativeDirectBattle('superbowler');
    r.unit.native!.effects = slowed
      ? { poison: { since: 0, until: 100, dps: 0, speed: 0, attackSpeed: -0.5 } }
      : { boost: { until: 100, damage: 0, speed: 0, attackSpeed: 1 } };
    r.untilAttacks(1);
    const first = r.battle.elapsed,
      scale = slowed ? 2 : 0.5;
    expect(first).toBeCloseTo(0.4 * scale, 8);
    r.untilAttacks(2);
    expect(r.battle.elapsed - first).toBeCloseTo(2.2 * scale, 8);
  });
it('retains sub-step remainder across repeated throws', () => {
  const r = nativeDirectBattle('superbowler'),
    times: number[] = [];
  r.step();
  for (let n = 1; n <= 5; n++) {
    while ((r.unit.native!.attacks ?? 0) < n) r.model.step(0.08);
    times.push(r.unit.native!.lastAttackAt!);
  }
  expect(Math.abs(times[4] - times[0] - 4 * 2.2)).toBeLessThan(0.08 + 1e-8);
});
it('a replacement during recovery spends the remaining recovery once before its fresh charge', () => {
  const r = nativeDirectBattle('superbowler'),
    target = r.battle.buildings.find((b) => b.id === 2)!;
  r.battle.buildings.push(makeBuilding(3, 'goldstorage', 13, 10, 18));
  r.untilAttacks(1);
  const first = r.battle.elapsed;
  r.model.damage(target, target.hp);
  r.untilAttacks(2);
  expect(r.unit.target).toBe(3);
  expect(r.battle.elapsed - first).toBeCloseTo(1.1, 8);
});
it('a replacement during charge starts a fresh 0.4-second throw', () => {
  const r = nativeDirectBattle('superbowler'),
    target = r.battle.buildings.find((b) => b.id === 2)!;
  r.battle.buildings.push(makeBuilding(3, 'goldstorage', 13, 10, 18));
  r.until(0.15);
  r.model.damage(target, target.hp);
  r.step();
  const changed = r.battle.elapsed;
  r.untilAttacks(1);
  expect(r.battle.elapsed - changed + 0.05).toBeCloseTo(0.4, 8);
});
it('its source tracking projectile follows a moving ground primary', () => {
  const r = nativeDirectBattle('superbowler'),
    target = spawnGarrisonDefender(r.battle, 'golem', 8, 1, 12, 11.5, 0);
  target.alerted = true;
  target.stunnedUntil = 100;
  r.untilAttacks(1);
  const shot = r.battle.projectiles!.find((p) => p.sourceId === r.unit.id)!;
  target.x = 12.5;
  while (r.battle.projectiles!.some((p) => p.id === shot.id)) r.step();
  expect(shot.x).toBeCloseTo(12.5, 8);
  expect(target.hp).toBe(target.maxHp - 275);
});
it('an airborne defender cannot become the primary or receive the ground blast', () => {
  const r = nativeDirectBattle('superbowler'),
    air = spawnGarrisonDefender(r.battle, 'dragon', 7, 1, 14.5, 11.5, 0);
  air.alerted = true;
  air.stunnedUntil = 100;
  r.untilAttacks(1);
  const shot = r.battle.projectiles!.find((p) => p.sourceId === r.unit.id)!;
  expect(shot.targetBuilding).toBe(true);
  r.until(shot.impact);
  expect(air.hp).toBe(air.maxHp);
});
it('all three bounces complete after the final shooter is defeated', () => {
  const r = nativeDirectBattle('superbowler', 1, 201, 18.6),
    seen = new Map<string, number>();
  r.battle.remaining = emptyArmy();
  r.untilAttacks(1);
  const first = r.battle.elapsed;
  hurtUnit(r.battle, r.unit, r.unit.hp);
  while (!r.battle.finished && r.battle.elapsed < first + 4) {
    for (const p of r.battle.projectiles ?? [])
      if (p.sourceId === r.unit.id) seen.set(p.id, p.native?.bounce ?? 0);
    r.step();
  }
  expect([...seen.values()]).toEqual([0, 1, 2]);
  expect(r.battle.finished).toBe(true);
  const target = r.battle.buildings.find((b) => b.id === 2)!;
  expect(target.hp).toBe(target.maxHp - 275);
});
it('a released bounce can award the last stars after shooter defeat', () => {
  const r = nativeDirectBattle(
      'superbowler',
      1,
      201,
      18.6,
      'storage',
      {},
      { extraBuildings: [makeBuilding(3, 'builder', 11, 11, 1)] },
    ),
    hall = r.battle.buildings.find((b) => b.id === 1)!,
    target = r.battle.buildings.find((b) => b.id === 2)!;
  r.model.damage(hall, hall.hp);
  r.model.damage(target, target.hp - 275);
  r.battle.remaining = emptyArmy();
  r.untilAttacks(1);
  hurtUnit(r.battle, r.unit, r.unit.hp);
  while (!r.battle.finished && r.battle.elapsed < 5) r.step();
  expect(r.battle.result).toMatchObject({ stars: 3, destruction: 100 });
});
it('charges at a blocking Wall before continuing the ground route', () => {
  const r = nativeDirectBattle('superbowler', 1, 201, 6.9);
  r.battle.buildings.find((b) => b.id === 2)!.x = 22;
  const walls = Array.from({ length: 48 }, (_, y) => makeBuilding(1000 + y, 'wall', 12, y, 18));
  r.battle.buildings.push(...walls);
  r.untilAttacks(1);
  const shot = r.battle.projectiles!.find((p) => p.sourceId === r.unit.id)!,
    wall = walls.find((w) => w.id === shot.targetId)!;
  expect(wall).toBeDefined();
  expect(r.unit.x).toBeLessThan(12);
  r.until(shot.impact);
  expect(wall.hp).toBe(wall.maxHp - 275);
});
for (const kind of ['bomb', 'airbomb', 'seekingairmine'] as const)
  it(`retains ${kind} trigger eligibility while charging`, () => {
    const r = nativeDirectBattle('superbowler'),
      trap = makeBuilding(3, kind, 11, 11, 1);
    r.battle.buildings.push(trap);
    r.step();
    expect(r.unit.native?.attacks ?? 0).toBe(0);
    expect(r.battle.traps[trap.id] !== undefined).toBe(kind === 'bomb');
  });
for (const shrink of [false, true])
  it(`Shrink scales the phase while retaining damage and health, shrunk=${shrink}`, () => {
    const r = nativeDirectBattle('superbowler');
    if (shrink) applyShrink(r.unit, 0);
    r.untilAttacks(1);
    expect(r.battle.elapsed).toBeCloseTo(shrink ? 0.8 : 0.4, 8);
    expect(r.battle.projectiles!.find((p) => p.sourceId === r.unit.id)!.damage).toBe(275);
    expect([r.unit.hp, r.unit.maxHp]).toEqual([1000, 1000]);
  });
for (const version of [200, 201])
  for (const level of [1, 4])
    it(`actual Angry Spell ${level} retargets a Super Bowler under version ${version}`, () => {
      const r = nativeTargetingSpellRecording(
          'AngrySpell',
          level,
          version,
          'superbowler',
          1,
          0.1,
        ),
        pending = r.snapshots.find((s) => s.at === r.pending)!
          .battle as import('../src/game/model').Battle,
        after = r.snapshots.find((s) => s.at === r.impact)!
          .battle as import('../src/game/model').Battle,
        u = after.units.find((u) => u.id === r.unitId)!;
      if (version >= 201) {
        expect(pending.units.find((u) => u.id === r.unitId)!.native!.attackWindup).toMatchObject({
          engaged: true,
          target: { id: 2, building: true },
        });
        expect(u.native!.attackWindup!.engaged).toBeUndefined();
        expect(u.native!.attacks ?? 0).toBe(0);
      }
      expect(u.target).toBe(3);
      const viewer = new GameModel();
      expect(viewer.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(true);
      for (const s of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
        viewer.seekReplay(s.at);
        while (viewer.replay!.seeking) viewer.step(0.05);
        expect(JSON.parse(JSON.stringify(viewer.battle))).toEqual(s.battle);
      }
    });

for (const version of [200, 201])
  for (const level of [1, 10])
    for (const target of ['storage', 'cannon', 'golem'] as const)
      it(`tier ${level} actual ${target} fight preserves complete version ${version} states and bounces`, () => {
        const r = superBowlerRecording(version, level, target),
          viewer = new GameModel();
        expect(r.second - r.first).toBeCloseTo(2.2, 8);
        const native = version >= 201 || target !== 'golem';
        expect(r.shot.weapon).toBe(native ? 'native' : 'arrow');
        expect(r.firstPackets).toHaveLength(native ? 3 : 1);
        if (native) expect(r.firstPackets.map((p) => p.native?.bounce ?? 0)).toEqual([0, 1, 2]);
        if (version >= 201) expect(r.first - r.engaged + 0.05).toBeCloseTo(0.4, 8);
        if (target === 'golem')
          expect(
            r.snapshots[0].battle.defenders!.find((d) => d.id === r.defenderId)!.frozenUntil,
          ).toBeGreaterThan(r.secondLanded);
        expect(viewer.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(
          true,
        );
        for (const s of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
          viewer.seekReplay(s.at);
          while (viewer.replay!.seeking) viewer.step(0.05);
          expect(JSON.parse(JSON.stringify(viewer.battle))).toEqual(s.battle);
        }
      });
