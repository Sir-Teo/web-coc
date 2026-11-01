import { makeBuilding, type Battle } from '../../src/game/model';
import { REPLAY_VERSION, type ReplayData } from '../../src/game/replay';
import { nativeDirectBattle } from './native-direct-attacks';

export function wallWreckerBattle(level = 1, version = REPLAY_VERSION, x = 11.4, hallLevel = 1) {
  return nativeDirectBattle(
    'wallwrecker',
    level,
    version,
    x,
    'storage',
    {},
    {
      layout: [
        makeBuilding(1, 'townhall', 13, 10, hallLevel),
        makeBuilding(2, 'goldstorage', 36, 36, 18),
      ],
    },
  );
}

/** A real ram deployment, including movement before reaching the Town Hall. */
export function wallWreckerRecording(level = 1, version = REPLAY_VERSION, x = 11.4) {
  const r = wallWreckerBattle(level, version, x),
    snapshots: { at: number; battle: Battle }[] = [];
  for (const at of [0.05, 0.4, 0.75, 0.8, 1.3, 2.1, 3.4, 6.1, 8.8]) {
    r.until(at);
    snapshots.push({ at: r.battle.elapsed, battle: JSON.parse(JSON.stringify(r.battle)) });
  }
  r.step();
  r.model.finishBattle();
  return {
    id: r.unit.id,
    snapshots,
    data: JSON.parse(JSON.stringify(r.model.state.raidLog![0].replay!)) as ReplayData,
  };
}
