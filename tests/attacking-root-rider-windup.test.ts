import { expect, it } from 'vitest';
import { GameModel, makeBuilding } from '../src/game/model';
import { nativeUnitStats } from '../src/game/native-units';
import { spawnGarrisonDefender } from '../src/game/garrison-combat';
import { replayBattle } from '../src/game/replay';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import {
  attackingRootRiderBattle,
  attackingRootRiderRecording,
} from './fixtures/attacking-root-rider';

for (let level = 1; level <= 4; level++)
  for (const x of [11.4, 6.9])
    it(`Root Rider ${level} starts a fresh source swing after approaching from x=${x}`, () => {
      const r = attackingRootRiderBattle(level, undefined, x),
        target = r.battle.buildings.find((b) => b.id === 2)!,
        hp = target.hp;
      while (!r.unit.attacking) r.step();
      const engaged = r.battle.elapsed;
      expect(target.hp).toBe(hp);
      r.untilAttacks(1);
      const first = r.battle.elapsed;
      expect(first - engaged + 0.05).toBeCloseTo(1.5, 8);
      expect(target.hp).toBeCloseTo(hp - nativeUnitStats('rootrider', level).damage, 8);
      r.untilAttacks(2);
      expect(r.battle.elapsed - first).toBeCloseTo(2.2, 8);
    });

it('Root Rider Freeze and stun hold windup and recovery', () => {
  const r = attackingRootRiderBattle();
  while (!r.unit.attacking) r.step();
  const engaged = r.battle.elapsed;
  r.unit.native!.effects = { frozenUntil: engaged + 1 };
  r.untilAttacks(1);
  expect(r.battle.elapsed - engaged + 0.05).toBeCloseTo(2.5, 8);
  const first = r.battle.elapsed;
  r.step();
  r.unit.native!.effects.stunUntil = r.battle.elapsed + 1;
  r.untilAttacks(2);
  expect(r.battle.elapsed - first).toBeCloseTo(3.2, 8);
});
it('Root Rider retargeting spends its remaining 0.7 s recovery once', () => {
  const r = attackingRootRiderBattle();
  r.battle.buildings.push(makeBuilding(3, 'goldstorage', 13, 10, 18));
  r.untilAttacks(1);
  const first = r.battle.elapsed,
    target = r.battle.buildings.find((b) => b.id === 2)!;
  r.model.damage(target, target.hp);
  r.untilAttacks(2);
  expect(r.unit.target).toBe(3);
  expect(r.battle.elapsed - first).toBeCloseTo(2.2, 8);
});
it('Root Rider keeps defense preference over a nearby guard', () => {
  const r = attackingRootRiderBattle(1, undefined, 11.4, 'cannon'),
    guard = spawnGarrisonDefender(r.battle, 'golem', 8, 1, 12.2, 11.5, 0);
  guard.alerted = true;
  guard.stunnedUntil = 100;
  r.untilAttacks(1);
  expect(r.unit.target).toBe(2);
  expect(guard.hp).toBe(guard.maxHp);
});
for (const slowed of [false, true])
  it(`Root Rider scales both attack phases, slowed=${slowed}`, () => {
    const r = attackingRootRiderBattle();
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
    expect(r.battle.elapsed - first).toBeCloseTo(2.2 * scale, 8);
  });

for (const fast of [false, true])
  it(`Root Rider crosses and damages walls with its independent aura, fast=${fast}`, () => {
    const runs = [172, 173].map((version) => {
      const r = attackingRootRiderBattle(1, version, 6.9);
      r.battle.buildings.find((b) => b.id === 2)!.x = 20;
      const wall = makeBuilding(3, 'wall', 12, 11, 15);
      r.battle.buildings.push(wall);
      if (fast)
        r.unit.native!.effects = { boost: { until: 100, damage: 0, speed: 4, attackSpeed: 0 } };
      const hits: { at: number; hp: number }[] = [];
      while (r.unit.x < 14) {
        const hp = wall.hp;
        r.step();
        if (wall.hp !== hp) hits.push({ at: r.battle.elapsed, hp: wall.hp });
      }
      expect(hits.length).toBeGreaterThan(0);
      expect(hits[0].hp).toBe(wall.maxHp - 4000);
      for (let n = 1; n < hits.length; n++) expect(hits[n].at - hits[n - 1].at).toBeCloseTo(0.4, 8);
      expect(r.unit.native!.attacks ?? 0).toBe(0);
      return { x: r.unit.x, y: r.unit.y, hits, hp: wall.hp, maxHp: wall.maxHp };
    });
    expect(runs[1]).toEqual(runs[0]);
    if (fast) expect(runs[1].hp).toBeGreaterThan(0);
    else expect(runs[1].hp).toBe(0);
  });

for (const version of [172, 173])
  for (const level of [1, 4])
    for (const garrison of [false, true])
      it(`Root Rider ${level} ${garrison ? 'lured guard' : 'Cannon'} fight replays version ${version} exactly`, () => {
        const r = attackingRootRiderRecording(version, level, garrison),
          model = new GameModel();
        expect(model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(
          true,
        );
        for (const snapshot of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
          model.seekReplay(snapshot.at);
          while (model.replay!.seeking) model.step(0.05);
          expect(JSON.parse(JSON.stringify(model.battle))).toEqual(snapshot.battle);
        }
        if (garrison && version >= 173) {
          const first = r.snapshots.find((s) => s.at === r.first)!.battle;
          expect(first.projectiles?.some((p) => p.sourceId === r.id)).toBe(false);
          expect(first.defenders!.find((d) => d.id === r.defenderId)!.hp).toBeLessThan(
            first.defenders!.find((d) => d.id === r.defenderId)!.maxHp,
          );
        }
      });

it('only carried Root Rider armies enable the new attack clock', () => {
  const s = structuredClone(attackingRootRiderBattle().data.initial);
  expect(replayBattle(s).nativeRootRiderWindup).toBe(true);
  expect(replayBattle(s, 172).nativeRootRiderWindup).toBeUndefined();
  s.army.rootrider = 0;
  expect(replayBattle(s).nativeRootRiderWindup).toBeUndefined();
});
