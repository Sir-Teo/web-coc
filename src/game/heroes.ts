/** Hero state is independent of army housing and survives defeat. */
export interface HeroProgress {
  level: number;
  upgradeEnd?: number;
  upgradeStart?: number;
}
export interface BattleHero {
  level: number;
  townhall: number;
  unitId: number | null;
  abilityUsed: boolean;
  rageUntil: number;
}
export const HERO_MAX_LEVEL = 20;
export const heroLevelCap = (townhall: number, hall: number) =>
  townhall < 7 ? 1 : townhall >= 8 && hall >= 2 ? 20 : 10;
export const heroUpgradeCost = (level: number) => 1000 + level * 500;
export const heroUpgradeSeconds = (level: number) => 300 * level;
export function heroStats(level: number, townhall: number) {
  const early = townhall < 7 ? 0.45 + Math.max(0, townhall - 4) * 0.15 : 1;
  return {
    hp: Math.round((1700 + (level - 1) * 85) * early),
    damage: Math.round((120 + (level - 1) * 6) * early),
    speed: 1.25,
    range: 1.15,
    rate: 1.2,
  };
}
export const HERO_ABILITY = {
  duration: 10,
  damage: 1.7,
  speed: 1.4,
  healFraction: 0.3,
  summons: 4,
};
