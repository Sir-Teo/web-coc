import { expect, it } from 'vitest';
import type { Battle } from '../src/game/model';
import { teslaRevealShake, TESLA_REVEAL_SHAKE } from '../src/game/tesla-shake';

const battle = (elapsed: number, revealedTeslas = { 3: 0.05 }) => ({
  elapsed,
  started: true,
  finished: false,
  revealedTeslas,
});
const rest = { x: 0, y: 0 };

it('uses the pinned 200 ms reveal window in live battles and replays', () => {
  expect(TESLA_REVEAL_SHAKE).toEqual({ strength: 20, duration: 0.2, replay: true });
  for (const elapsed of [0, 0.049, 0.05, 0.25, 0.3, 1000])
    expect(teslaRevealShake(battle(elapsed), false)).toEqual(rest);
  for (const elapsed of [0.1, 0.15, 0.2, 0.249]) {
    const live = teslaRevealShake(battle(elapsed), false);
    expect(live).not.toEqual(rest);
    expect(teslaRevealShake(battle(elapsed), false, true)).toEqual(live);
  }
});

it('reconstructs motion without retaining events or mutating battle state', () => {
  const b = Object.freeze(battle(0.15));
  Object.freeze(b.revealedTeslas);
  const before = structuredClone(b);
  const offset = teslaRevealShake(b, false);
  teslaRevealShake(battle(100), false);
  teslaRevealShake(battle(0), false);
  for (let i = 0; i < 100; i++) expect(teslaRevealShake(b, false)).toEqual(offset);
  expect(b).toEqual(before);
  expect(teslaRevealShake({ ...b, revealedTeslas: { 4: 0.05 } }, false)).not.toEqual(offset);
});

it('suppresses motion immediately for reduced motion, scouting, finish and home', () => {
  const b = battle(0.15);
  expect(teslaRevealShake(b, true)).toEqual(rest);
  expect(teslaRevealShake({ ...b, started: false }, false)).toEqual(rest);
  expect(teslaRevealShake({ ...b, finished: true }, false)).toEqual(rest);
  expect(teslaRevealShake({ ...b, revealedTeslas: undefined }, false)).toEqual(rest);
  expect(teslaRevealShake(null, false)).toEqual(rest);
});

it('bounds simultaneous reveals independently of insertion order and source survival', () => {
  const reveals = Array.from({ length: 100 }, (_, i) => [i + 1, 0.05]);
  const b = { ...battle(0.1), revealedTeslas: Object.fromEntries(reveals) };
  for (let i = 0; i <= 200; i++) {
    b.elapsed = 0.05 + i / 1000;
    const a = teslaRevealShake(b, false);
    expect(Math.abs(a.x)).toBeLessThanOrEqual(6.4);
    expect(Math.abs(a.y)).toBeLessThanOrEqual(6.4);
    expect(
      teslaRevealShake({ ...b, revealedTeslas: Object.fromEntries([...reveals].reverse()) }, false),
    ).toEqual(a);
    expect(teslaRevealShake({ ...b, buildings: [] } as unknown as Battle, false)).toEqual(a);
  }
});
