import { expect, it } from 'vitest';
import { emptyArmy } from '../src/game/army';
import { applyShrink } from '../src/game/shrink-trap';
import { GameModel, makeBuilding } from '../src/game/model';
import { nativeUnitStats } from '../src/game/native-units';
import { spawnGarrisonDefender } from '../src/game/garrison-combat';
import { hurtUnit } from '../src/game/native-status';
import { replayBattle } from '../src/game/replay';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { nativeDirectBattle } from './fixtures/native-direct-attacks';
import {
  wizardRecording,
  frozenGuardWizardRecording,
  siegeWizardRecording,
} from './fixtures/attacking-wizard';
import { nativeTargetingSpellRecording } from './fixtures/native-targeting-spells';

for (let level = 1; level <= 14; level++)
  for (const x of [11.4, 6.9])
    it(`Wizard ${level} spends a one-and-a-half-second charge after approaching from ${x}`, () => {
      const r = nativeDirectBattle('wizard', level, 194, x),
        target = r.battle.buildings.find((b) => b.id === 2)!,
        damage = nativeUnitStats('wizard', level).damage;
      while (!r.unit.attacking) r.step();
      const engaged = r.battle.elapsed;
      expect(target.hp).toBe(target.maxHp);
      r.untilAttacks(1);
      const first = r.battle.elapsed,
        shot = r.battle.projectiles!.find((p) => p.sourceId === r.unit.id)!;
      expect(first - engaged + 0.05).toBeCloseTo(1.5, 8);
      expect(shot).toMatchObject({
        fromAir: false,
        damage,
        native: { kind: 'wizard', level, name: nativeUnitStats('wizard', level).projectile },
      });
      expect(shot.splash).toBe(0.3);
      expect(target.hp).toBe(target.maxHp);
      expect(shot.impact - shot.launched).toBeCloseTo(
        Math.max(0.12, Math.hypot(shot.x - shot.fromX, shot.y - shot.fromY) / (level <= 3 ? 5 : 9)),
        8,
      );
      r.until(shot.impact);
      expect(target.hp).toBe(target.maxHp - damage);
      r.untilAttacks(2);
      expect(r.unit.native!.lastAttackAt! - first).toBeCloseTo(1.5, 8);
    });

for (const air of [false, true])
  it(`native splash release hits an eligible ${air ? 'air' : 'ground'} defender at impact`, () => {
    const r = nativeDirectBattle('wizard'),
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
    expect(r.battle.elapsed).toBeCloseTo(1.5, 8);
    expect(shot).toMatchObject({
      fromAir: false,
      toAir: air,
      targetId: target.id,
      targetDefender: true,
      damage: 75,
      native: { name: 'ps_chr_WizardAttack_Projectile' },
    });
    expect(target.hp).toBe(target.maxHp);
    r.until(shot.impact);
    expect(target.hp).toBe(target.maxHp - 75);
    expect(neighbor.hp).toBe(neighbor.maxHp - 75);
  });

it('Freeze and stun hold both the charge and repeat cycle', () => {
  const r = nativeDirectBattle('wizard');
  r.until(0.3);
  const before = structuredClone(r.unit.native!.attackWindup);
  (r.unit.native!.effects ??= {}).frozenUntil = 1.3;
  r.until(1.25);
  expect(r.unit.native!.attackWindup).toEqual(before);
  r.untilAttacks(1);
  expect(r.battle.elapsed).toBeCloseTo(2.5, 8);
  const first = r.battle.elapsed;
  r.step();
  r.unit.native!.effects!.stunUntil = r.battle.elapsed + 1;
  r.untilAttacks(2);
  expect(r.battle.elapsed - first).toBeCloseTo(2.5, 8);
});
for (const slowed of [false, true])
  it(`scales action phases, slowed=${slowed}`, () => {
    const r = nativeDirectBattle('wizard');
    (r.unit.native ??= {}).effects = slowed
      ? { poison: { since: 0, until: 100, dps: 0, speed: 0, attackSpeed: -0.5 } }
      : { boost: { until: 100, damage: 0, speed: 0, attackSpeed: 1 } };
    r.untilAttacks(1);
    const first = r.battle.elapsed,
      period = slowed ? 3 : 0.75;
    expect(first).toBeCloseTo(period, 8);
    r.untilAttacks(2);
    expect(r.battle.elapsed - first).toBeCloseTo(period, 8);
  });
