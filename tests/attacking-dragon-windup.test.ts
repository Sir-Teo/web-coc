import { expect, it } from 'vitest';
import { GameModel, makeBuilding } from '../src/game/model';
import { nativeUnitStats } from '../src/game/native-units';
import { spawnGarrisonDefender } from '../src/game/garrison-combat';
import { replayBattle } from '../src/game/replay';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { nativeDirectBattle } from './fixtures/native-direct-attacks';
import { dragonRecording } from './fixtures/attacking-dragon';

for (let level = 1; level <= 13; level++)
  for (const x of [11.4, 6.9])
    it(`Dragon ${level} charges after approaching from ${x} and resolves instant flame`, () => {
      const r = nativeDirectBattle('dragon', level, 189, x),
        target = r.battle.buildings.find((b) => b.id === 2)!,
        damage = nativeUnitStats('dragon', level).damage;
      while (!r.unit.attacking) r.step();
      const engaged = r.battle.elapsed;
      expect(target.hp).toBe(target.maxHp);
      r.untilAttacks(1);
      const first = r.battle.elapsed;
      expect(first - engaged + 0.05).toBeCloseTo(1.25, 8);
      expect(target.hp).toBe(target.maxHp - damage);
      expect(r.battle.projectiles?.some((p) => p.sourceId === r.unit.id) ?? false).toBe(false);
      r.untilAttacks(2);
      expect(r.unit.native!.lastAttackAt! - first).toBeCloseTo(1.25, 8);
      expect(target.hp).toBe(target.maxHp - 2 * damage);
    });

for (const air of [false, true])
  it(`instant flame splashes each ${air ? 'air' : 'ground'} defender once on its own layer`, () => {
    const r = nativeDirectBattle('dragon', 1, 189),
      kind = air ? 'dragon' : 'golem',
      otherKind = air ? 'golem' : 'dragon',
      target = spawnGarrisonDefender(r.battle, kind, air ? 7 : 8, 1, 12, 11.5, 0),
      near = spawnGarrisonDefender(r.battle, kind, air ? 7 : 8, 1, 12.2, 11.5, 0),
      far = spawnGarrisonDefender(r.battle, kind, air ? 7 : 8, 1, 12.4, 11.5, 0),
      other = spawnGarrisonDefender(r.battle, otherKind, air ? 8 : 7, 1, 12.1, 11.5, 0),
      building = makeBuilding(3, 'goldstorage', 12, 11, 18);
    r.battle.buildings.push(building);
    for (const d of [target, near, far, other]) {
      d.alerted = true;
      d.stunnedUntil = 100;
    }
    r.untilAttacks(1);
    expect(r.battle.elapsed).toBeCloseTo(1.25, 8);
    expect(r.unit.defenderTarget).toBe(target.id);
    expect(target.hp).toBe(target.maxHp - 175);
    expect(near.hp).toBe(near.maxHp - 175);
    expect(far.hp).toBe(far.maxHp);
    expect(other.hp).toBe(other.maxHp);
    expect(building.hp).toBe(building.maxHp - (air ? 0 : 175));
    expect(r.battle.projectiles?.some((p) => p.sourceId === r.unit.id) ?? false).toBe(false);
  });

it('a building release also splashes nearby ground defenders, excluding air and future births', () => {
  const r = nativeDirectBattle('dragon', 1, 189),
    building = r.battle.buildings.find((b) => b.id === 2)!,
    ground = spawnGarrisonDefender(r.battle, 'golem', 8, 1, 13.1, 11.5, 0),
    air = spawnGarrisonDefender(r.battle, 'dragon', 7, 1, 13.2, 11.5, 0),
    future = spawnGarrisonDefender(r.battle, 'golem', 8, 1, 13.05, 11.5, 100);
  for (const d of [ground, air, future]) d.stunnedUntil = 100;
  r.untilAttacks(1);
  expect(r.unit.target).toBe(building.id);
  expect(building.hp).toBe(building.maxHp - 175);
  expect(ground.hp).toBe(ground.maxHp - 175);
  expect(air.hp).toBe(air.maxHp);
  expect(future.hp).toBe(future.maxHp);
});

