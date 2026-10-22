import type { SampleCue } from './sample-audio';
import { visualRandom } from './visual-random';

type Row = Readonly<Record<string, string>>;
export type XbowEffectRows = Readonly<Record<string, readonly Row[]>>;
export type XbowHomeAction = 'pickup' | 'place' | 'mode';
export interface XbowHomeEvent {
  id: number;
  index: number;
  kind: XbowHomeAction;
  at: number;
}
export const XBOW_HOME_EFFECTS: Record<XbowHomeAction, string> = {
  pickup: 'Bow Pickup',
  place: 'Bow Placing',
  mode: 'Bow Target',
};

/** Source sound rows only; placing particles remain part of the separate native effect work. */
export function xbowHomeSoundCues(event: XbowHomeEvent, effects: XbowEffectRows): SampleCue[] {
  return (effects[XBOW_HOME_EFFECTS[event.kind]] ?? []).flatMap((row, i) => {
    if (!row.Sound) return [];
    const min = Number(row.MinPitch),
      max = Number(row.MaxPitch);
    return [
      {
        key: `xbow:${event.id}:home-${event.kind}:${event.index}:${i}`,
        sample: `xbow-${row.Sound.split('/').at(-1)!.replace('.ogg', '')}`,
        at: event.at + Number(row.SoundDelay ?? 0) / 1000,
        volume: Number(row.Volume) / 100,
        pitch: (min + (max - min) * visualRandom(event.id, event.index, 50000 + i)) / 100,
      },
    ];
  });
}
