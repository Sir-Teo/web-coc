import type { Battle } from './model';
import { randomPoint, spellEndTime, type NativeSpellCast } from './native-spells';
import type { NativeEffectEvent } from './native-effects';
export interface SpellEffectProfile {
  level: number;
  deploySeconds: number;
  resolvedRevive?: boolean;
  PreDeployEffect: string;
  DeployEffect: string;
  DeployEffect2?: string;
  deploy2DelaySeconds?: number;
  ChargingEffect?: string;
  chargingTargeted?: boolean;
  HitEffect?: string;
  EndEffect?: string;
  hitRadiusTiles?: number;
  graphicsOnlyRadius?: boolean;
  ActivationEffect?: string;
  /** The deployment root's original spawned child, retained as its own finite phase. */
  SpawnEffect?: string;
  spawnDelaySeconds?: number;
}
/** Source deployment art is independent of the later combat pulse; sampling never changes a cast. */
export function spellCastEffectEvents(
  casts: readonly NativeSpellCast[],
  elapsed: number,
  profiles: readonly SpellEffectProfile[],
  iso: (x: number, y: number) => { x: number; y: number },
  duration: (name: string) => number | undefined,
  nestedTimelines = false,
  pulsePresentation = false,
  /** A finishing presentation clock can advance, but cannot start unresolved cast phases. */
  startedThrough = elapsed,
  ownerOrigin?: (
    cast: NativeSpellCast,
  ) => { ground: { x: number; y: number }; lift: number } | undefined,
): (NativeEffectEvent & { sampleAt: number })[] {
  const events: (NativeEffectEvent & { sampleAt: number })[] = [];
  for (const cast of casts) {
    const row = profiles.find((r) => r.level === cast.level);
    if (!row) continue;
    const castGround = iso(cast.x, cast.y),
      revival = row.resolvedRevive ? cast.revivePresentation : undefined,
      deployAt = row.resolvedRevive ? revival?.at : cast.castAt + row.deploySeconds,
      deployGround = revival ? iso(revival.x, revival.y) : castGround;
    for (const [phase, effect, at] of [
      ['activation', row.ActivationEffect, cast.activationOrigin ? cast.castAt : undefined],
      ['preDeploy', row.PreDeployEffect, cast.castAt],
      ['deploy', row.DeployEffect, deployAt],
      [
        'spawn',
        row.SpawnEffect,
        deployAt === undefined ? undefined : deployAt + (row.spawnDelaySeconds ?? 0),
      ],
      [
        'deploy2',
        row.DeployEffect2,
        deployAt === undefined ? undefined : deployAt + (row.deploy2DelaySeconds ?? 0),
      ],
      ['charging', row.ChargingEffect, cast.castAt + row.deploySeconds],
      ['end', cast.hits >= cast.total ? row.EndEffect : undefined, spellEndTime(cast)],
    ] as const) {
      if (
        !effect ||
        at === undefined ||
        at > startedThrough + 1e-9 ||
        elapsed + 1e-9 < at ||
        elapsed - at > (duration(effect) ?? 30)
      )
        continue;
      const activation =
        phase === 'activation' && cast.activationOrigin
          ? (ownerOrigin?.(cast) ?? {
              ground: iso(cast.activationOrigin.x, cast.activationOrigin.y),
              lift: 0,
            })
          : undefined;
      const ground =
        activation?.ground ??
        (phase === 'deploy' || phase === 'deploy2' || phase === 'spawn'
          ? deployGround
          : castGround);
      events.push({
        key: `spell:${cast.id}:${phase}`,
        effect,
        at,
        ground,
        ...(activation?.lift ? { lift: activation.lift } : {}),
        ...(phase === 'charging' && row.chargingTargeted
          ? { target: ground, targetedOrigins: true as const }
          : {}),
        depth: ground.y + 2,
        sampleAt: Math.max(elapsed, at),
        ...(nestedTimelines ? { nestedTimelines: true as const } : {}),
      });
    }
    if (pulsePresentation && row.HitEffect && row.graphicsOnlyRadius) {
      const effect = row.HitEffect,
        tail = duration(effect) ?? 3,
        interval = Math.max(0.001, cast.interval),
        first = Math.max(0, Math.ceil((elapsed - tail - cast.firstHit - 1e-9) / interval));
      // The cast already retains resolved pulse counts and its seed. Sampling consumes no RNG.
      for (let i = first; i < Math.min(cast.hits, cast.total); i++) {
        const at = cast.firstHit + i * interval;
        if (at > startedThrough + 1e-9 || elapsed + 1e-9 < at || elapsed - at > tail) continue;
        const point = randomPoint(cast, i, row.hitRadiusTiles ?? 0),
          ground = iso(point.x, point.y);
        events.push({
          key: `spell:${cast.id}:hit:${i}`,
          effect,
          at,
          ground,
          depth: ground.y + 2,
          sampleAt: Math.max(elapsed, at),
          ...(nestedTimelines ? { nestedTimelines: true as const } : {}),
        });
      }
    }
  }
  return events;
}

/** Only names enabled by this recording use the additional captured history. */
export function capturedSpellEffectEvents(
  battle: Battle | null,
  name: string,
  profiles: readonly SpellEffectProfile[],
  iso: (x: number, y: number) => { x: number; y: number },
  reduced: boolean,
  duration: (name: string) => number | undefined,
  elapsed = battle?.elapsed ?? 0,
  airLift = 0,
  ownerIso = iso,
) {
  if (!battle?.nativeSpellArt?.includes(name) || reduced) return [];
  return spellCastEffectEvents(
    battle.nativeSpellCastHistory?.filter((cast) => cast.name === name) ?? [],
    elapsed,
    profiles,
    iso,
    duration,
    battle.nativeSpellEffectTimelines,
    battle.nativeSpellPulsePresentation,
    battle.elapsed,
    (cast) => {
      if (!cast.activationOrigin) return;
      const owner = battle.units.find((unit) => unit.id === cast.owner && !unit.native?.recalled);
      const point = owner ?? cast.activationOrigin;
      return {
        ground: (owner ? ownerIso : iso)(point.x, point.y),
        lift: cast.activationOrigin.air ? airLift : 0,
      };
    },
  );
}