it('carries sub-step remainder through repeat releases', () => {
  const r = nativeDirectBattle('wizard'),
    releases: number[] = [];
  r.step();
  for (let n = 1; n <= 8; n++) {
    while ((r.unit.native!.attacks ?? 0) < n) r.model.step(0.08);
    releases.push(r.unit.native!.lastAttackAt!);
  }
  expect(Math.abs(releases[7] - releases[0] - 7 * 1.5)).toBeLessThan(0.08 + 1e-8);
});
it('a replacement during charge starts a fresh one-and-a-half-second attack', () => {
  const r = nativeDirectBattle('wizard'),
    target = r.battle.buildings.find((b) => b.id === 2)!;
  r.battle.buildings.push(makeBuilding(3, 'goldstorage', 13, 10, 18));
  r.until(0.4);
  r.model.damage(target, target.hp);
  r.step();
  const changed = r.battle.elapsed;
  r.untilAttacks(1);
  expect(r.battle.elapsed - changed + 0.05).toBeCloseTo(1.5, 8);
  expect(r.unit.target).toBe(3);
});
it('a released shot survives removal of its shooter', () => {
  const r = nativeDirectBattle('wizard');
  r.untilAttacks(1);
  const shot = r.battle.projectiles!.find((p) => p.sourceId === r.unit.id)!,
    target = r.battle.buildings.find((b) => b.id === 2)!;
  hurtUnit(r.battle, r.unit, r.unit.hp);
  r.until(shot.impact);
  expect(target.hp).toBe(target.maxHp - 75);
});

it('the final native fireball awards the last stars after its Wizard is defeated', () => {
  const r = nativeDirectBattle('wizard'),
    hall = r.battle.buildings.find((b) => b.id === 1)!,
    target = r.battle.buildings.find((b) => b.id === 2)!;
  r.model.damage(hall, hall.hp);
  r.model.damage(target, target.hp - 75);
  r.battle.remaining = emptyArmy();
  r.untilAttacks(1);
  const shot = r.battle.projectiles!.find((p) => p.sourceId === r.unit.id)!;
  hurtUnit(r.battle, r.unit, r.unit.hp);
  r.step();
  expect(r.battle.finished).toBe(false);
  expect(target.hp).toBe(75);
  r.until(shot.impact);
  expect(r.battle.result).toMatchObject({ stars: 3, destruction: 100 });
});

it('opens a blocked ground route by shooting the Wall instead of crossing it', () => {
  const r = nativeDirectBattle('wizard', 1, undefined, 6.9);
  r.battle.buildings.find((b) => b.id === 2)!.x = 22;
  const walls = Array.from({ length: 48 }, (_, y) => makeBuilding(1000 + y, 'wall', 12, y, 18));
  r.battle.buildings.push(...walls);
  r.untilAttacks(1);
  const shot = r.battle.projectiles!.find((p) => p.sourceId === r.unit.id)!,
    wall = walls.find((w) => w.id === shot.targetId)!;
  expect(wall).toBeDefined();
  expect(r.unit.x).toBeLessThan(12);
  r.until(shot.impact);
  expect(wall.hp).toBe(wall.maxHp - 75);
});

for (const air of [false, true])
  it(`fixed ${air ? 'air' : 'ground'} landing allows escape and respects radius, layer and birth time`, () => {
    const r = nativeDirectBattle('wizard'),
      kind = air ? 'dragon' : 'golem',
      level = air ? 7 : 8;
    const primary = spawnGarrisonDefender(r.battle, kind, level, 1, 14, 11.5, 0),
      inside = spawnGarrisonDefender(r.battle, kind, level, 1, 14.299, 11.5, 0),
      outside = spawnGarrisonDefender(r.battle, kind, level, 1, 14.301, 11.5, 0),
      other = spawnGarrisonDefender(
        r.battle,
        air ? 'golem' : 'dragon',
        air ? 8 : 7,
        1,
        14,
        11.5,
        0,
      ),
      future = spawnGarrisonDefender(r.battle, kind, level, 1, 14, 11.5, 0);
    for (const d of [primary, inside, outside, other, future]) {
      d.alerted = true;
      d.stunnedUntil = 100;
    }
    const wall = makeBuilding(3, 'wall', 14, 11, 18),
      trap = makeBuilding(4, 'bomb', 14, 11, 1);
    r.battle.buildings.push(wall, trap);
    r.untilAttacks(1);
    const shot = r.battle.projectiles!.find((p) => p.sourceId === r.unit.id)!,
      aim = { x: shot.x, y: shot.y };
    primary.x = 18;
    future.spawnedAt = shot.impact + 0.001;
    r.until(shot.impact);
    expect({ x: shot.x, y: shot.y }).toEqual(aim);
    expect(primary.hp).toBe(primary.maxHp);
    expect(inside.hp).toBe(inside.maxHp - 75);
    expect(outside.hp).toBe(outside.maxHp);
    expect(other.hp).toBe(other.maxHp);
    expect(future.hp).toBe(future.maxHp);
    expect(wall.hp).toBe(wall.maxHp - (air ? 0 : 75));
    expect(trap.hp).toBe(trap.maxHp);
  });

for (const kind of ['bomb', 'airbomb', 'seekingairmine'] as const)
  it(`retains ${kind} trigger eligibility during its charge`, () => {
    const r = nativeDirectBattle('wizard'),
      trap = makeBuilding(3, kind, 11, 11, 1);
    r.battle.buildings.push(trap);
    r.step();
    expect(r.unit.native?.attacks ?? 0).toBe(0);
    expect(r.battle.traps[trap.id] !== undefined).toBe(kind === 'bomb');
  });
