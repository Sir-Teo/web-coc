import { describe, expect, it } from 'vitest';
import { ruinDecalBounds } from '../src/game/ruin-decal-bounds';
import { initialSave, makeBuilding } from '../src/game/model';

const world = { left: -640, ox: 896, oy: 112, width: 3072, height: 1835 };
const ellipse = { width: 194, height: 98, originX: 0.5, originY: 0.5, resolution: 3 };
const bounds = (buildings: Parameters<typeof ruinDecalBounds>[0]) =>
  ruinDecalBounds(buildings, world, 0.5, ellipse);

describe('ruin decal allocation', () => {
  it('prepares space for intact buildings before the first destruction', () => {
    const buildings = initialSave().buildings;
    const intact = bounds(buildings);
    expect(bounds(buildings.map((b) => ({ ...b, hp: 0 })))).toEqual(intact);
    expect(intact.width * intact.height).toBeLessThan((1536 * 918) / 3);
    expect(bounds([...buildings].reverse())).toEqual(intact);
  });
  it('covers higher-level camp geometry rather than retaining the smaller fire pit', () => {
    const camp = makeBuilding(1, 'camp', 20, 20, 1);
    const small = bounds([camp]);
    const large = bounds([{ ...camp, level: 8 }]);
    expect(large.left).toBeLessThan(small.left);
    expect(large.width).toBeGreaterThan(small.width);
    expect(large.height).toBeGreaterThan(small.height);
  });
  it('keeps edge layouts inside the original target and on its physical pixel grid', () => {
    const buildings = [
      makeBuilding(1, 'townhall', 0, 47, 1),
      makeBuilding(2, 'townhall', 47, 0, 1),
      makeBuilding(3, 'townhall', 47, 47, 1),
    ];
    const layout = bounds(buildings);
    expect(layout.left).toBeGreaterThanOrEqual(0);
    expect(layout.top).toBeGreaterThanOrEqual(0);
    expect(layout.left + layout.width).toBeLessThanOrEqual(1536);
    expect(layout.top + layout.height).toBeLessThanOrEqual(918);
    for (const n of Object.values(layout)) expect(Number.isInteger(n)).toBe(true);
    expect(layout.width % 2).toBe(0);
    expect(layout.height % 2).toBe(0);
  });
  it('uses a minimal empty target when there are no buildings', () => {
    expect(bounds([])).toEqual({ left: 0, top: 0, width: 2, height: 2 });
  });
});
