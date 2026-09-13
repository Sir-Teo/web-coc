import source from '../../reference/dark-drill/sounds.json';
import type { SampleCue } from './sample-audio';
export const DARK_DRILL_SOUNDS = source.sounds;
export const darkDrillSample = (path: string) => `dark-drill-${path.split('/').at(-1)}`;
export interface DrillHandlingEvent {
  id: number;
  index: number;
  kind: 'pickup' | 'place';
  at: number;
  x: number;
  y: number;
}
export function darkDrillHandlingCues(events: readonly DrillHandlingEvent[]): SampleCue[] {
  return events.map((event) => {
    const row =
      source.effects[
        event.kind === 'pickup' ? 'Dark Elixir Drill Pickup' : 'Dark Elixir Drill Place'
      ][0];
    return {
      key: `dark-drill:handling:${event.id}:${event.index}`,
      sample: darkDrillSample(row.Sound),
      at: event.at + Number(row.SoundDelay) / 1000,
      volume: Number(row.Volume) / 100,
      pitch: Number(row.MinPitch) / 100,
    };
  });
}
