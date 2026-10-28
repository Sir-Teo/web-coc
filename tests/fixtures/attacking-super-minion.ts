import type { Battle } from '../../src/game/model';
import { REPLAY_VERSION, type ReplayData } from '../../src/game/replay';
import { nativeDirectBattle, nativeDirectRecording } from './native-direct-attacks';

export const superMinionDefenderRecording = (version = REPLAY_VERSION, level = 5, air = false) =>
  nativeDirectRecording('superminion', 187, version, level, air ? 'air' : true, 0.35);

/** Actual deployment, eight opening shots, normal-range approach and the ninth impact. */
export function superMinionOpeningRecording(level = 5, version = REPLAY_VERSION) {
  const r = nativeDirectBattle('superminion', level, version, 4),
    snapshots: { at: number; battle: Battle }[] = [];
  const snapshot = () => {
    if (snapshots.at(-1)?.at !== r.battle.elapsed)
      snapshots.push({ at: r.battle.elapsed, battle: JSON.parse(JSON.stringify(r.battle)) });
    return r.battle.elapsed;
  };
  const born = snapshot();
  while (!r.unit.attacking) r.step();
  const engaged = snapshot();
  let charged: number | undefined;
  if (version >= 187) {
    r.until(engaged + 0.35);
    charged = snapshot();
  }
  r.untilAttacks(1);
  const first = snapshot();
  r.untilAttacks(7);
  const seventh = snapshot();
  r.untilAttacks(8);
  const eighth = snapshot();
  r.step();
  const transition = snapshot();
  while (!r.unit.attacking) r.step();
  const approached = snapshot();
  r.untilAttacks(9);
  const ninth = snapshot(),
    shot = r.battle.projectiles!.filter((p) => p.sourceId === r.unit.id).at(-1)!;
  r.until(shot.impact);
  const hit = snapshot();
  r.step();
  r.model.finishBattle();
  return {
    id: r.unit.id,
    born,
    engaged,
    charged,
    first,
    seventh,
    eighth,
    transition,
    approached,
    ninth,
    hit,
    snapshots,
    data: JSON.parse(JSON.stringify(r.model.state.raidLog![0].replay!)) as ReplayData,
  };
}
