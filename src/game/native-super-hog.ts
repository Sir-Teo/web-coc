import { MAP_SIZE } from './grid';
import { distance2D } from './distance';
import { nativeRow, num, text, tiles } from './native-data';
import { nativeUnitStats, unitKindForName } from './native-units';
import { nativeTroopFacingTarget } from './native-troop-facing';
import type { Battle, Building, Unit } from './model';
import type { UnitKind } from './data';

const summon = (name: string, level: number) => {
  const row = nativeRow('spells', name, level),
    kind = unitKindForName(text(row, 'SummonTroop'));
  if (!kind || num(row, 'UnitsToSpawn') !== 1 || num(row, 'SpawnDuration') !== 0)
    throw Error(`Unsupported Super Hog Rider summon: ${name} ${level}`);
  return { kind: kind as UnitKind, level: num(row, 'SpawnUpgradeLevel', 1) || 1 };
};
const cache = new Map<number, ReturnType<typeof resolveStats>>();
function resolveStats(level: number) {
  const parent = nativeUnitStats('superhogrider', level),
    riderAbility = parent.abilities.find((a) => a.name === 'SuperHogRiderSummonRider')!,
    hogAbility = parent.abilities.find((a) => a.name === 'SuperHogRiderSummonHog')!,
    rider = nativeRow('abilities', riderAbility.name, riderAbility.level),
    hog = nativeRow('abilities', hogAbility.name, hogAbility.level),
    projectile = text(rider, 'ProjectileOnActivation'),
    row = nativeRow('projectiles', projectile);
  if (num(rider, 'ProjectileOnActivationDirection') !== 180)
    throw Error('Unsupported Super Hog Rider release direction');
  return {
    projectile,
    range: tiles(rider, 'AttackRange'),
    duration: (num(row, 'FixedTravelTime') + num(row, 'DamageDelay')) / 1000,
    hog: summon(text(hog, 'SelfSpell'), num(hog, 'SelfSpellLevel', 1) || 1),
    rider: summon(text(row, 'HitSpell'), num(row, 'HitSpellLevel', 1) || 1),
  };
}
export function superHogSplitStats(level: number) {
  let stats = cache.get(level);
  if (!stats) cache.set(level, (stats = resolveStats(level)));
  return stats;
}

/** Source 180° release relative to the current target; a targetless body uses its route or NE. */
export function superHogLanding(
  battle: Battle,
  unit: Unit,
  buildings: ReadonlyMap<number, Building>,
  range: number,
) {
  const target = nativeTroopFacingTarget(battle, unit, buildings) ?? unit.path[0];
  const dx = target ? target.x - unit.x : 1,
    dy = target ? target.y - unit.y : 1,
    length = distance2D(dx, dy),
    x = length > 1e-9 ? dx / length : Math.SQRT1_2,
    y = length > 1e-9 ? dy / length : Math.SQRT1_2;
  return {
    x: Math.max(0.5, Math.min(MAP_SIZE - 0.5, unit.x - x * range)),
    y: Math.max(0.5, Math.min(MAP_SIZE - 0.5, unit.y - y * range)),
  };
}
