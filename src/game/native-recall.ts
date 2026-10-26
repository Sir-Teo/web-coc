import source from '../../reference/recall/effects.json' with { type: 'json' };
import type { Battle, Unit } from './model';
import type { NativeEffectEvent } from './native-effects';
export interface RecallEvent {
  key: string;
  unitId: number;
  phase: 'disappear' | 'redeploy';
  at: number;
  x: number;
  y: number;
}
/** A presentation snapshot of the primary body; health and roster ownership stay in the model. */
export function recordRecallEvent(
  battle: Battle,
  unit: Pick<Unit, 'id' | 'x' | 'y'>,
  phase: RecallEvent['phase'],
  at = battle.elapsed,
) {
  if (!battle.nativeRecallPresentation) return false;
  (battle.nativeRecallEvents ??= []).push({
    key: `recall:${unit.id}:${phase}`,
    unitId: unit.id,
    phase,
    at,
    x: unit.x,
    y: unit.y,
  });
  return true;
}
export function retireRecallEvents(battle: Battle) {
  if (battle.nativeRecallEvents)
    battle.nativeRecallEvents = battle.nativeRecallEvents.filter(
      (event) => event.at + 10 >= battle.elapsed - 1e-9,
    );
}
/** Also covers a cold replay while recalled troops are still waiting in the bar. */
export function needsRecallPresentation(battle: Battle | null | undefined) {
  return (
    !!battle?.nativeRecallPresentation &&
    (battle.spells.recall > 0 ||
      (battle.nativeRecallEvents?.length ?? 0) > 0 ||
      Object.values(battle.recalledHp ?? {}).some((hp) => (hp?.length ?? 0) > 0) ||
      battle.nativeHeroes?.some((hero) => hero.recalledHp !== undefined) ||
      battle.hero?.recalledHp !== undefined)
  );
}
/** LifeTimeScale maps battle age to source age without changing the shared legacy sampler. */
export function recallEffectEvents(
  battle: Battle | null,
  reduced: boolean,
  iso: (x: number, y: number) => { x: number; y: number },
  duration: (effect: string) => number | undefined,
): (NativeEffectEvent & { sampleAt: number })[] {
  if (!battle?.nativeRecallPresentation || reduced) return [];
  return (battle.nativeRecallEvents ?? []).flatMap((event) => {
    if (battle.elapsed + 1e-9 < event.at) return [];
    const ground = iso(event.x, event.y);
    return source.phases[event.phase].flatMap(({ effect, timeScale }) => {
      const age = Math.max(0, battle.elapsed - event.at) / timeScale;
      if (age > (duration(effect) ?? 10)) return [];
      return [
        {
          key: `${event.key}:${effect}`,
          effect,
          at: event.at,
          ground,
          depth: ground.y + 2,
          nestedTimelines: true as const,
          sampleAt: event.at + age,
        },
      ];
    });
  });
}
