import { expect, it } from 'vitest';
import fs from 'node:fs';
import source from '../reference/crafted-defenses/art.json';
import {
  craftedArt,
  craftedArtTier,
  craftedPortrait,
  craftedRegistration,
  craftedTexture,
  CRAFTED_KINDS,
  type ModuleLevels,
} from '../src/game/crafted-defenses';
import { asset } from '../src/game/data';

it('uses original source portraits for all crafted defense visual tiers', () => {
  for (const kind of CRAFTED_KINDS)
    for (let tier = 1; tier <= 4; tier++) {
      const path = `/assets/crafted-native/${kind}/tier-${tier}.png`;
      expect(craftedArt(kind, tier)).toBe(path);
      expect(asset(`crafted-${kind}`, tier)).toBe(path);
    }
});

it('changes visual tier at the source total-module thresholds', () => {
  const cases: [ModuleLevels, number][] = [
    [[1, 1, 1], 1],
    [[6, 1, 1], 1],
    [[7, 1, 1], 2],
    [[9, 7, 1], 2],
    [[9, 8, 1], 3],
    [[9, 9, 8], 3],
    [[9, 9, 9], 4],
    [[10, 10, 10], 4],
  ];
  for (const kind of CRAFTED_KINDS) {
    expect(source.defenses[kind].totalModuleLevelThresholds).toEqual([9, 18, 27]);
    for (const [levels, tier] of cases) expect(craftedArtTier(kind, levels)).toBe(tier);
  }
});

it('ships all twelve source snapshots with their recorded dimensions', () => {
  expect(source.nativePlaybackVerified).toBe(false);
  for (const kind of CRAFTED_KINDS) {
    expect(source.defenses[kind].portraits).toHaveLength(4);
    for (const portrait of source.defenses[kind].portraits) {
      const png = fs.readFileSync('public/' + portrait.path);
      expect(png.readUInt32BE(16)).toBe(portrait.width);
      expect(png.readUInt32BE(20)).toBe(portrait.height);
      expect(portrait.frame).toBe(0);
      expect(portrait.components[0].export).toBe('season_def_base_3x3');
      expect(portrait.components[1].export.endsWith(`_lvl${portrait.tier}`)).toBe(true);
    }
  }
});

it('keeps the shared platform in the same place as portrait bounds change', () => {
  for (const kind of CRAFTED_KINDS)
    for (let tier = 1; tier <= 4; tier++) {
      const portrait = craftedPortrait(kind, tier);
      const registration = craftedRegistration(kind, tier);
      const scale = registration.width / portrait.width;
      expect(scale).toBeCloseTo(178 / 177);
      expect(registration.height / portrait.height).toBeCloseTo(scale);
      // The existing platform ground anchor is source (-4.5,94), independent of body height.
      expect(portrait.bounds[0] + registration.originX * portrait.width).toBeCloseTo(-4.5);
      expect(portrait.bounds[1] + registration.originY * portrait.height).toBeCloseTo(94);
      expect(craftedTexture(kind, tier)).toBe(`crafted-${kind}-tier-${tier}`);
    }
});

it('rejects unsupported source tiers', () => {
  for (const tier of [0, 5, 1.5, NaN]) {
    expect(() => craftedPortrait('candle', tier)).toThrow('Unsupported crafted-defense tier');
    expect(() => craftedTexture('hunter', tier)).toThrow('Unsupported crafted-defense tier');
  }
});
