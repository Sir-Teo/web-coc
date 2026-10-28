import { expect, it } from 'vitest';
import { emptyArmy } from '../src/game/army';
import { GameModel, makeBuilding } from '../src/game/model';
import { nativeUnitStats } from '../src/game/native-units';
import { spawnGarrisonDefender } from '../src/game/garrison-combat';
import { hurtUnit } from '../src/game/native-status';
import { replayBattle } from '../src/game/replay';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { nativeDirectBattle } from './fixtures/native-direct-attacks';
import {
  archerRecording,
  frozenDragonArcherRecording,
  archerPuppetRecording,
} from './fixtures/attacking-archer';

for (let level = 1; level <= 14; level++)
  for (const x of [11.4, 6.9])
    it(`Archer ${level} spends a one-second charge after approaching from ${x}`, () => {
      const r = nativeDirectBattle('archer', level, 191, x),
        target = r.battle.buildings.find((b) => b.id === 2)!,
        damage = nativeUnitStats('archer', level).damage;
      while (!r.unit.attacking) r.step();
      const engaged = r.battle.elapsed;
      expect(target.hp).toBe(target.maxHp);
      r.untilAttacks(1);
      const first = r.battle.elapsed,
        shot = r.battle.projectiles!.find((p) => p.sourceId === r.unit.id)!;
      expect(first - engaged + 0.05).toBeCloseTo(1, 8);
      expect(shot).toMatchObject({
        fromAir: false,
        damage,
        native: { kind: 'archer', level, name: nativeUnitStats('archer', level).projectile },
      });
      expect(shot.splash).toBeUndefined();
      expect(target.hp).toBe(target.maxHp);
      expect(shot.impact - shot.launched).toBeCloseTo(
        Math.max(0.12, Math.hypot(shot.x - shot.fromX, shot.y - shot.fromY) / 14),
        8,
      );
      r.until(shot.impact);
      expect(target.hp).toBe(target.maxHp - damage);
      r.untilAttacks(2);
      expect(r.unit.native!.lastAttackAt! - first).toBeCloseTo(1, 8);
    });

for (const air of [false, true])
  it(`native single-target release hits an eligible ${air ? 'air' : 'ground'} defender at impact`, () => {
    const r = nativeDirectBattle('archer'),
      kind = air ? 'dragon' : 'golem',
      tier = air ? 7 : 8,
      target = spawnGarrisonDefender(r.battle, kind, tier, 1, 12, 11.5, 0),
      neighbor = spawnGarrisonDefender(r.battle, kind, tier, 1, 12.1, 11.5, 0);
    for (const d of [target, neighbor]) {
      d.alerted = true;
      d.stunnedUntil = 100;
    }
    r.untilAttacks(1);
    const shot = r.battle.projectiles!.find((p) => p.sourceId === r.unit.id)!;
    expect(r.battle.elapsed).toBeCloseTo(1, 8);
    expect(shot).toMatchObject({
      fromAir: false,
      toAir: air,
      targetId: target.id,
      targetDefender: true,
      damage: 8,
      native: { name: 'Arrow_small' },
    });
    expect(target.hp).toBe(target.maxHp);
    r.until(shot.impact);
    expect(target.hp).toBe(target.maxHp - 8);
    expect(neighbor.hp).toBe(neighbor.maxHp);
  });

