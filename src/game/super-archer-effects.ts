import source from '../../reference/super-archer/effects.json' with { type: 'json' };
import type { Battle } from './model';
import type { NativeEffectEvent } from './native-effects';
type Point = { x: number; y: number };
export const SUPER_ARCHER_EFFECTS = [source.character.AttackEffect, source.character.HitEffect];
export function superArcherEffectEvents(
  battle: Battle | null,
  iso: (x: number, y: number) => Point,
  airLift: number,
  duration?: (name: string) => number | undefined,
): NativeEffectEvent[] {
  if (!battle?.nativeArcherPiercing) return [];
  const events: NativeEffectEvent[] = [],
    attackLife = duration?.(source.character.AttackEffect) ?? 10,
    hitLife = duration?.(source.character.HitEffect) ?? 10;
  for (const shot of battle.nativeArcherShots ?? []) {
    const age = battle.elapsed - shot.launched;
    if (age >= 0 && age <= attackLife) {
      const caster = battle.units.find((u) => u.id === shot.sourceId && u.hp > 0);
      events.push({
        key: `${shot.id}:cast`,
        effect: source.character.AttackEffect,
        at: shot.launched,
        ground: iso(caster?.x ?? shot.fromX, caster?.y ?? shot.fromY),
        lift: 16,
        facing: { x: shot.dirX, y: shot.dirY },
        depth: 8000,
      });
    }
    for (const hit of shot.hit) {
      const age = battle.elapsed - hit.at;
      if (age < 0 || age > hitLife) continue;
      events.push({
        key: `${shot.id}:hit:${hit.target.building ? 'b' : 'd'}:${hit.target.id}`,
        effect: source.character.HitEffect,
        at: hit.at,
        ground: iso(hit.x, hit.y),
        lift: hit.air ? airLift : 16,
        depth: 8001,
      });
    }
  }
  return events;
}
