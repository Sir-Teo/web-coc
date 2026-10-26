import type { Battle } from './model';
import type { SampleCue } from './sample-audio';
import { infernoDragonBeams, infernoDragonBeamProfile } from './inferno-dragon-beam';
import { troopSample } from './troop-sounds';
import { infernoDragonTransitionProfile, infernoDragonSample } from './inferno-dragon-effects';
import { infernoDragonTransitionKey } from './inferno-dragon-transitions';
import { cueAudible } from './sample-audio';
import { presentationLive, presentationTime } from './presentation-clock';

/** One source fire loop per active beam, with the authored stage volume and pitch. */
export function infernoDragonSoundCues(battle: Battle | null): SampleCue[] {
  if (!battle?.nativeTroopDamageRamp || !presentationLive(battle)) return [];
  const now = presentationTime(battle);
  const transitions: SampleCue[] = (battle.infernoDragonTransitions ?? []).flatMap((event) => {
    const profile = infernoDragonTransitionProfile(event.stage);
    const at = event.at + profile.soundDelay;
    return cueAudible(at, now)
      ? [
          {
            key: infernoDragonTransitionKey(event),
            sample: infernoDragonSample(profile.sound),
            at,
            volume: profile.volume,
            pitch: profile.pitch,
          },
        ]
      : [];
  });
  return [
    ...infernoDragonBeams(battle).map((beam) => {
      const profile = infernoDragonBeamProfile(beam.stage);
      return {
        key: beam.key,
        sample: troopSample(profile.sound),
        at: beam.at,
        volume: profile.volume,
        pitch: profile.pitch,
        loop: true,
      };
    }),
    ...transitions,
  ];
}
