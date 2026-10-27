import type { Battle } from '../../src/game/model';
import { REPLAY_VERSION, type ReplayData } from '../../src/game/replay';
import { attackingWitchBattle } from './attacking-witch';

/** Ordinary deployment and source spell landing; no injected health/status state. */
export function witchFlightRecording(version = REPLAY_VERSION, superTroop = false, level = 1) {
  const r = attackingWitchBattle(level, version, 17.6, superTroop),
    snapshots: { at: number; battle: Battle }[] = [];
  const snapshot = () => {
    if (snapshots.at(-1)?.at !== r.battle.elapsed)
      snapshots.push({ at: r.battle.elapsed, battle: JSON.parse(JSON.stringify(r.battle)) });
    return r.battle.elapsed;
  };
  const born = snapshot();
  r.untilAttacks(1);
  const released = snapshot(),
    shot = r.shots[0].shot;
  r.until(shot.launched + (shot.impact - shot.launched) / 2);
  const flying = snapshot();
  r.until(shot.impact + 0.1);
  const tail = snapshot();
  r.until(shot.impact + 0.7);
  const expired = snapshot();
  r.until(shot.impact + 3.2);
  const pruned = snapshot();
  r.step();
  r.model.finishBattle();
  return {
    id: r.unit.id,
    shotId: shot.id,
    shot,
    born,
    released,
    flying,
    tail,
    expired,
    pruned,
    snapshots,
    data: JSON.parse(JSON.stringify(r.model.state.raidLog![0].replay!)) as ReplayData,
  };
}
