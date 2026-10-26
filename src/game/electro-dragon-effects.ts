import source from '../../reference/electro-dragon/effects.json' with { type: 'json' };
import { BUILDINGS } from './data';
import type { Battle } from './model';
import type { ChainRef } from './chain-targets';
import type { NativeEffectEvent } from './native-effects';
type Point = { x: number; y: number };
export const ELECTRO_DRAGON_EFFECTS = [
  source.character.AttackEffect,
  source.character.ChainAttackEffect,
  source.character.HitEffect,
];
/** Source AttachToParent rows follow a surviving caster/previous target; detached endpoints remain captured. */
export function electroDragonEffectEvents(
  battle: Battle | null,
  iso: (x: number, y: number) => Point,
  airLift: number,
  attachment?: (id: number, name: string) => Point | undefined,
  duration?: (effect: string) => number | undefined,
): NativeEffectEvent[] {
  if (!battle?.nativeElectroDragon || !battle.nativeElectroDragonZaps?.length) return [];
  const point = (ref: ChainRef): Point | undefined => {
    if (ref.building) {
      const b = battle.buildings.find((b) => b.id === ref.id && b.hp > 0);
      return b
        ? { x: b.x + BUILDINGS[b.kind].size / 2, y: b.y + BUILDINGS[b.kind].size / 2 }
        : undefined;
    }
    const d = battle.defenders?.find((d) => d.id === ref.id && d.hp > 0);
    return d ? { x: d.x, y: d.y } : undefined;
  };
  const events: NativeEffectEvent[] = [];
  const lifetimes = new Map(ELECTRO_DRAGON_EFFECTS.map((name) => [name, duration?.(name) ?? 10]));
  for (const zap of battle.nativeElectroDragonZaps) {
    const age = battle.elapsed - zap.at;
    if (age < 0) continue;
    const bolt = zap.primary ? source.character.AttackEffect : source.character.ChainAttackEffect;
    const showBolt = age <= lifetimes.get(bolt)!,
      showHit = age <= lifetimes.get(source.character.HitEffect)!;
    if (!showBolt && !showHit) continue;
    const caster = zap.primary
      ? battle.units.find((u) => u.id === zap.sourceId && u.hp > 0)
      : undefined;
    const from = caster ??
      (zap.fromTarget ? point(zap.fromTarget) : undefined) ?? { x: zap.fromX, y: zap.fromY };
    const to = point({ id: zap.targetId, building: zap.targetBuilding }) ?? zap,
      fromScreen = iso(from.x, from.y),
      toScreen = iso(to.x, to.y);
    const muzzle = zap.primary ? attachment?.(zap.sourceId, 'attack_pivot') : undefined,
      lift = zap.toAir ? airLift : 16;
    if (showBolt)
      events.push({
        key: `${zap.key}:bolt`,
        effect: bolt,
        at: zap.at,
        ground: muzzle ?? fromScreen,
        lift: muzzle ? 0 : zap.fromAir ? airLift : 16,
        target: { x: toScreen.x, y: toScreen.y - lift },
        facing: { x: to.x - from.x, y: to.y - from.y },
        depth: 8000,
      });
    if (showHit)
      events.push({
        key: `${zap.key}:hit`,
        effect: source.character.HitEffect,
        at: zap.at,
        ground: toScreen,
        lift,
        depth: 8001,
      });
  }
  return events;
}
