import { expect, it } from 'vitest';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import source from '../reference/multi-gear/portraits.json';
import { asset, buildingTexture } from '../src/game/data';
import {
  MULTI_GEAR_ART_LEVELS,
  multiGearAsset,
  multiGearPortrait,
  multiGearTexture,
} from '../src/game/multi-gear-art';

it('dispatches every source level and selected mode through HUD and world asset helpers', () => {
  expect(MULTI_GEAR_ART_LEVELS).toEqual([1, 2, 3]);
  for (const level of MULTI_GEAR_ART_LEVELS)
    for (const mode of ['long', 'fast'] as const) {
      const path =
        mode === 'long'
          ? `/assets/catalog-native/multi-gear-tower/level-${level}.png`
          : `/assets/multi-gear-native/preview-${level}-fast.png`;
      expect(multiGearAsset(level, mode)).toBe(path);
      expect(asset('multigeartower', level, undefined, undefined, undefined, undefined, mode)).toBe(
        path,
      );
      expect(
        buildingTexture('multigeartower', level, undefined, undefined, undefined, undefined, mode),
      ).toBe(`multi-gear-native-${level}-${mode}`);
      expect(multiGearTexture(level, mode)).toBe(`multi-gear-native-${level}-${mode}`);
    }
});

it('uses the existing native alternate bodies and a shared source canvas in both modes', () => {
  expect(source.nativePlaybackVerified).toBe(false);
  for (const row of source.portraits) {
    const alternate = JSON.parse(
      fs.readFileSync(
        `public/assets/village-native/multigeartower/alternate-${row.level}/graph.json`,
        'utf8',
      ),
    );
    expect(row.source.fast).toBe(alternate.levels[0].refs.AlternateExportName.export);
    expect(row.source.base).toBe('rapidfire_base');
    expect(row.fast.bounds).toEqual(row.long.bounds);
    expect([row.fast.width, row.fast.height, row.fast.originX, row.fast.originY]).toEqual([
      row.long.width,
      row.long.height,
      row.long.originX,
      row.long.originY,
    ]);
  }
});

it('keeps decoded source pixels intact when the shorter mode is padded', async () => {
  const sha = (data: Buffer) => createHash('sha256').update(data).digest('hex');
  for (const row of source.portraits) {
    for (const mode of ['long', 'fast'] as const) {
      const portrait = multiGearPortrait(row.level, mode);
      const { data, info } = await sharp('public/' + portrait.path)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      expect([info.width, info.height, info.channels]).toEqual([
        portrait.width,
        portrait.height,
        4,
      ]);
      expect(sha(data)).toBe(portrait.rgbaSha256);
    }
    const fast = row.fast;
    const original = await sharp('public/' + fast.path)
      .extract({
        left: fast.offset[0],
        top: fast.offset[1],
        width: fast.originalBounds[2] - fast.originalBounds[0],
        height: fast.originalBounds[3] - fast.originalBounds[1],
      })
      .ensureAlpha()
      .raw()
      .toBuffer();
    expect(sha(original)).toBe(fast.originalRgbaSha256);
  }
});

it('rejects portraits outside the retained source levels', () => {
  for (const level of [0, 4, 1.5, NaN])
    expect(() => multiGearPortrait(level)).toThrow('Unsupported Multi-Gear Tower portrait');
});
