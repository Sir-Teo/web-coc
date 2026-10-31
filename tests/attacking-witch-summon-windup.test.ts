import { expect, it } from 'vitest';
import { GameModel, makeBuilding } from '../src/game/model';
import { nativeUnitStats } from '../src/game/native-units';
import { replayBattle } from '../src/game/replay';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { spawnGarrisonDefender } from '../src/game/garrison-combat';
import { nativeTroopFacingTarget } from '../src/game/native-troop-facing';
import { applyShrink } from '../src/game/shrink-trap';
import { emptyArmy, emptySpells } from '../src/game/army';
import {
  attackingWitchSummonBattle,
  attackingWitchSummonRecording,
} from './fixtures/attacking-witch-summons';

function expectRelease(actual: number, expected: number) {
  // A child's scheduled birth can be inside a 50-ms sample, so the first deadline
  // need not be aligned to the next simulation boundary.
  expect(actual).toBeGreaterThanOrEqual(expected - 1e-8);
  expect(actual).toBeLessThan(expected + 0.05 + 1e-8);
}

for (const superTroop of [false, true]) {
  const kind = superTroop ? 'bigboy' : 'skeleton',
    charge = superTroop ? 1.5 : 1,
    period = superTroop ? 2 : 1;
  for (const level of [1, 8])
    for (const x of [11.4, 6.9])
      it(`${kind} from parent ${level} charges only after approaching from ${x}`, () => {
        const r = attackingWitchSummonBattle(level, 213, superTroop, x),
          sourceLevel = superTroop ? 1 : level === 8 ? 2 : 1;
        expect(r.unit.level).toBe(sourceLevel);
        while (!r.unit.attacking) r.step();
        const engaged = r.battle.elapsed,
          active = r.unit.native!.attackWindup!.actionDt,
          target = r.battle.buildings.find((b) => b.id === 2)!,
          hp = target.hp;
        expect(r.unit.native!.attacks ?? 0).toBe(0);
        expect(r.unit.native!.attackWindup!.animationOffset).toBeLessThan(0);
        r.untilAttacks(1);
        const first = r.battle.elapsed;
        expectRelease(first - engaged + active, charge);
        expect(target.hp).toBeCloseTo(hp - nativeUnitStats(kind, sourceLevel).damage, 8);
        r.untilAttacks(3);
        expect(r.battle.elapsed - first).toBeCloseTo(2 * period, 8);
      });

  it(`version 212 retains the immediate ${kind} hit and original state shape`, () => {
    const r = attackingWitchSummonBattle(1, 212, superTroop);
    while (!r.unit.attacking) r.step();
    expect(r.unit.native!.attacks).toBe(1);
    expect(r.unit.native!.attackWindup).toBeUndefined();
  });

  for (const hold of ['frozenUntil', 'stunUntil'] as const)
    it(`${hold} holds the ${kind} charge`, () => {
      const r = attackingWitchSummonBattle(1, 213, superTroop);
      while (!r.unit.attacking) r.step();
      const engaged = r.battle.elapsed,
        active = r.unit.native!.attackWindup!.actionDt;
      r.unit.native!.effects = { [hold]: engaged + 1 };
      r.untilAttacks(1);
      expectRelease(r.battle.elapsed - engaged + active, charge + 1);
    });

  for (const slowed of [false, true])
    it(`${kind} scales its first and repeat swings, slowed=${slowed}`, () => {
      const r = attackingWitchSummonBattle(1, 213, superTroop);
      r.unit.native!.effects = slowed
        ? { poison: { since: 0, until: 100, dps: 0, speed: 0, attackSpeed: -0.5 } }
        : { boost: { until: 100, damage: 0, speed: 0, attackSpeed: 1 } };
      while (!r.unit.attacking) r.step();
      const engaged = r.battle.elapsed,
        active = r.unit.native!.attackWindup!.actionDt,
        scale = slowed ? 2 : 0.5;
      r.untilAttacks(1);
      const first = r.battle.elapsed;
      expectRelease(first - engaged + active * scale, charge * scale);
      r.untilAttacks(3);
      expect(r.battle.elapsed - first).toBeCloseTo(2 * period * (slowed ? 2 : 0.5), 8);
    });

  it(`Shrink slows ${kind} without changing its damage`, () => {
    const r = attackingWitchSummonBattle(1, 213, superTroop);
    applyShrink(r.unit, r.battle.elapsed);
    while (!r.unit.attacking) r.step();
    const engaged = r.battle.elapsed,
      active = r.unit.native!.attackWindup!.actionDt,
      target = r.battle.buildings.find((b) => b.id === 2)!,
      hp = target.hp;
    r.untilAttacks(1);
    expectRelease(r.battle.elapsed - engaged + active * 2, charge * 2);
    expect(target.hp).toBeCloseTo(hp - nativeUnitStats(kind, r.unit.level).damage, 8);
  });

  it(`${kind} uses direct ground-only defender hits`, () => {
    const r = attackingWitchSummonBattle(1, 213, superTroop),
      guard = spawnGarrisonDefender(r.battle, 'golem', 8, 1, r.unit.x + 0.1, r.unit.y, 0),
      air = spawnGarrisonDefender(r.battle, 'dragon', 7, 1, r.unit.x + 0.05, r.unit.y, 0);
    for (const d of [guard, air]) {
      d.alerted = true;
      d.stunnedUntil = 100;
    }
    while (!r.unit.attacking) r.step();
    const hp = guard.hp;
    r.untilAttacks(1);
    expect(guard.hp).toBeCloseTo(hp - nativeUnitStats(kind, r.unit.level).damage, 8);
    expect(air.hp).toBe(air.maxHp);
    expect(r.battle.projectiles?.some((p) => p.sourceId === r.unit.id)).toBe(false);
  });

  it(`${kind} spends a fresh charge after replacing a building`, () => {
    const r = attackingWitchSummonBattle(1, 213, superTroop);
    r.battle.buildings.push(makeBuilding(3, 'goldstorage', 13, 10, 18));
    while (!r.unit.attacking) r.step();
    r.until(r.battle.elapsed + 0.2);
    const replaced = r.battle.elapsed,
      target = r.battle.buildings.find((b) => b.id === 2)!;
    r.model.damage(target, target.hp);
    r.untilAttacks(1);
    expect(r.unit.target).toBe(3);
    expect(r.battle.elapsed - replaced).toBeCloseTo(charge, 8);
  });

  it(`${kind} retains remaining recovery once when switching after a hit`, () => {
    const r = attackingWitchSummonBattle(1, 213, superTroop);
    r.battle.buildings.push(makeBuilding(3, 'goldstorage', 13, 10, 18));
    r.untilAttacks(1);
    const first = r.battle.elapsed;
    r.until(first + 0.1);
    const target = r.battle.buildings.find((b) => b.id === 2)!;
    r.model.damage(target, target.hp);
    r.untilAttacks(2);
    expect(r.unit.target).toBe(3);
    expect(r.battle.elapsed - first).toBeCloseTo(period + (superTroop ? 0 : 0.1), 8);
  });

  it(`${kind} partial thaw keeps its active charge remainder`, () => {
    const r = attackingWitchSummonBattle(1, 213, superTroop);
    while (!r.unit.attacking) r.step();
    const engaged = r.battle.elapsed,
      active = r.unit.native!.attackWindup!.actionDt;
    r.unit.native!.effects = { frozenUntil: engaged + 1.025 };
    r.untilAttacks(1);
    expectRelease(r.battle.elapsed - engaged + active, charge + 1.025);
  });

  it(`${kind} retains repeat remainders with irregular steps`, () => {
    const r = attackingWitchSummonBattle(1, 213, superTroop),
      deltas = [0.02, 0.075, 0.04, 0.1],
      hits: number[] = [];
    let index = 0;
    while (hits.length < 4) {
      if (r.battle.elapsed > 20) throw Error('Irregular summon attack checkpoint expired');
      const count = r.unit.native!.attacks ?? 0;
      r.model.step(deltas[index++ % deltas.length]);
      if ((r.unit.native!.attacks ?? 0) > count) hits.push(r.battle.elapsed);
    }
    for (let n = 1; n < hits.length; n++)
      expect(Math.abs(hits[n] - hits[0] - n * period)).toBeLessThan(0.1 + 1e-8);
  });

  it(`a defeated ${kind} cannot finish its swing`, () => {
    const r = attackingWitchSummonBattle(1, 213, superTroop),
      target = r.battle.buildings.find((b) => b.id === 2)!;
    while (!r.unit.attacking) r.step();
    const hp = target.hp;
    r.unit.hp = 0;
    r.until(r.battle.elapsed + charge + 0.2);
    expect(target.hp).toBe(hp);
  });

  it(`${kind} charges a blocking Wall and faces the committed target`, () => {
    const r = attackingWitchSummonBattle(1, 213, superTroop, 6.9);
    for (let y = 0; y < 48; y++) r.battle.buildings.push(makeBuilding(2000 + y, 'wall', 12, y, 15));
    const guard = spawnGarrisonDefender(r.battle, 'golem', 8, 1, 17.4, r.unit.y, 0);
    guard.alerted = true;
    guard.stunnedUntil = 100;
    while (!r.unit.attacking) r.step();
    const engaged = r.battle.elapsed,
      ref = r.unit.native!.attackWindup!.target!;
    const wall = r.battle.buildings.find((b) => b.id === ref.id)!;
    expect(wall.kind).toBe('wall');
    expect(nativeTroopFacingTarget(r.battle, r.unit)).toEqual({ x: wall.x + 0.5, y: wall.y + 0.5 });
    r.untilAttacks(1);
    expect(r.battle.elapsed - engaged + 0.05).toBeCloseTo(charge, 8);
    expect(wall.hp).toBeCloseTo(wall.maxHp - nativeUnitStats(kind, r.unit.level).damage, 8);
  });
}

