import source from '../../reference/army-codes/index.json' with { type: 'json' };
import { TROOPS, TROOP_KEYS, maxTroopLevel, type TroopKind } from './data';
import { nativeLevelCount, nativeRow, num } from './native-data';
import { TROOP_SOURCE } from './native-units';
import { isSiege } from './special-troops';

export const SIEGE_CARGO_REPLAY_VERSION = 254;

export interface SiegeCargoEntry {
  kind: TroopKind;
  level: number;
  count: number;
}

export interface SiegeCargoSetup {
  castleLevel: number;
  troops: readonly SiegeCargoEntry[];
}

const troopIds = new Map(Object.entries(source.troops).map(([id, name]) => [name, Number(id)]));

/** Castle capacity uses pinned troop housing. Levels are local combat tiers, not donation caps. */
export function prepareSiegeCargo(value: unknown): SiegeCargoSetup | undefined {
  if (!value || typeof value !== 'object') return;
  const { castleLevel, troops } = value as SiegeCargoSetup;
  if (
    !Number.isInteger(castleLevel) ||
    castleLevel < 1 ||
    castleLevel > nativeLevelCount('buildings', 'Clan Castle') ||
    !Array.isArray(troops)
  )
    return;
  const capacity = num(nativeRow('buildings', 'Clan Castle', castleLevel), 'HousingSpace');
  if (!troops.length || troops.length > capacity) return;
  const ordered: SiegeCargoEntry[] = [];
  const seen = new Set<string>();
  let housing = 0;
  for (const entry of troops as readonly SiegeCargoEntry[]) {
    if (!entry || typeof entry !== 'object') return;
    const { kind, level, count } = entry;
    if (
      !TROOP_KEYS.includes(kind) ||
      isSiege(kind) ||
      !troopIds.has(TROOP_SOURCE[kind]) ||
      !Number.isInteger(level) ||
      level < 1 ||
      level > maxTroopLevel(kind) ||
      !Number.isSafeInteger(count) ||
      count < 1 ||
      count > capacity
    )
      return;
    const key = `${kind}:${level}`;
    const space = TROOPS[kind].space;
    housing += space * count;
    if (space < 1 || housing > capacity || seen.has(key)) return;
    seen.add(key);
    ordered.push({ kind, level, count });
  }
  ordered.sort(
    (a, b) =>
      TROOPS[a.kind].space - TROOPS[b.kind].space ||
      troopIds.get(TROOP_SOURCE[a.kind])! - troopIds.get(TROOP_SOURCE[b.kind])! ||
      a.level - b.level,
  );
  return { castleLevel, troops: ordered };
}
