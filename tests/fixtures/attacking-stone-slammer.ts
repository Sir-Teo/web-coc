import { makeBuilding, type Battle } from '../../src/game/model';
import { REPLAY_VERSION, type ReplayData } from '../../src/game/replay';
import { nativeDirectBattle, type NativeDirectTarget } from './native-direct-attacks';

export function stoneSlammerBattle(
  level = 1,
  version = REPLAY_VERSION,
  x = 11.4,
  target: NativeDirectTarget = 'storage',
) {
  return nativeDirectBattle(
    'stoneslammer',
    level,
    version,
    x,
    target,
    {},
    {
      extraBuildings: [makeBuilding(3, 'wall', 17, 11, 18)],
    },
  );
}

/** Actual Siege deployment with a Wall outside the main blast but inside the secondary. */
export function stoneSlammerRecording(
  level = 1,
  version = REPLAY_VERSION,
  x = 11.4,
  target: NativeDirectTarget = 'storage',
) {
  const r = stoneSlammerBattle(level, version, x, target),
    deployed = r.battle.elapsed,
    snapshots: { at: number; battle: Battle }[] = [];
  for (const at of [0.05, 0.85, 1.5, 2.3, 3, 5, 6]) {
    r.until(deployed + at);
    snapshots.push({ at: r.battle.elapsed, battle: JSON.parse(JSON.stringify(r.battle)) });
  }
  r.step();
  r.model.finishBattle();
  return {
    id: r.unit.id,
    deployed,
    snapshots,
    data: JSON.parse(JSON.stringify(r.model.state.raidLog![0].replay!)) as ReplayData,
  };
}
