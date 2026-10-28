import { BUILDINGS } from './data';
import type { Battle, Building, Unit } from './model';
import { defenderHidden } from './defender-visibility';
import { buildingIndex, defenderIndex } from './battle-index';

/** The actual attack destination, in the same priority order as native Hero facing. */
export function nativeTroopFacingTarget(
  battle: Battle,
  unit: Unit,
  buildings: ReadonlyMap<number, Building> = buildingIndex(battle),
) {
  const wall = buildings.get(unit.native?.wallTarget ?? NaN);
  if (wall && wall.hp > 0) return { x: wall.x + 0.5, y: wall.y + 0.5 };
  const windup =
    (battle.nativeGolemWindup && (unit.kind === 'golem' || unit.kind === 'golemite')) ||
    (battle.nativePekkaWindup && unit.kind === 'pekka') ||
    (battle.nativeGiantWindup && (unit.kind === 'giant' || unit.kind === 'supergiant')) ||
    (battle.nativeIceGolemWindup && unit.kind === 'icegolem') ||
    (battle.nativeRootRiderWindup && unit.kind === 'rootrider') ||
    (battle.nativeElectroTitanWindup && unit.kind === 'electrotitan') ||
    (battle.nativeYetiWindup && (unit.kind === 'yeti' || unit.kind === 'superyeti')) ||
    (battle.nativeHoundWindup && (unit.kind === 'lavahound' || unit.kind === 'icehound')) ||
    (battle.nativeWitchWindup && (unit.kind === 'witch' || unit.kind === 'superwitch')) ||
    (battle.nativeValkyrieWindup && (unit.kind === 'valkyrie' || unit.kind === 'supervalkyrie'))
      ? unit.native?.attackWindup
      : undefined;
  const committedWall =
    windup?.engaged && windup.target?.building ? buildings.get(windup.target.id) : undefined;
  if (committedWall?.kind === 'wall' && committedWall.hp > 0)
    return { x: committedWall.x + 0.5, y: committedWall.y + 0.5 };
  const charge =
    battle.nativeBowlerWallWindup && unit.kind === 'bowler' ? unit.native?.bowler : undefined;
  const committed =
    charge?.engaged && charge.target?.building ? buildings.get(charge.target.id) : undefined;
  if (committed?.kind === 'wall' && committed.hp > 0)
    return { x: committed.x + 0.5, y: committed.y + 0.5 };
  const defender = defenderIndex(battle).get(unit.defenderTarget ?? NaN);
  if (
    defender &&
    defender.hp > 0 &&
    defender.spawnedAt <= battle.elapsed + 1e-9 &&
    !defenderHidden(battle, defender)
  )
    return { x: defender.x, y: defender.y };
  const target = buildings.get(unit.target ?? NaN);
  if (target && target.hp > 0) {
    const half = BUILDINGS[target.kind].size / 2;
    return { x: target.x + half, y: target.y + half };
  }
  return undefined;
}