for (const version of [193, 194])
  for (const level of [1, 14])
    for (const target of ['storage', 'golem', 'dragon'] as const)
      it(`tier ${level} actual ${target} fight reconstructs full version ${version} states`, () => {
        const r =
            target === 'storage'
              ? wizardRecording(version, level)
              : frozenGuardWizardRecording(level, version, target === 'dragon'),
          viewer = new GameModel();
        if (target !== 'storage')
          expect(
            r.snapshots[0].battle.defenders!.find((d) => d.id === r.defenderId)!.frozenUntil,
          ).toBeGreaterThan(r.secondHit);
        expect(viewer.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(
          true,
        );
        for (const s of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
          viewer.seekReplay(s.at);
          while (viewer.replay!.seeking) viewer.step(0.05);
          expect(JSON.parse(JSON.stringify(viewer.battle))).toEqual(s.battle);
        }
      });
for (const version of [193, 194])
  for (const barracks of [1, 6])
    for (const level of [1, 14])
      it(`Siege Barracks ${barracks} supplies own-tier ${level} Wizard charges under version ${version}`, () => {
        const r = siegeWizardRecording(barracks, level, version),
          viewer = new GameModel(),
          born = r.snapshots[0].battle.units.find((u) => u.id === r.id)!;
        expect(r.data.initial.army.wizard).toBe(0);
        expect(r.data.initial.army.siegebarracks).toBe(1);
        expect(born.level).toBe(level);
        expect(born.native!.owner).toBeDefined();
        expect(r.first - r.engaged + (version >= 194 ? 0.05 : 0)).toBeCloseTo(
          version >= 194 ? 1.5 : 0,
          8,
        );
        expect(r.shot.damage).toBe(nativeUnitStats('wizard', level).damage);
        expect(r.shot.weapon).toBe(version >= 194 ? 'native' : 'fireball');
        expect(viewer.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(
          true,
        );
        for (const s of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
          viewer.seekReplay(s.at);
          while (viewer.replay!.seeking) viewer.step(0.05);
          expect(JSON.parse(JSON.stringify(viewer.battle))).toEqual(s.battle);
        }
      });
it('only carried Wizards or Siege Barracks enable version 194 source fireballs', () => {
  const r = nativeDirectBattle('wizard');
  expect(replayBattle(r.data.initial, 194).nativeWizardWindup).toBe(true);
  expect(replayBattle(r.data.initial, 193).nativeWizardWindup).toBeUndefined();
  r.data.initial.army.wizard = 0;
  expect(replayBattle(r.data.initial, 194).nativeWizardWindup).toBeUndefined();
  r.data.initial.army.siegebarracks = 1;
  expect(replayBattle(r.data.initial, 194).nativeWizardWindup).toBe(true);
});
for (const version of [193, 194])
  for (const level of [1, 4])
    it(`actual Angry Spell ${level} interrupts Wizard targeting under version ${version}`, () => {
      const r = nativeTargetingSpellRecording('AngrySpell', level, version, 'wizard'),
        viewer = new GameModel(),
        at = (t: number) =>
          r.snapshots.find((s) => s.at === t)!.battle as import('../src/game/model').Battle,
        pending = at(r.pending).units.find((u) => u.id === r.unitId)!,
        after = at(r.impact),
        u = after.units.find((u) => u.id === r.unitId)!;
      if (version >= 194) {
        expect(pending.native!.attackWindup).toMatchObject({
          engaged: true,
          target: { id: 2, building: true },
        });
        expect(pending.native!.attackWindup!.remaining).toBeGreaterThan(0);
        expect(u.native!.attackWindup!.engaged).toBeUndefined();
        expect(u.native!.attacks ?? 0).toBe(0);
        expect(after.buildings.find((b) => b.id === 2)!.hp).toBe(
          after.buildings.find((b) => b.id === 2)!.maxHp,
        );
      }
      expect(u.target).toBe(3);
      expect(viewer.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(true);
      for (const s of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
        viewer.seekReplay(s.at);
        while (viewer.replay!.seeking) viewer.step(0.05);
        expect(JSON.parse(JSON.stringify(viewer.battle))).toEqual(s.battle);
      }
    });

for (const shrink of [false, true])
  it(`Shrink preserves damage and doubles an engaged source Wizard charge, shrunk=${shrink}`, () => {
    const r = nativeDirectBattle('wizard');
    if (shrink) applyShrink(r.unit, 0);
    r.untilAttacks(1);
    expect(r.battle.elapsed).toBeCloseTo(shrink ? 3 : 1.5, 8);
    const shot = r.battle.projectiles!.find((p) => p.sourceId === r.unit.id)!;
    expect(shot.damage).toBe(75);
    expect([r.unit.hp, r.unit.maxHp]).toEqual([75, 75]);
    r.until(shot.impact);
    const target = r.battle.buildings.find((b) => b.id === 2)!;
    expect(target.hp).toBe(target.maxHp - 75);
  });
