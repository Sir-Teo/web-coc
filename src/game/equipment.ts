/** Native client 18.400.21, Blacksmith 1 / TH8. Source audit: docs/BLACKSMITH.md. */
export const EQUIPMENT_KEYS = ['puppet', 'vial', 'boots'] as const;
export type EquipmentKind = (typeof EQUIPMENT_KEYS)[number];
export interface KingEquipment {
  levels: Record<EquipmentKind, number>;
  loadout: [EquipmentKind, EquipmentKind];
}
export const ORE_KEYS = ['shiny', 'glowy', 'starry'] as const;
export type OreKind = (typeof ORE_KEYS)[number];
export type Ores = Record<OreKind, number>;
/** Caps are the Blacksmith 1 storage; `maxCap` is the highest Blacksmith level (10). */
export const ORES = {
  shiny: { name: 'Shiny Ore', cap: 10000, maxCap: 50000, gems: 1 },
  glowy: { name: 'Glowy Ore', cap: 1000, maxCap: 5000, gems: 5 },
  starry: { name: 'Starry Ore', cap: 200, maxCap: 1000, gems: 35 },
} as const;
export const emptyOres = (): Ores => ({ shiny: 0, glowy: 0, starry: 0 });
export const defaultEquipment = (): KingEquipment => ({
  levels: { puppet: 1, vial: 1, boots: 1 },
  loadout: ['puppet', 'vial'],
});
export const EQUIPMENT = {
  puppet: { name: 'Barbarian Puppet', icon: 'Users' },
  vial: { name: 'Rage Vial', icon: 'Zap' },
  boots: { name: 'Earthquake Boots', icon: 'Waves' },
} as const;
export const EQUIPMENT_MAX_LEVEL = 9;
const ABILITY_LEVEL = [0, 0, 1, 1, 1, 2, 2, 2, 3] as const;
// Destination prices: the client CSV stores the NEXT upgrade on each current-level row.
const SHINY_COST = [0, 120, 240, 400, 600, 840, 1120, 1440, 1800] as const;
const GLOWY_COST = [0, 0, 20, 0, 0, 100, 0, 0, 200] as const;
const PUPPET_HP = [309, 385, 467, 564, 649, 734, 836, 940, 1045] as const;
const PUPPET_HEAL = [110, 165, 220, 275, 330, 385, 440, 495, 572] as const;
const VIAL_DPS = [17, 22, 27, 32, 37, 42, 48, 54, 60] as const;
const VIAL_HEAL = [150, 225, 300, 375, 450, 525, 600, 675, 780] as const;
const BOOTS_HP = [209, 244, 278, 313, 348, 383, 418, 452, 522] as const;
const BOOTS_DPS = [13, 15, 17, 19, 21, 23, 26, 28, 32] as const;
export const validEquipmentKind = (value: unknown): value is EquipmentKind =>
  typeof value === 'string' && EQUIPMENT_KEYS.includes(value as EquipmentKind);
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
export function validEquipment(value: unknown): value is KingEquipment {
  if (!record(value) || !record(value.levels) || !Array.isArray(value.loadout)) return false;
  const levels = value.levels;
  return (
    EQUIPMENT_KEYS.every(
      (k) => Number.isInteger(levels[k]) && Number(levels[k]) >= 1 && Number(levels[k]) <= 9,
    ) &&
    value.loadout.length === 2 &&
    value.loadout.every(validEquipmentKind) &&
    value.loadout[0] !== value.loadout[1]
  );
}
export function validOres(value: unknown): value is Ores {
  if (!record(value)) return false;
  return ORE_KEYS.every(
    (k) =>
      Number.isInteger(value[k]) && Number(value[k]) >= 0 && Number(value[k]) <= ORES[k].maxCap,
  );
}
export function equipmentCost(destination: number): Ores | null {
  if (!Number.isInteger(destination) || destination < 2 || destination > 9) return null;
  return { shiny: SHINY_COST[destination - 1], glowy: GLOWY_COST[destination - 1], starry: 0 };
}
export function equipmentQuote(destination: number, ores: Ores) {
  const cost = equipmentCost(destination);
  if (!cost) return null;
  const missing = emptyOres();
  for (const k of ORE_KEYS) missing[k] = Math.max(0, cost[k] - ores[k]);
  return { cost, missing, gems: ORE_KEYS.reduce((sum, k) => sum + missing[k] * ORES[k].gems, 0) };
}
export function equipmentStats(kind: EquipmentKind, level: number) {
  const i = Math.max(0, Math.min(8, Math.floor(level) - 1)),
    a = ABILITY_LEVEL[i];
  return {
    hp: kind === 'puppet' ? PUPPET_HP[i] : kind === 'boots' ? BOOTS_HP[i] : 0,
    dps: kind === 'vial' ? VIAL_DPS[i] : kind === 'boots' ? BOOTS_DPS[i] : 0,
    recovery: kind === 'puppet' ? PUPPET_HEAL[i] : kind === 'vial' ? VIAL_HEAL[i] : 0,
    summons: kind === 'puppet' ? [8, 16, 20, 30][a] : 0,
    summonDamage: kind === 'puppet' ? [2, 2.2, 2.4, 2.6][a] : 1,
    summonSpeedBoost: kind === 'puppet' ? [1.2, 1.6, 2, 2.4][a] : 0,
    damage: kind === 'vial' ? [2.2, 2.3, 2.35, 2.4][a] : 1,
    speedBoost: kind === 'vial' ? [2.25, 2.8, 3.2, 3.6][a] : 0,
    duration: kind === 'vial' ? 10 : 0,
    quakeBuilding: kind === 'boots' ? [0.02, 0.04, 0.06, 0.068][a] : 0,
    quakeTroop: kind === 'boots' ? [0.01, 0.012, 0.014, 0.014][a] : 0,
  };
}
export function equipmentBonuses(equipment = defaultEquipment()) {
  const result = {
    hp: 0,
    dps: 0,
    recovery: 0,
    summons: 0,
    summonDamage: 1,
    summonSpeedBoost: 0,
    damage: 1,
    speedBoost: 0,
    duration: 0,
    quakeBuilding: 0,
    quakeTroop: 0,
  };
  for (const kind of equipment.loadout) {
    const stats = equipmentStats(kind, equipment.levels[kind]);
    result.hp += stats.hp;
    result.dps += stats.dps;
    result.recovery += stats.recovery;
    for (const key of [
      'summons',
      'summonDamage',
      'summonSpeedBoost',
      'damage',
      'speedBoost',
      'duration',
      'quakeBuilding',
      'quakeTroop',
    ] as const)
      result[key] = Math.max(result[key], stats[key]);
  }
  return result;
}
export const EARTHQUAKE_BOOTS = { radius: 8, pulses: 5, interval: 0.4, delay: 0.7 } as const;
