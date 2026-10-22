import source from '../../reference/multi-gear/portraits.json' with { type: 'json' };
import type { GearMode } from './native-defense-stats';

export const MULTI_GEAR_ART_LEVELS = source.portraits.map((row) => row.level);
export function multiGearPortrait(level: number, mode: GearMode = 'long') {
  const row = source.portraits.find((portrait) => portrait.level === level);
  if (!row) throw Error(`Unsupported Multi-Gear Tower portrait: ${level}`);
  return row[mode];
}
export const multiGearTexture = (level: number, mode: GearMode = 'long') =>
  `multi-gear-native-${level}-${mode}`;
export const multiGearAsset = (level: number, mode: GearMode = 'long') =>
  '/' + multiGearPortrait(level, mode).path;
