import { expect, it } from 'vitest';
import type { Unit } from '../src/game/model';
import { tickInfernoCombat } from '../src/game/inferno-combat';
import { createInfernoScheduler } from '../src/game/inferno-scheduler';

const unit = (id: number, x = 2, kind: Unit['kind'] = 'swordsman'): Unit => ({
  id,
  kind,
  x,
  y: 1,
  hp: 1000,
  maxHp: 1000,
  cooldown: 0,
  target: null,
  path: [],
  pathAt: 0,
  attacking: false,
});
const tower = { x: 0, y: 0 };
it('damages the retained target with source pulse power and records beam endpoints', () => {
  const state = createInfernoScheduler(1, 'single');
  const target = unit(2, 3, 'dragon');
  tickInfernoCombat(state, tower, [target], 0.064);
  const nearer = unit(1);
  const hits = tickInfernoCombat(state, tower, [nearer, target], 0.128);
  expect(target.hp).toBe(996.16);
  expect(nearer.hp).toBe(1000);
  expect(hits).toEqual([
    {
      slot: 0,
      targetId: 2,
      stage: 0,
      dps: 30,
      intervalMs: 128,
      at: 0.128,
      fromX: 1,
      fromY: 1,
      targetX: 3,
      targetY: 1,
      toAir: true,
      damage: 3.84,
      killed: false,
    },
  ]);
});

it('uses single/multi ranges and excludes future, ejected and dead units', () => {
  const boundary = unit(1, 10),
    outside = unit(2, 10.01);
  const future = { ...unit(3), spawnedAt: 1 },
    ejected = { ...unit(4), ejected: true },
    dead = { ...unit(5), hp: 0 };
  const single = createInfernoScheduler(1, 'single');
  tickInfernoCombat(single, tower, [future, ejected, dead, outside, boundary], 0.064);
  expect(single.slots[0].targetId).toBe(1);
  const multi = createInfernoScheduler(1, 'multi');
  tickInfernoCombat(multi, tower, [unit(6, 11), unit(7, 11.01)], 0.064);
  expect(multi.slots.map((s) => s.targetId)).toEqual([6, null, null, null, null]);
});

it('kills clamp HP, record exact death time and defer only that beam replacement', () => {
  const state = createInfernoScheduler(1, 'multi');
  const target = { ...unit(1), hp: 1 };
  tickInfernoCombat(state, tower, [target], 0.064);
  expect(tickInfernoCombat(state, tower, [target], 0.128)[0].killed).toBe(true);
  expect(target.hp).toBe(0);
  expect(target.defeatedAt).toBe(0.128);
  expect(state.slots[0].replacementMs).toBe(50);
});

it('resolves equal distances by ID and produces identical state after serialization', () => {
  const first = createInfernoScheduler(8, 'multi');
  const units = [6, 5, 4, 3, 2, 1, 7].map((id) => unit(id));
  tickInfernoCombat(first, tower, units, 0.064);
  expect(first.slots.map((s) => s.targetId)).toEqual([1, 2, 3, 4, 5, 6]);
  const second = JSON.parse(JSON.stringify(first));
  const copies = JSON.parse(JSON.stringify(units));
  for (let tick = 2; tick <= 100; tick++) {
    expect(tickInfernoCombat(first, tower, units, tick * 0.064)).toEqual(
      tickInfernoCombat(second, tower, copies, tick * 0.064),
    );
  }
  expect(second).toEqual(first);
  expect(copies).toEqual(units);
});
