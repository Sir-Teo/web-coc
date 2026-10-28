import { REPLAY_VERSION, type ReplayData } from '../../src/game/replay';
import type { Battle } from '../../src/game/model';
import { nativeDirectBattle } from './native-direct-attacks';

/** Capture actual hits: historical building delay may continue after the unit arrives. */
export function superBarbarianRecording(version = REPLAY_VERSION, level = 1, guard = false) {
  const r = nativeDirectBattle(
      'superbarbarian',
      level,
      version,
      guard ? 6.9 : 11.4,
      guard ? 'garrison' : 'cannon',
    ),
    snapshots: { at: number; battle: Battle }[] = [],
    hits: number[] = [];
  r.model.onEffect = (e) => {
    if (e.type === 'hit' && e.sourceId === r.unit.id) hits.push(r.battle.elapsed);
  };
  const snapshot = () => {
    if (snapshots.at(-1)?.at !== r.battle.elapsed)
      snapshots.push({ at: r.battle.elapsed, battle: JSON.parse(JSON.stringify(r.battle)) });
    return r.battle.elapsed;
  };
  const born = snapshot();
  while (!r.unit.attacking) r.step();
  const engaged = snapshot();
  let charged: number | undefined;
  if (version >= 195) {
    r.until(engaged + 0.25);
    charged = snapshot();
  }
  while (hits.length < 1) r.step();
  const first = snapshot();
  r.until(first + 0.2);
  const recovery = snapshot();
  while (hits.length < 2) r.step();
  const second = snapshot();
  r.step();
  r.model.finishBattle();
  return {
    id: r.unit.id,
    defenderId: r.unit.defenderTarget,
    born,
    engaged,
    charged,
    first,
    recovery,
    second,
    hits,
    snapshots,
    data: JSON.parse(JSON.stringify(r.model.state.raidLog![0].replay!)) as ReplayData,
  };
}
