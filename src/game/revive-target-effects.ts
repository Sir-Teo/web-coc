import type { Battle } from './model';
import type { NativeArtPack } from './native-art-pack';
import {
  nativeGraphBounds,
  NATIVE_ALTITUDE,
  NATIVE_ART_SCALE,
  type NativeEffectEvent,
} from './native-effects';
import { revivableHero, pendingHeroRevive, reviveTargetUnit } from './revive-targets';
export const REVIVE_INDICATOR = 'hero_revive_indicator';
export function reviveIndicatorEvents(
  battle: Battle | null,
  iso: (x: number, y: number) => { x: number; y: number },
  reduced: boolean,
) {
  if (!battle?.nativeReviveTargets || battle.finished || battle.spells.revive <= 0) return [];
  return battle.units
    .filter(
      (u) =>
        revivableHero(battle, u) &&
        reviveTargetUnit(battle, u.hero!)?.id === u.id &&
        !pendingHeroRevive(battle, u.id),
    )
    .map((u) => {
      const at = u.defeatedAt ?? 0,
        ground = iso(u.x, u.y);
      return {
        unitId: u.id,
        hero: u.hero!,
        key: `revivable:${u.id}:${at}`,
        effect: REVIVE_INDICATOR,
        at,
        ground,
        nestedTimelines: true as const,
        sampleAt: reduced ? at + 0.25 : Math.max(at, battle.elapsed),
      };
    });
}
/** The marker has no particle travel, rotation or random scaling; its source bounds are exact. */
export function reviveIndicatorBounds(pack: NativeArtPack, event: NativeEffectEvent) {
  const row = pack.effects[REVIVE_INDICATOR]?.[0],
    emitter = row && pack.emitters[row.ParticleEmitter]?.[0];
  if (!row || !emitter) return undefined;
  const graph = pack.scenes.characters,
    id = graph?.exports[emitter.ParticleExportName],
    bounds = graph && id !== undefined ? nativeGraphBounds(graph, id) : undefined;
  if (!bounds) return undefined;
  const n = (row: Record<string, string>, key: string, fallback = 0) =>
      Number(row[key] ?? fallback),
    scale = (NATIVE_ART_SCALE * n(row, 'Scale', 100) * n(emitter, 'StartScale', 100)) / 10000,
    x = event.ground.x + (n(row, 'OffsetX') - n(row, 'OffsetY')) * 0.32,
    y =
      event.ground.y +
      (n(row, 'OffsetX') + n(row, 'OffsetY')) * 0.16 -
      n(row, 'OffsetZ') * NATIVE_ALTITUDE;
  return {
    left: x + bounds[0] * scale,
    top: y + bounds[1] * scale,
    right: x + bounds[2] * scale,
    bottom: y + bounds[3] * scale,
  };
}
