import { expect, it } from 'vitest';
import { nativeUnitStats } from '../src/game/native-units';
import { nativeDirectBattle } from './fixtures/native-direct-attacks';
import { replayBattle } from '../src/game/replay';
import { hurtUnit } from '../src/game/native-status';
import { GameModel, makeBuilding } from '../src/game/model';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { superMinerRecording } from './fixtures/attacking-super-miner';
import { nativeTargetingSpellRecording } from './fixtures/native-targeting-spells';
import { applyShrink } from '../src/game/shrink-trap';
import { spawnGarrisonDefender } from '../src/game/garrison-combat';

for (let level = 1; level <= 12; level++)
  for (const x of [11.4, 6.9])
    it(`Super Miner ${level} spends its quarter-second charge and retains exact repeat remainders from ${x}`, () => {
      const r = nativeDirectBattle('superminer', level, 208, x),
        target = r.battle.buildings.find((b) => b.id === 2)!,
        stats = nativeUnitStats('superminer', level),
        hp = target.hp;
      while (!r.unit.attacking) r.step();
      const engaged = r.battle.elapsed;
      expect(r.unit.native!.burrowed).toBe(false);
      expect(target.hp).toBe(hp);
      expect(r.unit.native!.attackWindup!.animationOffset).toBeLessThan(0);
      r.untilAttacks(1);
      const first = r.battle.elapsed;
      expect(first - engaged + 0.05).toBeCloseTo(0.25, 8);
      expect(target.hp).toBe(hp - stats.damage);
      r.untilAttacks(2);
      expect(r.battle.elapsed - first).toBeCloseTo(0.25, 8);
      expect(target.hp).toBe(hp - 2 * stats.damage);
      let previous = target.hp;
      r.untilAttacks(6);
      previous = target.hp;
      r.untilAttacks(7);
      expect(r.battle.elapsed - first).toBeCloseTo(1.5, 8);
      expect(previous - target.hp).toBe(stats.damageRamp!.dps[1] * stats.rate);
      r.untilAttacks(12);
      previous = target.hp;
      r.untilAttacks(13);
      expect(r.battle.elapsed - first).toBeCloseTo(3, 8);
      expect(previous - target.hp).toBe(stats.damageRamp!.dps[2] * stats.rate);
    });

for (const x of [11.4, 6.9])
  it(`version207 retains immediate first release and the old 0.30-second repeat from ${x}`, () => {
    const r = nativeDirectBattle('superminer', 1, 207, x);
    r.untilAttacks(1);
    const first = r.battle.elapsed;
    expect(first).toBeCloseTo(x === 11.4 ? 0.3 : 1.45, 8);
    expect(r.unit.native!.attackWindup).toBeUndefined();
    r.untilAttacks(2);
    expect(r.battle.elapsed - first).toBeCloseTo(0.3, 8);
  });

it('Freeze holds the initial Super Miner charge before ramping begins', () => {
  const r = nativeDirectBattle('superminer', 1, 208);
  while (!r.unit.attacking) r.step();
  const engaged = r.battle.elapsed;
  r.unit.native!.effects = { frozenUntil: engaged + 1 };
  r.untilAttacks(1);
  expect(r.battle.elapsed - engaged + 0.05).toBeCloseTo(1.25, 8);
  expect(r.unit.native!.damageRamp!.startedAt).toBe(r.battle.elapsed);
});

it('a replacement target starts a new charge and a fresh damage ramp', () => {
  const r = nativeDirectBattle('superminer', 1, 208),
    target = r.battle.buildings.find((b) => b.id === 2)!;
  r.battle.buildings.push(makeBuilding(3, 'goldstorage', 13, 10, 18));
  r.untilAttacks(7);
  r.model.damage(target, target.hp);
  r.step();
  const changed = r.battle.elapsed;
  r.untilAttacks(8);
  expect(r.battle.elapsed - changed + 0.05).toBeCloseTo(0.25, 8);
  expect(r.unit.native!.damageRamp).toMatchObject({ targetId: 3, startedAt: r.battle.elapsed });
  expect(r.battle.buildings.find((b) => b.id === 3)!.hp).toBe(4180);
});

it('a moving defender outside reach cancels the exposed swing before burrowing again', () => {
  const r = nativeDirectBattle('superminer', 1, 208),
    guard = spawnGarrisonDefender(r.battle, 'golem', 8, 1, 11.9, 11.5, 0);
  guard.alerted = true;
  guard.stunnedUntil = 100;
  r.step();
  expect(r.unit.native!.attackWindup).toMatchObject({
    engaged: true,
    target: { id: guard.id, building: false },
  });
  guard.x = 18;
  r.step();
  expect(r.unit.native!.attackWindup!.engaged).toBeUndefined();
  expect(r.unit.native!.burrowed).toBe(true);
  expect(guard.hp).toBe(guard.maxHp);
});