it('Freeze and stun hold the fresh charge and repeat clock', () => {
  const r = nativeDirectBattle('dragon', 1, 189);
  r.until(0.3);
  const before = structuredClone(r.unit.native!.attackWindup);
  (r.unit.native!.effects ??= {}).frozenUntil = 1.3;
  r.until(1.25);
  expect(r.unit.native!.attackWindup).toEqual(before);
  r.untilAttacks(1);
  expect(r.battle.elapsed).toBeCloseTo(2.25, 8);
  const first = r.battle.elapsed;
  r.step();
  r.unit.native!.effects!.stunUntil = r.battle.elapsed + 1;
  r.untilAttacks(2);
  expect(r.battle.elapsed - first).toBeCloseTo(2.25, 8);
});
for (const slowed of [false, true])
  it(`action modifiers scale both phases, slowed=${slowed}`, () => {
    const r = nativeDirectBattle('dragon', 1, 189);
    (r.unit.native ??= {}).effects = slowed
      ? { poison: { since: 0, until: 100, dps: 0, speed: 0, attackSpeed: -0.5 } }
      : { boost: { until: 100, damage: 0, speed: 0, attackSpeed: 1 } };
    r.untilAttacks(1);
    const first = r.battle.elapsed,
      period = slowed ? 2.5 : 0.625;
    expect(first - period).toBeGreaterThanOrEqual(-1e-8);
    expect(first - period).toBeLessThan(0.05 + 1e-8);
    r.untilAttacks(5);
    expect(Math.abs(r.unit.native!.lastAttackAt! - first - 4 * period)).toBeLessThan(0.05 + 1e-8);
  });
it('retains sub-step remainder through successive flame releases', () => {
  const r = nativeDirectBattle('dragon', 1, 189),
    releases: number[] = [];
  r.step();
  for (let n = 1; n <= 8; n++) {
    while ((r.unit.native!.attacks ?? 0) < n) r.model.step(0.08);
    releases.push(r.unit.native!.lastAttackAt!);
  }
  expect(Math.abs(releases[7] - releases[0] - 7 * 1.25)).toBeLessThan(0.08 + 1e-8);
});
it('a replacement target starts a fresh charge', () => {
  const r = nativeDirectBattle('dragon', 1, 189),
    target = r.battle.buildings.find((b) => b.id === 2)!;
  r.battle.buildings.push(makeBuilding(3, 'goldstorage', 13, 10, 18));
  r.until(0.4);
  r.model.damage(target, target.hp);
  r.step();
  const changed = r.battle.elapsed;
  r.untilAttacks(1);
  expect(r.battle.elapsed - changed + 0.05).toBeCloseTo(1.25, 8);
  expect(r.unit.target).toBe(3);
});
it('flies over intact Walls without attacking them on approach', () => {
  const r = nativeDirectBattle('dragon', 1, 189, 6.9);
  r.battle.buildings.find((b) => b.id === 2)!.x = 22;
  const walls = Array.from({ length: 48 }, (_, y) => makeBuilding(1000 + y, 'wall', 12, y, 18));
  r.battle.buildings.push(...walls);
  r.untilAttacks(1);
  expect(r.unit.x).toBeGreaterThan(12);
  expect(walls.every((w) => w.hp === w.maxHp)).toBe(true);
});

for (const version of [188, 189])
  for (const level of [1, 13])
    for (const guard of [false, true, 'air'] as const)
      it(`tier ${level} actual ${guard || 'Cannon'} fight preserves version ${version}`, () => {
        const r = dragonRecording(version, level, guard),
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
it('only a carried ordinary Dragon enables version 189', () => {
  const r = nativeDirectBattle('dragon', 1, 189);
  expect(replayBattle(r.data.initial, 188).nativeDragonWindup).toBeUndefined();
  expect(replayBattle(r.data.initial, 189).nativeDragonWindup).toBe(true);
  r.data.initial.army.dragon = 0;
  expect(replayBattle(r.data.initial, 189).nativeDragonWindup).toBeUndefined();
});
