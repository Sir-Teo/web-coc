import type { Battle } from './model';
import type { SampleCue } from './sample-audio';
import { infernoDragonBeams, infernoDragonBeamProfile } from './inferno-dragon-beam';
import { troopSample } from './troop-sounds';

/** One source fire loop per active beam, with the authored stage volume and pitch. */
export function infernoDragonSoundCues(battle: Battle | null): SampleCue[] {
  return infernoDragonBeams(battle).map((beam) => {
    const profile = infernoDragonBeamProfile(beam.stage);
    return {
      key: beam.key,
      sample: troopSample(profile.sound),
      at: beam.at,
      volume: profile.volume,
      pitch: profile.pitch,
      loop: true,
    };
  });
}
