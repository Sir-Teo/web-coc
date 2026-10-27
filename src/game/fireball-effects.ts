import source from '../../reference/fireball/effects.json' with { type: 'json' };
import type { Battle } from './model';
import type { HeroSetup } from './native-heroes';
import type { NativeEffectEvent } from './native-effects';

export const fireballProfile = (level: number) => source.levels.find((row) => row.level === level);
export function fireballEffects(heroes: readonly HeroSetup[]) {
  return [
    ...new Set(
      heroes.flatMap((hero) => {
        if (hero.kind !== 'warden') return [];
        const item = hero.items.find((item) => item.slug === 'fireball');
        const row = item && fireballProfile(item.level);
        return row ? [row.ActivationEffect, row.HitEffect] : [];
      }),
    ),
  ];
}

/** The immutable launch packet also reconstructs the area explosion after a cold seek. */
export function fireballEffectEvents(
  battle: Battle,
  iso: (x: number, y: number) => { x: number; y: number },
  airLift: number,
  duration: (name: string) => number | undefined,
): NativeEffectEvent[] {
  if (!battle.nativeWardenFireball) return [];
  const result: NativeEffectEvent[] = [];
  for (const shot of battle.nativeFireballs ?? []) {
    const row = fireballProfile(shot.native!.fireball!.level);
    if (!row) continue;
    for (const [phase, effect, at] of [
      ['activation', row.ActivationEffect, shot.launched],
      ['explosion', row.HitEffect, shot.impact],
    ] as const) {
      if (battle.elapsed + 1e-9 < at || battle.elapsed - at > (duration(effect) ?? 30)) continue;
      const actor =
        phase === 'activation' ? battle.units.find((u) => u.id === shot.sourceId) : undefined;
      const point =
        phase === 'activation'
          ? actor && !actor.native?.recalled
            ? actor
            : { x: shot.fromX, y: shot.fromY }
          : shot;
      result.push({
        key: `${shot.id}:fireball:${phase}`,
        effect,
        at,
        ground: iso(point.x, point.y),
        nestedTimelines: true,
        ...(phase === 'activation' && shot.fromAir ? { lift: airLift } : {}),
      });
    }
  }
  return result;
}
