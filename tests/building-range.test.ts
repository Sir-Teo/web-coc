import { expect, it } from 'vitest';
import { buildingRange } from '../src/game/building-range';
import type { BuildingKind } from '../src/game/data';

type RangeBuilding = Parameters<typeof buildingRange>[0];
const tower = (kind: BuildingKind, options: Partial<RangeBuilding> = {}): RangeBuilding => ({
  kind,
  level: 1,
  ...options,
});

it.each([
  [tower('multigeartower'), 12],
  [tower('multigeartower', { gearMode: 'long' }), 12],
  [tower('multigeartower', { gearMode: 'fast' }), 8],
  [tower('cannon', { level: 8 }), 9],
  [tower('cannon', { level: 8, geared: true }), 7],
  [tower('archertower', { level: 10 }), 10],
  [tower('archertower', { level: 10, geared: true }), 8],
  [tower('mortar', { level: 8 }), 11],
  [tower('mortar', { level: 8, geared: true }), 11],
  [tower('inferno'), 9],
  [tower('inferno', { infernoMode: 'multi' }), 10],
  [tower('xbow'), 14],
  [tower('xbow', { xbowMode: 'both' }), 11.5],
  [tower('spelltower', { level: 3, spellMode: 'invisibility', spellTowerWeapon: 'rage' }), 4.5],
  [tower('spelltower', { level: 3, spellTowerWeapon: 'invisibility' }), 4.5],
  [tower('airdefense'), 10],
  [tower('bomb'), undefined],
] as const)('shows the configured source reach for %j', (building, range) => {
  expect(buildingRange(building)).toBe(range);
});
