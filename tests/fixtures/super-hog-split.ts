import { REPLAY_VERSION, type ReplayData } from '../../src/game/replay';
import type { Battle } from '../../src/game/model';
import { nativeDirectBattle } from './native-direct-attacks';

export function superHogSplitBattle(level = 1, version = REPLAY_VERSION, armed = false) {
  return nativeDirectBattle('superhogrider', level, version, 11.4, armed ? 'monolith' : 'storage');
}

/** A live source Monolith defeats the parent, with no reserve army keeping combat open. */
export function superHogSplitRecording(level = 1, version = REPLAY_VERSION) {
  const r = superHogSplitBattle(level, version, true),
    snapshots: { at: number; battle: Battle }[] = [];
  const snapshot = () => {
    if (snapshots.at(-1)?.at !== r.battle.elapsed)
      snapshots.push({ at: r.battle.elapsed, battle: JSON.parse(JSON.stringify(r.battle)) });
    return r.battle.elapsed;
  };
  while (r.unit.hp === r.unit.maxHp) r.step();
  const wounded = snapshot();
  while (r.unit.hp > 0) r.step();
  const died = snapshot();
  let flight: number | undefined,
    beforeLanding: number | undefined,
    landed: number | undefined,
    later: number | undefined,
    hogId: number | undefined,
    riderId: number | undefined,
    shotId: string | undefined;
  if (version >= 176) {
    const shot = r.battle.projectiles!.find((p) => p.native?.superHogSplit)!;
    shotId = shot.id;
    hogId = r.battle.units.find((u) => u.kind === 'superhog')!.id;
    r.until(shot.launched + 0.6);
    flight = snapshot();
    r.until(shot.impact - 0.05);
    beforeLanding = snapshot();
    r.until(shot.impact);
    landed = snapshot();
    riderId = r.battle.units.find((u) => u.kind === 'superrider')!.id;
    if (!r.battle.finished) {
      r.until(r.battle.elapsed + 0.15);
      later = snapshot();
    }
  }
  if (!r.battle.finished) {
    r.step();
    r.model.finishBattle();
  }
  return {
    id: r.unit.id,
    hogId,
    riderId,
    shotId,
    wounded,
    died,
    flight,
    beforeLanding,
    landed,
    later,
    snapshots,
    data: JSON.parse(JSON.stringify(r.model.state.raidLog![0].replay!)) as ReplayData,
  };
}