it('only Witch parent armies enable these summoned melee phases', () => {
  const r = attackingWitchSummonBattle();
  expect(replayBattle(r.data.initial, 213).nativeWitchSummonWindup).toBe(true);
  expect(replayBattle(r.data.initial, 212).nativeWitchSummonWindup).toBeUndefined();
  r.data.initial.army.witch = 0;
  expect(replayBattle(r.data.initial, 213).nativeWitchSummonWindup).toBeUndefined();
  r.data.initial.army.superwitch = 1;
  expect(replayBattle(r.data.initial, 213).nativeWitchSummonWindup).toBe(true);
});

it('a real Skeleton Spell keeps its own attack controller alongside a carried Witch', () => {
  const model = new GameModel();
  model.state.king = undefined;
  model.state.obstacles = [];
  model.state.buildings = [
    makeBuilding(1, 'townhall', 36, 36, 1),
    makeBuilding(2, 'goldstorage', 13, 10, 18),
  ];
  model.state.army = { ...emptyArmy(), witch: 1 };
  model.state.spells = { ...emptySpells(), skeleton: 1 };
  model.startBattle(0, true);
  expect(model.battle!.nativeWitchSummonWindup).toBe(true);
  model.activeSpell = 'skeleton';
  expect(model.castSpell(13.2, 11.5)).toBe(true);
  const summoned = () => model.battle!.units.find((u) => u.kind === 'spellskeletonshielded');
  while (!summoned()?.attacking) {
    if (model.battle!.elapsed > 5) throw Error('Skeleton Spell attack checkpoint expired');
    model.step(0.05);
  }
  expect(summoned()!.native!.attacks).toBeGreaterThanOrEqual(1);
  expect(summoned()!.native!.attackWindup).toBeUndefined();
});

for (const version of [212, 213])
  for (const level of [1, 8])
    for (const superTroop of [false, true])
      it(`actual parent ${level} super=${superTroop} summons replay version ${version} in both directions`, () => {
        const r = attackingWitchSummonRecording(level, version, superTroop),
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
