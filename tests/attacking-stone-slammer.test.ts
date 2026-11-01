import { expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { GameModel, makeBuilding } from '../src/game/model';
import { nativeUnitStats } from '../src/game/native-units';
import { spawnGarrisonDefender } from '../src/game/garrison-combat';
import { attackStoneSlammer } from '../src/game/native-stone-slammer';
import type { NativeTroopContext } from '../src/game/native-troops';
import { replayBattle } from '../src/game/replay';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { stoneSlammerBattle, stoneSlammerRecording } from './fixtures/attacking-stone-slammer';

for (let level = 1; level <= 6; level++)
  for (const x of [11.4, 5])
    it(`Stone Slammer ${level} charges after approaching from ${x} and releases both blasts`, () => {
      const r = stoneSlammerBattle(level, 222, x),
        target = r.battle.buildings.find((b) => b.id === 2)!,
        wall = r.battle.buildings.find((b) => b.id === 3)!,
        hp = target.hp,
        wallHp = wall.hp,
        heavy = nativeUnitStats('stoneslammer', level).damage,
        secondary = [200, 300, 400, 500, 600, 700][level - 1];
      while (!r.unit.attacking) r.step();
      const engaged = r.battle.elapsed;
      expect(target.hp).toBe(hp);
      r.untilAttacks(1);
      const first = r.battle.elapsed;
      expect(first - engaged + 0.05).toBeCloseTo(1.7, 8);
      expect(target.hp).toBeCloseTo(hp - heavy - secondary, 8);
      expect(wall.hp).toBeCloseTo(Math.max(0, wallHp - secondary * 0.75 * 25), 8);
      expect(r.battle.projectiles?.some((p) => p.sourceId === r.unit.id) ?? false).toBe(false);
      expect(r.unit.native!.attackWindup!.recovery).toBeCloseTo(0.55, 8);
      r.untilAttacks(2);
      expect(r.battle.elapsed - first).toBeCloseTo(2.5, 8);
      expect(target.hp).toBeCloseTo(Math.max(0, hp - 2 * (heavy + secondary)), 8);
    });

for (const level of [1, 6])
  it(`Stone Slammer ${level} applies source falloff once to ground targets and footprints`, () => {
    const r = stoneSlammerBattle(level, 222),
      heavy = nativeUnitStats('stoneslammer', level).damage,
      secondary = level === 1 ? 200 : 700,
      target = r.battle.buildings.find((b) => b.id === 2)!,
      hp = target.hp,
      distances = [0, 0.75, 1, 1.001, 1.5, 2, 2.5, 3, 3.001],
      defenders = distances.map((d) =>
        spawnGarrisonDefender(r.battle, 'golem', 8, 1, 14.5 + d, 11.5, 0),
      ),
      air = spawnGarrisonDefender(r.battle, 'dragon', 7, 1, 14.5, 11.5, 0),
      future = spawnGarrisonDefender(r.battle, 'golem', 8, 1, 14.5, 11.5, 0.05),
      trap = makeBuilding(4, 'bomb', 14, 11, 1);
    r.battle.buildings.push(trap);
    const ctx: NativeTroopContext = {
      battle: r.battle,
      buildings: r.battle.buildings,
      buildingsById: new Map(r.battle.buildings.map((b) => [b.id, b])),
      passableWalls: new Set(),
      nextId: () => 1000,
      troopLevel: () => level,
      damageBuilding: (b, damage) => r.model.damage(b, damage),
      effect: () => {},
    };
    attackStoneSlammer(ctx, r.unit, nativeUnitStats('stoneslammer', level), heavy, {
      building: target,
    });
    expect(target.hp).toBeCloseTo(hp - heavy - secondary, 8);
    for (const [i, d] of distances.entries()) {
      const light = d > 3 ? 0 : d <= 2 ? secondary : secondary * (1 - (d - 2) / 2),
        expected = (d <= 1 ? heavy : 0) + light;
      expect(defenders[i].hp).toBeCloseTo(defenders[i].maxHp - expected, 8);
    }
    expect(air.hp).toBe(air.maxHp);
    expect(future.hp).toBe(future.maxHp);
    expect(trap.hp).toBe(trap.maxHp);
  });

for (const version of [221, 222])
  for (const level of [1, 6])
    for (const x of [11.4, 5])
      it(`Stone Slammer ${level} from ${x} preserves complete version ${version} portable states`, () => {
        const r = stoneSlammerRecording(level, version, x),
          viewer = new GameModel();
        if (version === 221) {
          const hashes: Record<string, string> = {
            '1:11.4': '38f4e0e85a9cea7511075ee28a2c8d10e1d1466fa3215a915d09106956feca67',
            '1:5': 'd89622c5b292578f2f34395622a990e906741ed62c149d2d8b3abc7658ff393b',
            '6:11.4': 'bb7ee70704aacb70f16128d6f0f20ef87cb458e780104aecd54949642f24d76f',
            '6:5': '2b604d35746fd27ad81b866c165edb59fbd597c27a231cae66406ed68abc79e5',
          };
          expect(createHash('sha256').update(JSON.stringify(r.snapshots)).digest('hex')).toBe(
            hashes[`${level}:${x}`],
          );
        }
        expect(viewer.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(
          true,
        );
        for (const snapshot of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
          viewer.seekReplay(snapshot.at);
          while (viewer.replay!.seeking) viewer.step(0.05);
          expect(JSON.parse(JSON.stringify(viewer.battle))).toEqual(snapshot.battle);
        }
      });

it('only new carried Stone Slammer armies enable the attack adapter', () => {
  const r = stoneSlammerBattle(1, 221);
  expect(replayBattle(r.data.initial, 221).nativeStoneSlammerAttacks).toBeUndefined();
  expect(replayBattle(r.data.initial, 222).nativeStoneSlammerAttacks).toBe(true);
  r.data.initial.army.stoneslammer = 0;
  expect(replayBattle(r.data.initial, 222).nativeStoneSlammerAttacks).toBeUndefined();
});

for (const hold of ['frozenUntil', 'stunUntil'] as const)
  it(`${hold} pauses the Stone Slammer charge through a partial thaw`, () => {
    const r = stoneSlammerBattle(1, 222);
    while (!r.unit.attacking) r.step();
    const engaged = r.battle.elapsed;
    r.until(engaged + 0.25);
    (r.unit.native!.effects ??= {})[hold] = r.battle.elapsed + 1.025;
    r.untilAttacks(1);
    expect(r.battle.elapsed - engaged + 0.05).toBeCloseTo(2.75, 8);
    const first = r.battle.elapsed;
    r.untilAttacks(2);
    expect(r.battle.elapsed - first).toBeCloseTo(2.5, 8);
  });

for (const slowed of [false, true])
  it(`Stone Slammer phases scale with action speed, slowed=${slowed}`, () => {
    const r = stoneSlammerBattle(1, 222),
      factor = slowed ? 2 : 0.5;
    r.unit.native!.effects = slowed
      ? { poison: { since: 0, until: 100, dps: 0, speed: 0, attackSpeed: -0.5 } }
      : { boost: { until: 100, damage: 0, speed: 0, attackSpeed: 1 } };
    while (!r.unit.attacking) r.step();
    const engaged = r.battle.elapsed;
    r.untilAttacks(1);
    expect(r.battle.elapsed - engaged + 0.05).toBeCloseTo(1.7 * factor, 8);
    const first = r.battle.elapsed;
    r.untilAttacks(2);
    expect(r.battle.elapsed - first).toBeCloseTo(2.5 * factor, 8);
  });

it('irregular steps retain Stone Slammer attack remainders', () => {
  const r = stoneSlammerBattle(1, 222),
    releases: number[] = [];
  r.untilAttacks(1);
  releases.push(r.battle.elapsed);
  for (let count = 2; count <= 4; count++) {
    while ((r.unit.native!.attacks ?? 0) < count) r.model.step(0.08);
    releases.push(r.battle.elapsed);
  }
  expect(Math.abs(releases[3] - releases[0] - 7.5)).toBeLessThan(0.08 + 1e-8);
});

for (const afterHit of [false, true])
  it(`Stone Slammer retargets with ${afterHit ? 'remaining recovery' : 'a full fresh charge'}`, () => {
    const r = stoneSlammerBattle(1, 222),
      target = r.battle.buildings.find((b) => b.id === 2)!;
    while (!r.unit.attacking) r.step();
    if (afterHit) r.untilAttacks(1);
    else r.until(r.battle.elapsed + 0.25);
    const previous = r.battle.elapsed;
    r.model.damage(target, target.hp);
    const replacement = makeBuilding(4, 'goldstorage', 13, 10, 18);
    r.battle.buildings.push(replacement);
    const before = r.unit.native!.attacks ?? 0;
    r.untilAttacks(before + 1);
    expect(r.unit.target).toBe(4);
    expect(r.battle.elapsed - previous).toBeCloseTo(afterHit ? 2.25 : 1.7, 8);
  });

for (const version of [221, 222])
  for (const level of [1, 6])
    for (const target of ['garrison', 'air-garrison'] as const)
      it(`Stone Slammer ${level} keeps complete version ${version} real ${target} states`, () => {
        const r = stoneSlammerRecording(level, version, 11.4, target),
          viewer = new GameModel();
        expect(viewer.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(
          true,
        );
        for (const snapshot of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
          viewer.seekReplay(snapshot.at);
          while (viewer.replay!.seeking) viewer.step(0.05);
          expect(JSON.parse(JSON.stringify(viewer.battle))).toEqual(snapshot.battle);
        }
        if (target === 'air-garrison') {
          const guard = r.snapshots.at(-1)!.battle.defenders!.find((d) => d.mode === 'air')!;
          expect(guard.hp).toBe(
            r.snapshots[0].battle.defenders!.find((d) => d.id === guard.id)!.hp,
          );
        }
      });
