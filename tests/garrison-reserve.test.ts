import { expect, it } from 'vitest';
import {
  createGarrisonReserve,
  garrisonStats,
  releaseGarrisonTroop,
  type GarrisonTarget,
  type GarrisonTroop,
} from '../src/game/garrison-reserve';

const roster: GarrisonTroop[] = [
  { kind: 'dragon', level: 7, count: 1 },
  { kind: 'balloon', level: 8, count: 3 },
];
const castle = { id: 102, hp: 3000, centerX: 14.5, centerY: 21.5 };
const ground: GarrisonTarget = { id: 1, hp: 100, x: 15, y: 22, flying: false };
const air: GarrisonTarget = { ...ground, id: 2, flying: true };

it('keeps all 35 source housing spaces and drains the finite reserve in housing order', () => {
  const reserve = createGarrisonReserve(castle.id, roster);
  expect(
    reserve.troops.reduce((n, t) => n + t.count * garrisonStats(t.kind, t.level).housing, 0),
  ).toBe(35);
  const releases = Array.from({ length: 6 }, (_, i) =>
    releaseGarrisonTroop(reserve, castle, [ground], i),
  );
  expect(releases.map((r) => r?.kind ?? null)).toEqual([
    'balloon',
    'balloon',
    'balloon',
    'dragon',
    null,
    null,
  ]);
  expect(releases.slice(0, 4).map((r) => r!.ordinal)).toEqual([0, 1, 2, 3]);
  expect(reserve.troops.map((t) => t.count)).toEqual([0, 0]);
  expect(roster.map((t) => t.count)).toEqual([1, 3]);
});

it('skips ground-only reserves for air triggers, then releases them when ground troops arrive', () => {
  const reserve = createGarrisonReserve(castle.id, roster);
  expect(releaseGarrisonTroop(reserve, castle, [air], 0)).toMatchObject({
    kind: 'dragon',
    targetId: 2,
  });
  expect(releaseGarrisonTroop(reserve, castle, [air], 1)).toBeNull();
  expect(reserve.troops[0].count).toBe(3);
  expect(releaseGarrisonTroop(reserve, castle, [air, ground], 2)).toMatchObject({
    kind: 'balloon',
    targetId: 1,
  });
});

it('does not release for dead, future, ejected or out-of-radius troops', () => {
  const reserve = createGarrisonReserve(castle.id, roster);
  const invalid = [
    { ...ground, hp: 0 },
    { ...ground, spawnedAt: 1 },
    { ...ground, ejected: true },
    { ...ground, x: castle.centerX + 13, y: castle.centerY },
    { ...ground, x: NaN },
  ];
  for (const target of invalid)
    expect(releaseGarrisonTroop(reserve, castle, [target], 0)).toBeNull();
  expect(reserve.released).toBe(0);
  expect(releaseGarrisonTroop(reserve, castle, [{ ...ground, spawnedAt: 1 }], 1)).not.toBeNull();
});

it('rechecks Castle survival, guard mode and the current radius at each search', () => {
  const reserve = createGarrisonReserve(castle.id, roster, 'sleep');
  expect(releaseGarrisonTroop(reserve, castle, [ground], 0)).toBeNull();
  reserve.mode = 'guard';
  expect(releaseGarrisonTroop(reserve, { ...castle, hp: 0 }, [ground], 1)).toBeNull();
  expect(releaseGarrisonTroop(reserve, { ...castle, id: 99 }, [ground], 1)).toBeNull();
  expect(releaseGarrisonTroop(reserve, castle, [ground], 2)).not.toBeNull();
  expect(releaseGarrisonTroop(reserve, castle, [], 3)).toBeNull();
  expect(reserve.released).toBe(1);
});

it('selects the closest valid target with stable ID ties independent of input order', () => {
  const targets = [air, { ...ground, id: 9 }, ground, { ...ground, id: 7, x: 18 }];
  for (const input of [targets, [...targets].reverse()]) {
    const reserve = createGarrisonReserve(castle.id, roster);
    expect(releaseGarrisonTroop(reserve, castle, input, 0)?.targetId).toBe(1);
  }
});

it('preserves reserve progress through JSON serialization without sharing setup state', () => {
  const reserve = createGarrisonReserve(castle.id, roster);
  releaseGarrisonTroop(reserve, castle, [ground], 0);
  const restored = JSON.parse(JSON.stringify(reserve));
  for (let i = 1; i < 6; i++)
    expect(releaseGarrisonTroop(restored, castle, [ground], i)).toEqual(
      releaseGarrisonTroop(reserve, castle, [ground], i),
    );
  expect(restored).toEqual(reserve);
});

it('rejects unresolved source levels, unsupported families and invalid counts atomically', () => {
  for (const troops of [
    [{ kind: 'dragon', level: 3, count: 1 }],
    [{ kind: 'golem', level: 7, count: 1 }],
    [{ kind: 'unknown', level: 8, count: 1 }],
    // Secondary, summoned and trap-spawned units never occupy a bunker.
    [{ kind: 'golemite', level: 8, count: 1 }],
    [{ kind: 'royalghost', level: 7, count: 1 }],
    [{ kind: 'goblin', level: 8, count: 1 }],
    [{ ...roster[0], count: 0 }],
    [{ ...roster[0], count: -1 }],
    [{ ...roster[0], count: 0.5 }],
    [{ ...roster[0], count: 701 }],
    [roster[0], { ...roster[1], level: 7 }],
  ])
    expect(() => createGarrisonReserve(castle.id, troops as GarrisonTroop[])).toThrow();
  expect(() => createGarrisonReserve(0, roster)).toThrow();
  expect(createGarrisonReserve(castle.id, [roster[1], roster[1]]).troops).toEqual([
    { ...roster[1], count: 6 },
  ]);
});

it('uses the original above-home-cap HP, attack intervals, target layers and death damage', () => {
  expect(garrisonStats('dragon', 7)).toMatchObject({
    hp: 3900,
    damage: 387.5,
    rate: 1.25,
    speed: 2,
    range: 2.5,
    splash: 0.3,
    airTargets: true,
    groundTargets: true,
  });
  expect(garrisonStats('balloon', 8)).toMatchObject({
    hp: 840,
    damage: 708,
    rate: 3,
    speed: 1.3,
    range: 0,
    splash: 1.2,
    selfAsAoeCenter: true,
    airTargets: false,
    groundTargets: true,
    newTargetDelay: 2.25,
    deathDamage: 268,
    deathRadius: 1.2,
    deathDelay: 0.416,
  });
});
