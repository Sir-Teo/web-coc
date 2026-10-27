import type { Battle } from '../../src/game/model';
import { REPLAY_VERSION, type ReplayData } from '../../src/game/replay';
import { attackingBowlerBattle } from './attacking-bowler';

/** Ordinary deployment inputs, with charge and natural-tail checkpoints. */
export function attackingBowlerAudioRecording(version = REPLAY_VERSION, x = 11.4) {
  const r = attackingBowlerBattle(1, version, x),
    snapshots: { at: number; battle: Battle }[] = [];
  const snapshot = () => {
    snapshots.push({ at: r.battle.elapsed, battle: JSON.parse(JSON.stringify(r.battle)) });
    return r.battle.elapsed;
  };
  while (!r.unit.attacking) r.step();
  const fresh = snapshot();
  r.until(fresh + 0.15);
  const charged = snapshot();
  r.untilAttacks(1);
  const first = snapshot();
  r.until(first + 0.1);
  const tail = snapshot();
  r.until(first + 0.75);
  const repeat = snapshot();
  r.until(repeat + 0.3);
  const nextCharge = snapshot();
  r.untilAttacks(2);
  const second = snapshot();
  r.untilAttacks(3);
  const third = snapshot();
  r.step();
  r.model.finishBattle();
  return {
    id: r.unit.id,
    fresh,
    charged,
    first,
    tail,
    repeat,
    nextCharge,
    second,
    third,
    snapshots,
    data: JSON.parse(JSON.stringify(r.model.state.raidLog![0].replay!)) as ReplayData,
  };
}
