import { describe, expect, it } from 'vitest';
import { findSubtilePath } from '../src/game/subtile-path';
import { findPath } from '../src/game/model';

describe('subtile troop targeting (audit crash)', () => {
  it('routes toward a troop without throwing', () => {
    const start = { x: 5.5, y: 5.5 };
    // Units carry `level`, which the old `'level' in target` check mistook for a building.
    const troopTarget = { x: 10.5, y: 10.5, kind: 'barbarian', level: 5 } as any;
    expect(() => findSubtilePath(start, troopTarget, [], 1)).not.toThrow();
    expect(() => findPath(start, troopTarget, [], 1, true)).not.toThrow();
  });

  it('returns a finite approach point when the cell centre is inside the footprint', () => {
    // Start inside a 3x3 building footprint with melee range: distance is zero.
    const building = { id: 1, kind: 'townhall', x: 10, y: 10, level: 1, hp: 100 } as any;
    const path = findSubtilePath({ x: 11.5, y: 11.5 }, building, [building], 0.4);
    for (const p of path) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    }
    const legacy = findPath({ x: 11.5, y: 11.5 }, building, [building], 0.4, false);
    for (const p of legacy) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    }
  });
});
