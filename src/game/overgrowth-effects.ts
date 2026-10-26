import source from '../../reference/overgrowth/effects.json' with { type: 'json' };
import type { Battle } from './model';
import type { NativeEffectEvent } from './native-effects';
type Point = { x: number; y: number };
export const OVERGROWTH_EFFECTS = Object.values(source.phases).flatMap((phase) => [
  phase.start.effect,
  phase.deployed.effect,
  phase.stop.effect,
]);
export function overgrowthPhases(size: number) {
  if (size !== 2 && size !== 3 && size !== 4) return;
  return source.phases[size];
}
export interface RootEffectEvent extends NativeEffectEvent {
  buildingId: number;
  active: boolean;
  /** Normalize tiny clock roundoff at source phase boundaries. */
  sampleAt: number;
}
/** Source clip phases are selected by captured battle time; deployed cycles are externally sustained. */
export function overgrowthEffectEvents(
  battle: Battle | null,
  iso: (x: number, y: number) => Point,
  reduced: boolean,
  duration?: (name: string) => number | undefined,
): RootEffectEvent[] {
  if (!battle?.nativeOvergrowthPresentation) return [];
  const events: RootEffectEvent[] = [],
    now = battle.elapsed,
    reached = now + 1e-9;
  for (const root of battle.nativeOvergrowthRoots ?? []) {
    const phases = overgrowthPhases(root.size);
    if (!phases || reached < root.at) continue;
    const ground = iso(root.x, root.y),
      base = {
        ground,
        depth: ground.y + 3,
        buildingId: root.buildingId,
        sampleAt: Math.max(now, root.at),
      };
    if (reduced) {
      if (reached < root.until)
        events.push({
          ...base,
          key: `${root.key}:deployed`,
          effect: phases.deployed.effect,
          at: root.at,
          until: root.until,
          sustain: true,
          active: true,
        });
      continue;
    }
    const deployedAt = root.at + phases.start.seconds;
    if (now - root.at <= (duration?.(phases.start.effect) ?? 6))
      events.push({
        ...base,
        key: `${root.key}:start`,
        effect: phases.start.effect,
        at: root.at,
        active: reached < deployedAt && reached < root.until,
        sampleAt: reached >= deployedAt ? Math.max(now, deployedAt) : Math.max(now, root.at),
      });
    if (reached >= deployedAt && now <= root.until + 0.15)
      events.push({
        ...base,
        key: `${root.key}:deployed`,
        effect: phases.deployed.effect,
        at: deployedAt,
        until: root.until,
        sustain: true,
        active: reached < root.until,
        sampleAt: Math.max(now, reached >= root.until ? root.until : deployedAt),
      });
    if (
      reached >= root.until &&
      now - root.until <= (duration?.(phases.stop.effect) ?? phases.stop.seconds)
    )
      events.push({
        ...base,
        key: `${root.key}:stop`,
        effect: phases.stop.effect,
        at: root.until,
        sampleAt: Math.max(now, root.until),
        active: false,
      });
  }
  return events;
}
