import source from '../../reference/electromite/effects.json' with { type: 'json' };
import type { Battle } from './model';
import type { NativeEffectEvent } from './native-effects';

type Point = { x: number; y: number };
export const ELECTROMITE_EFFECTS = [source.character.AttackEffect, source.character.HitEffect];
/** The original emitters finish within 1.1 seconds; combat keeps longer records for sound seeks. */
export function electromiteEffectEvents(
  battle: Battle | null,
  iso: (x: number, y: number) => Point,
  airLift: number,
): NativeEffectEvent[] {
  if (!battle?.nativeElectromites) return [];
  const events: NativeEffectEvent[] = [];
  for (const zap of battle.nativeElectromiteZaps ?? []) {
    const age = battle.elapsed - zap.at;
    if (age < 0 || age > 1.2) continue;
    const from = iso(zap.fromX, zap.fromY),
      to = iso(zap.x, zap.y),
      lift = zap.toAir ? airLift : 16;
    events.push({
      key: `${zap.key}:bolt`,
      effect: source.character.AttackEffect,
      at: zap.at,
      ground: from,
      lift: zap.fromAir ? airLift : 16,
      target: { x: to.x, y: to.y - lift },
      facing: { x: zap.x - zap.fromX, y: zap.y - zap.fromY },
      depth: 8000,
    });
    events.push({
      key: `${zap.key}:impact`,
      effect: source.character.HitEffect,
      at: zap.at,
      ground: to,
      lift,
      depth: 8001,
    });
  }
  return events;
}
