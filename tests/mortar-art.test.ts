import { describe, it, expect } from 'vitest';
import { asset, buildingTexture } from '../src/game/data';
import { MORTAR_ART_LEVELS, MORTAR_ART, mortarAsset, mortarTexture } from '../src/game/mortar-art';
import { mortarBounds, mortarPoses } from '../src/game/mortar-poses';

describe('original Mortar artwork', () => {
  it('selects all eighteen normal levels in the world and interface', () => {
    expect(MORTAR_ART_LEVELS).toEqual(Array.from({ length: 18 }, (_, i) => i + 1));
    expect(new Set(MORTAR_ART_LEVELS.map(mortarTexture)).size).toBe(18);
    for (const level of MORTAR_ART_LEVELS) {
      expect(asset('mortar', level)).toBe(mortarAsset(level));
      expect(buildingTexture('mortar', level)).toBe(mortarTexture(level));
    }
  });

  it('registers original portraits and normal, construction, scaffold and ruin geometry to one footprint', () => {
    expect(MORTAR_ART.originX * MORTAR_ART.width).toBeCloseTo(84 * MORTAR_ART.scale, 12);
    expect(MORTAR_ART.originY * MORTAR_ART.height).toBeCloseTo(102 * MORTAR_ART.scale, 12);
    for (const level of MORTAR_ART_LEVELS)
      for (const state of ['setup', 'constructing', 'upgrading', 'ruin'] as const) {
        const bounds = mortarBounds(level, state);
        expect(bounds.every(Number.isFinite)).toBe(true);
        expect(bounds[2] - bounds[0]).toBeGreaterThan(50);
        expect(bounds[3] - bounds[1]).toBeGreaterThan(20);
        for (let turret = 0; turret < 360; turret += 45) {
          const poses = mortarPoses(level, { state, turret });
          expect(poses.length).toBeGreaterThan(0);
          expect(poses.every((p) => p.blend === 0)).toBe(true);
        }
      }
  });
});
