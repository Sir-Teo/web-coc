import source from '../../reference/inferno/sounds.json';
import { infernoBeamProfile } from './inferno-beam';
import { infernoDamageStage, infernoStats } from './inferno-weapon';
import type { SampleCue } from './sample-audio';
import type { Battle } from './model';
export const INFERNO_SOUNDS = source.sounds;
export const infernoSample = (path: string) => `inferno-${path.split('/').at(-1)}`;

/** One local loop voice per tower, avoiding stacked identical multi-beam samples. */
export function infernoSoundCues(battle: Battle | null): SampleCue[] {
  if (!battle || battle.finished) return [];
  const cues: SampleCue[] = [];
  for (const tower of battle.buildings) {
    if (
      tower.kind !== 'inferno' ||
      tower.hp <= 0 ||
      tower.constructing ||
      tower.upgradeEnd ||
      (battle.defenseStuns[tower.id] ?? 0) >= battle.elapsed
    )
      continue;
    const state = battle.infernos?.[tower.id];
    const slot = state?.scheduler.slots.find((slot) =>
      battle.units.some((unit) => unit.id === slot.targetId && unit.hp > 0 && !unit.ejected),
    );
    if (!slot || !state) continue;
    const stage = infernoDamageStage(state.scheduler.mode, slot.lockedMs, tower.level);
    const profile = infernoBeamProfile(tower.level, stage);
    const acquiredTick = state.nextTick - 1 - slot.lockedMs / 64;
    const stageTicks = [
      0,
      ...infernoStats(tower.level).weapon.switchTimesMs.map((ms) => Math.ceil(ms / 64)),
    ];
    const at = (acquiredTick + stageTicks[stage]) * 0.064;
    cues.push({
      key: `inferno:${tower.id}:loop:${acquiredTick}:${stage}`,
      sample: infernoSample(profile.sound),
      at,
      volume: profile.volume,
      pitch: profile.pitch,
      loop: true,
    });
  }
  return cues;
}
