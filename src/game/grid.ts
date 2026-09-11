/** Forty-four buildable tiles, with a two-tile simulation border on each side. */
export const MAP_SIZE = 48;
export const BUILD_MIN = 2;
export const BUILD_MAX = MAP_SIZE - 2;
export const LEGACY_MAP_SIZE = 28;
export const EXPANDED_DEFENSES = new Set(['cannon', 'archertower', 'mortar']);
export const legacySize = (kind: string, currentSize: number) =>
  EXPANDED_DEFENSES.has(kind) ? 2 : currentSize;
