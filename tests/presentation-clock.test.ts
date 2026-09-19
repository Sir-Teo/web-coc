import { expect, it } from 'vitest';
import type { Battle } from '../src/game/model';
import {
  PRESENTATION_GRACE,
  presentationLive,
  presentationProjectiles,
  presentationTime,
  settlePresentation,
} from '../src/game/presentation-clock';
import { cannonEffectPoses } from '../src/game/cannon-effects';
import { battleBuilding, battleUnit } from '../src/game/battle-index';

const iso = (x: number, y: number) => ({ x: (x - y) * 32, y: (x + y) * 16 });
const battle = () =>
  ({
    elapsed: 30,
    finished: false,
    projectiles: [
      { id: 'a', launched: 29.8, impact: 30.5 },
      { id: 'b', launched: 29.9, impact: 31.5 },
    ],
    units: [{ id: 4, hp: 10 }],
    buildings: [{ id: 9, hp: 10 }],
  }) as unknown as Battle;

it('keeps sampling transient effects for the grace window after the battle finishes', () => {
  const b = battle();
  expect(presentationLive(b, 1000)).toBe(true);
  expect(presentationTime(b, 1000)).toBe(30);
  // The final destruction lands on the finishing tick.
  const destroyed = (at: number) =>
    cannonEffectPoses(1, 'destroy', 0, 'Building Destroyed', 30, at, iso(10, 10), false);
  const at0 = destroyed(presentationTime(b, 1000));
  const projectiles = b.projectiles;
  b.finished = true;
  b.projectiles = [];
  expect(presentationLive(b, 1000)).toBe(true);
  expect(presentationTime(b, 1000)).toBe(30);
  expect(presentationTime(b, 1600)).toBeCloseTo(30.6);
  const later = destroyed(presentationTime(b, 1600));
  expect(later.length).toBeGreaterThan(0);
  expect(later).not.toEqual(at0);
  // Shots in flight at the finish keep flying until their impact.
  expect(presentationProjectiles(b, 1600).map((p) => p.id)).toEqual(['b']);
  expect(projectiles).toHaveLength(2);
  expect(presentationLive(b, 1000 + PRESENTATION_GRACE * 1000 - 1)).toBe(true);
  expect(presentationLive(b, 1000 + PRESENTATION_GRACE * 1000)).toBe(false);
  expect(presentationTime(b, 99999)).toBe(30 + PRESENTATION_GRACE);
  expect(presentationProjectiles(b, 99999)).toEqual([]);
});

it('grants no grace to a battle first seen already finished, and settles on request', () => {
  const seek = battle();
  seek.finished = true;
  expect(presentationLive(seek, 5000)).toBe(false);
  const b = battle();
  presentationLive(b, 0);
  b.finished = true;
  expect(presentationLive(b, 10)).toBe(true);
  settlePresentation(b);
  expect(presentationLive(b, 10)).toBe(false);
});

it('indexes units and buildings per simulation sample', () => {
  const b = battle();
  expect(battleUnit(b, 4)).toBe(b.units[0]);
  expect(battleBuilding(b, 9)).toBe(b.buildings[0]);
  expect(battleUnit(b, null)).toBeUndefined();
  b.units.push({ id: 5, hp: 1 } as Battle['units'][number]);
  expect(battleUnit(b, 5)).toBe(b.units[1]);
  b.elapsed += 0.05;
  b.units = [];
  expect(battleUnit(b, 4)).toBeUndefined();
});
