import source from '../../reference/overgrowth/effects.json' with { type: 'json' };
import type { Battle } from './model';
import type { NativeEffectEvent } from './native-effects';
export const OVERGROWTH_CAST_EFFECTS = source.spellLevels
  .flatMap((row) => [row.PreDeployEffect, row.DeployEffect, row.DeployEffect2])
  .filter((name, i, names) => names.indexOf(name) === i);
/** Original landing art uses its source delay; the existing root pulse remains at 1.5 seconds. */
export function overgrowthCastEffects(
  battle: Battle | null,
  iso: (x: number, y: number) => { x: number; y: number },
  reduced: boolean,
  duration: (name: string) => number | undefined,
): (NativeEffectEvent & { sampleAt: number })[] {
  if (!battle?.nativeOvergrowthCastPresentation || reduced) return [];
  const events: (NativeEffectEvent & { sampleAt: number })[] = [];
  for (const cast of battle.nativeOvergrowthCasts ?? []) {
    const row = source.spellLevels.find((r) => r.level === cast.level);
    if (!row) continue;
    const ground = iso(cast.x, cast.y);
    for (const [phase, effect, at] of [
      ['preDeploy', row.PreDeployEffect, cast.castAt],
      ['deploy', row.DeployEffect, cast.castAt + row.deploySeconds],
      ['deploy2', row.DeployEffect2, cast.castAt + row.deploySeconds],
    ] as const) {
      if (battle.elapsed + 1e-9 < at || battle.elapsed - at > (duration(effect) ?? 30)) continue;
      events.push({
        key: `spell:${cast.id}:${phase}`,
        effect,
        at,
        ground,
        depth: ground.y + 2,
        sampleAt: Math.max(battle.elapsed, at),
      });
    }
  }
  return events;
}