it('defeat retains the original delayed death bomb independently of the pending charge', () => {
  const r = nativeDirectBattle('superminer', 1, 208),
    target = r.battle.buildings.find((b) => b.id === 2)!;
  while (!r.unit.attacking) r.step();
  hurtUnit(r.battle, r.unit, r.unit.hp);
  r.step();
  const blast = r.battle.nativeDeaths![0];
  expect(blast).toMatchObject({ sourceId: r.unit.id, damage: 800, radius: 2, air: false });
  expect(blast.at - r.unit.defeatedAt!).toBeCloseTo(1, 8);
  r.until(blast.at - 0.05);
  expect(target.hp).toBe(target.maxHp);
  r.until(blast.at + 0.05);
  expect(target.hp).toBe(target.maxHp - 800);
});

it('only a carried Super Miner enables the new controller', () => {
  const r = nativeDirectBattle('superminer');
  expect(replayBattle(r.data.initial, 207).nativeSuperMinerWindup).toBeUndefined();
  expect(replayBattle(r.data.initial, 208).nativeSuperMinerWindup).toBe(true);
  r.data.initial.army.superminer = 0;
  expect(replayBattle(r.data.initial, 208).nativeSuperMinerWindup).toBeUndefined();
});

for (const slowed of [false, true])
  it(`action speed scales Super Miner fresh and repeat clocks, slowed=${slowed}`, () => {
    const r = nativeDirectBattle('superminer', 1, 208);
    r.step();
    r.unit.native!.effects = slowed
      ? { poison: { since: 0, until: 100, dps: 0, speed: 0, attackSpeed: -0.5 } }
      : { boost: { until: 100, damage: 0, speed: 0, attackSpeed: 1 } };
    while (!r.unit.attacking) r.step();
    const engaged = r.battle.elapsed;
    r.untilAttacks(1);
    const first = r.battle.elapsed,
      wanted = slowed ? 0.5 : 0.125;
    expect(Math.abs(first - engaged + 0.05 - wanted)).toBeLessThan(0.05 + 1e-8);
    r.untilAttacks(7);
    expect(Math.abs(r.battle.elapsed - first - 6 * wanted)).toBeLessThan(0.05 + 1e-8);
  });

it('irregular action steps retain quarter-second timer remainders', () => {
  const r = nativeDirectBattle('superminer', 1, 208),
    times: number[] = [];
  r.step();
  for (let n = 1; n <= 9; n++) {
    while ((r.unit.native!.attacks ?? 0) < n) r.model.step(0.08);
    times.push(r.unit.native!.lastAttackAt!);
  }
  expect(Math.abs(times[8] - times[0] - 2)).toBeLessThan(0.08 + 1e-8);
});

it('Shrink scales the exposed charge while retaining source hit damage', () => {
  const r = nativeDirectBattle('superminer', 1, 208),
    target = r.battle.buildings.find((b) => b.id === 2)!;
  applyShrink(r.unit, 0);
  while (!r.unit.attacking) r.step();
  const engaged = r.battle.elapsed;
  r.untilAttacks(1);
  expect(r.battle.elapsed - engaged + 0.05).toBeCloseTo(0.5, 8);
  expect(target.hp).toBe(target.maxHp - 20);
});

for (const kind of ['bomb', 'airbomb', 'seekingairmine'] as const)
  it(`Super Miner keeps ${kind} eligibility after surfacing for its charge`, () => {
    const r = nativeDirectBattle('superminer', 1, 208);
    while (!r.unit.attacking) r.step();
    const trap = makeBuilding(3, kind, Math.floor(r.unit.x), Math.floor(r.unit.y), 1);
    r.battle.buildings.push(trap);
    r.step();
    expect(r.battle.traps[trap.id] !== undefined).toBe(kind === 'bomb');
  });

for (const version of [207, 208])
  for (const level of [1, 4])
    it(`actual Angry Spell ${level} preserves version${version} Super Miner retarget states`, () => {
      const r = nativeTargetingSpellRecording('AngrySpell', level, version, 'superminer', 2.5, 0.1),
        viewer = new GameModel();
      expect(viewer.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(true);
      for (const s of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
        viewer.seekReplay(s.at);
        while (viewer.replay!.seeking) viewer.step(0.05);
        expect(JSON.parse(JSON.stringify(viewer.battle))).toEqual(s.battle);
      }
    });

for (const version of [207, 208])
  for (const level of [1, 12])
    for (const target of ['storage', 'cannon', 'golem'] as const)
      it(`actual Super Miner ${level} ${target} reconstructs all ramp stages for version${version}`, () => {
        const r = superMinerRecording(version, level, target),
          viewer = new GameModel();
        expect(r.second - r.first).toBeCloseTo(version === 208 ? 0.25 : 0.3, 8);
        expect(r.hits).toHaveLength(13);
        expect(viewer.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(
          true,
        );
        for (const s of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
          viewer.seekReplay(s.at);
          while (viewer.replay!.seeking) viewer.step(0.05);
          expect(JSON.parse(JSON.stringify(viewer.battle))).toEqual(s.battle);
        }
      });