it('Freeze and stun hold both the charge and repeat cycle', () => {
  const r = nativeDirectBattle('archer');
  r.until(0.3);
  const before = structuredClone(r.unit.native!.attackWindup);
  (r.unit.native!.effects ??= {}).frozenUntil = 1.3;
  r.until(1.25);
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
  it(`scales action phases, slowed=${slowed}`, () => {
    const r = nativeDirectBattle('archer');
    (r.unit.native ??= {}).effects = slowed
      ? { poison: { since: 0, until: 100, dps: 0, speed: 0, attackSpeed: -0.5 } }
      : { boost: { until: 100, damage: 0, speed: 0, attackSpeed: 1 } };
    r.untilAttacks(1);
    const first = r.battle.elapsed,
      period = slowed ? 2 : 0.5;
    expect(first).toBeCloseTo(period, 8);
    r.untilAttacks(2);
    expect(r.battle.elapsed - first).toBeCloseTo(period, 8);
  });
it('carries sub-step remainder through repeat releases', () => {
  const r = nativeDirectBattle('archer'),
    releases: number[] = [];
  r.step();
  for (let n = 1; n <= 8; n++) {
    while ((r.unit.native!.attacks ?? 0) < n) r.model.step(0.08);
    releases.push(r.unit.native!.lastAttackAt!);
  }
  expect(Math.abs(releases[7] - releases[0] - 7)).toBeLessThan(0.08 + 1e-8);
});
it('a replacement during charge starts a fresh one-second attack', () => {
  const r = nativeDirectBattle('archer'),
    target = r.battle.buildings.find((b) => b.id === 2)!;
  r.battle.buildings.push(makeBuilding(3, 'goldstorage', 13, 10, 18));
  r.until(0.4);
  r.model.damage(target, target.hp);
  r.step();
  const changed = r.battle.elapsed;
  r.untilAttacks(1);
  expect(r.battle.elapsed - changed + 0.05).toBeCloseTo(1, 8);
  expect(r.unit.target).toBe(3);
});
it('a released shot survives removal of its shooter', () => {
  const r = nativeDirectBattle('archer');
  r.untilAttacks(1);
  const shot = r.battle.projectiles!.find((p) => p.sourceId === r.unit.id)!,
    target = r.battle.buildings.find((b) => b.id === 2)!;
  hurtUnit(r.battle, r.unit, r.unit.hp);
  r.until(shot.impact);
  expect(target.hp).toBe(target.maxHp - 8);
});

it('the final native arrow awards the last stars after its Archer is defeated', () => {
  const r = nativeDirectBattle('archer'),
    hall = r.battle.buildings.find((b) => b.id === 1)!,
    target = r.battle.buildings.find((b) => b.id === 2)!;
  r.model.damage(hall, hall.hp);
  r.model.damage(target, target.hp - 8);
  r.battle.remaining = emptyArmy();
  r.untilAttacks(1);
  const shot = r.battle.projectiles!.find((p) => p.sourceId === r.unit.id)!;
  hurtUnit(r.battle, r.unit, r.unit.hp);
  r.step();
  expect(r.battle.finished).toBe(false);
  expect(target.hp).toBe(8);
  r.until(shot.impact);
  expect(r.battle.result).toMatchObject({ stars: 3, destruction: 100 });
});

it('opens a blocked ground route by shooting the Wall instead of crossing it', () => {
  const r = nativeDirectBattle('archer', 1, undefined, 6.9);
  r.battle.buildings.find((b) => b.id === 2)!.x = 22;
  const walls = Array.from({ length: 48 }, (_, y) => makeBuilding(1000 + y, 'wall', 12, y, 18));
  r.battle.buildings.push(...walls);
  r.untilAttacks(1);
  const shot = r.battle.projectiles!.find((p) => p.sourceId === r.unit.id)!,
    wall = walls.find((w) => w.id === shot.targetId)!;
  expect(wall).toBeDefined();
  expect(r.unit.x).toBeLessThan(12);
  r.until(shot.impact);
  expect(wall.hp).toBe(wall.maxHp - 8);
});

for (const kind of ['bomb', 'airbomb', 'seekingairmine'] as const)
  it(`a charging Archer retains ${kind} trigger eligibility`, () => {
    const r = nativeDirectBattle('archer'),
      trap = makeBuilding(3, kind, 11, 11, 1);
    r.battle.buildings.push(trap);
    r.step();
    expect(r.unit.native!.attacks ?? 0).toBe(0);
    expect(r.battle.traps[trap.id] !== undefined).toBe(kind === 'bomb');
  });
for (const version of [190, 191])
  for (const level of [1, 14]) {
    for (const guard of [false, true])
      it(`tier ${level} actual ${guard ? 'Golem' : 'Air Defense'} fight preserves version ${version}`, () => {
        const r = archerRecording(version, level, guard),
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
    it(`tier ${level} actual Freeze and Dragon preserve version ${version}`, () => {
      const r = frozenDragonArcherRecording(level, version),
        viewer = new GameModel(),
        born = r.snapshots.find((s) => s.at === r.born)!.battle,
        guard = born.defenders!.find((d) => d.id === r.defenderId)!;
      expect(guard.frozenUntil).toBeGreaterThan(r.second);
      expect(born.nativeFreezeCasts!.some((s) => s.name === 'Freeze')).toBe(true);
      expect(viewer.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(true);
      for (const s of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
        viewer.seekReplay(s.at);
        while (viewer.replay!.seeking) viewer.step(0.05);
        expect(JSON.parse(JSON.stringify(viewer.battle))).toEqual(s.battle);
      }
    });
  }
it('only carried ordinary Archers enable version 191', () => {
  const r = nativeDirectBattle('archer');
  expect(replayBattle(r.data.initial, 190).nativeArcherWindup).toBeUndefined();
  expect(replayBattle(r.data.initial, 191).nativeArcherWindup).toBe(true);
  r.data.initial.army.archer = 0;
  expect(replayBattle(r.data.initial, 191).nativeArcherWindup).toBeUndefined();
});

for (const version of [190, 191])
  for (const item of [1, 18])
    for (const level of [1, 14])
      it(`Puppet ${item} records source-tier ${level} Archers under version ${version}`, () => {
        const r = archerPuppetRecording(item, level, version),
          viewer = new GameModel();
        expect(r.data.initial.army.archer).toBe(0);
        const born = r.snapshots[0].battle.units.filter((u) => u.kind === 'archer');
        expect(born.length).toBeGreaterThan(0);
        expect(born.every((u) => u.level === level && u.summoned)).toBe(true);
        expect(r.first - r.born).toBeCloseTo(version >= 191 ? 1 : 0.05, 8);
        expect(r.shot.damage).toBe(nativeUnitStats('archer', level).damage);
        if (version >= 191)
          expect(r.shot.native).toMatchObject({
            kind: 'archer',
            level,
            name: nativeUnitStats('archer', level).projectile,
          });
        else expect(r.shot.weapon).toBe('arrow');
        expect(viewer.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(
          true,
        );
        for (const s of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
          viewer.seekReplay(s.at);
          while (viewer.replay!.seeking) viewer.step(0.05);
          expect(JSON.parse(JSON.stringify(viewer.battle))).toEqual(s.battle);
        }
      });

it('an active Archer Puppet enables source arrows without trained Archers', () => {
  const r = archerPuppetRecording();
  expect(replayBattle(r.data.initial, 191).nativeArcherWindup).toBe(true);
  expect(replayBattle(r.data.initial, 190).nativeArcherWindup).toBeUndefined();
  r.data.initial.heroes![0].items = [];
  expect(replayBattle(r.data.initial, 191).nativeArcherWindup).toBeUndefined();
  r.data.initial.heroes![0].items = [{ slug: 'healer-puppet', level: 1 }];
  expect(replayBattle(r.data.initial, 191).nativeArcherWindup).toBeUndefined();
});
