import { isGarrisonDefender } from './defenders';
import { troopSoundEffect } from './troop-sounds';
import { garrisonSoundEffect } from './garrison-native-sounds';
import type { Battle, FX } from './model';
import type { NativeEffectEvent } from './native-effects';
type Point = { x: number; y: number };

// These bindings retain the source projectile effect identities, independent of audio readiness.
const effect = (level: number, defender: boolean, phase: 'bounce' | 'projectileHit') =>
  defender ? garrisonSoundEffect('bowler', level, phase) : troopSoundEffect('bowler', level, phase);
/** Original roots, including cold retained-history views and reserves not yet released. */
export function bowlerImpactArtNeeded(battle: Battle | null): string[] {
  if (!battle?.nativeBowlerImpactArt) return [];
  const effects = new Set<string>(),
    levels = new Set<number>();
  const add = (level: number, defender = false) => {
    const name = effect(level, defender, 'projectileHit');
    if (name) effects.add(name);
  };
  if (battle.remaining.bowler) levels.add(battle.troopLevels?.bowler ?? 1);
  for (const unit of battle.units)
    if (unit.kind === 'bowler') levels.add(unit.level ?? battle.troopLevels?.bowler ?? 1);
  for (const shot of battle.nativeBowlerFlights ?? []) if (shot.native) add(shot.native.level);
  for (const level of levels) add(level);
  for (const reserve of battle.garrisons ?? [])
    for (const troop of reserve.troops) if (troop.kind === 'bowler') add(troop.level, true);
  for (const defender of battle.defenders ?? [])
    if (isGarrisonDefender(defender) && defender.kind === 'bowler') add(defender.level, true);
  return [...effects];
}
/** Captured final landings draw even after the defender falls; first bounces have sound only. */
export function garrisonBowlerImpactEvents(
  battle: Battle | null,
  iso: (x: number, y: number) => Point,
  elapsed = battle?.elapsed ?? 0,
  duration?: (name: string) => number | undefined,
): NativeEffectEvent[] {
  if (!battle?.nativeBowlerImpactArt) return [];
  const events: NativeEffectEvent[] = [];
  for (const defender of battle.defenders ?? []) {
    if (!isGarrisonDefender(defender) || defender.kind !== 'bowler') continue;
    const name = effect(defender.level, true, 'projectileHit');
    if (!name) continue;
    const life = duration?.(name) ?? 10;
    for (const [index, attack] of defender.attacks.entries()) {
      const { bounceAt: at, bounceX: x, bounceY: y } = attack;
      if (
        at === undefined ||
        x === undefined ||
        y === undefined ||
        at > elapsed + 1e-9 ||
        elapsed - at > life
      )
        continue;
      events.push({
        key: `garrison:${defender.id}:boulder-hit:${attack.n ?? index}`,
        effect: name,
        at,
        ground: iso(x, y),
        lift: 16,
        depth: 8001,
        facing: { x: x - (attack.hitX ?? attack.targetX), y: y - (attack.hitY ?? attack.targetY) },
      });
    }
  }
  return events;
}
/** Source contact effect for fallback coverage, independent of sample readiness. */
export function garrisonBowlerContactEffect(battle: Battle | null, fx: FX) {
  if (
    !battle?.nativeBowlerImpactArt ||
    fx.type !== 'hit' ||
    !fx.sourceDefender ||
    fx.projectileBounce === undefined
  )
    return undefined;
  const defender = battle.defenders?.find((d) => d.id === fx.sourceId);
  return defender && isGarrisonDefender(defender) && defender.kind === 'bowler'
    ? effect(defender.level, true, fx.projectileBounce === 0 ? 'bounce' : 'projectileHit')
    : undefined;
}
