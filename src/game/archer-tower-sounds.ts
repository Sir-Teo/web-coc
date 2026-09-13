import source from '../../reference/archer-tower/sounds.json';
import type { SampleCue } from './sample-audio';
export const ARCHER_TOWER_SOUNDS = source.sounds;
export const archerTowerSample = (path: string) => `archer-tower-${path.split('/').at(-1)}`;
export interface ArcherTowerHandlingEvent {
  id: number;
  index: number;
  kind: 'pickup' | 'place';
  at: number;
  x: number;
  y: number;
}
export function archerTowerHandlingCues(events: readonly ArcherTowerHandlingEvent[]): SampleCue[] {
  return events.map((event) => {
    const row =
      source.effects[event.kind === 'pickup' ? 'Tower Turret Pickup' : 'Tower Turret Placing'][0];
    if (!row.Sound) throw new Error('Missing original Archer Tower handling sound');
    return {
      key: `archer-tower:handling:${event.id}:${event.index}`,
      sample: archerTowerSample(row.Sound),
      at: event.at + Number(row.SoundDelay) / 1000,
      volume: Number(row.Volume) / 100,
      pitch: Number(row.MinPitch) / 100,
    };
  });
}
