import type { Battle } from '../../src/game/model';
import { REPLAY_VERSION, type ReplayData } from '../../src/game/replay';
import { nativeDirectBattle, type NativeDirectKind } from './native-direct-attacks';

/** Actual ordinary attacks at a storage; contact and next-tick snapshots bracket each release. */
export function attackContactRecording(
  kind: NativeDirectKind,
  version = REPLAY_VERSION,
  level = 1,
) {
  const r = nativeDirectBattle(kind, level, version),
    snapshots: { at: number; battle: Battle }[] = [];
  const snapshot = () => {
    if (snapshots.at(-1)?.at !== r.battle.elapsed)
      snapshots.push({ at: r.battle.elapsed, battle: JSON.parse(JSON.stringify(r.battle)) });
    return r.battle.elapsed;
  };
  const born = snapshot();
  while (!r.unit.attacking) r.step();
  const engaged = snapshot();
  r.untilAttacks(1);
  const first = snapshot();
  r.step();
  const afterFirst = snapshot();
  r.untilAttacks(2);
  const second = snapshot();
  r.step();
  const afterSecond = snapshot();
  r.step();
  r.model.finishBattle();
  return {
    kind,
    level,
    id: r.unit.id,
    born,
    engaged,
    first,
    afterFirst,
    second,
    afterSecond,
    snapshots,
    data: JSON.parse(JSON.stringify(r.model.state.raidLog![0].replay!)) as ReplayData,
  };
}
