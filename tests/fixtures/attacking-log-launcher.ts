import { makeBuilding, type Battle } from '../../src/game/model';
import { REPLAY_VERSION, type ReplayData } from '../../src/game/replay';
import { nativeDirectBattle } from './native-direct-attacks';

export function logLauncherBattle(level = 1, version = REPLAY_VERSION, x = 5) {
  return nativeDirectBattle(
    'loglauncher',
    level,
    version,
    x,
    'storage',
    {},
    {
      deployY: 12,
      layout: [
        makeBuilding(1, 'townhall', 36, 10, 1),
        makeBuilding(2, 'wall', 10, 12, 18),
        makeBuilding(3, 'goldstorage', 13, 11, 18),
        makeBuilding(4, 'wall', 17, 12, 18),
        makeBuilding(5, 'goldstorage', 20, 11, 18),
        makeBuilding(6, 'goldstorage', 24, 11, 18),
      ],
    },
  );
}

/** Actual siege deployment into a corridor of five standing structures. */
export function logLauncherRecording(level = 1, version = REPLAY_VERSION, x = 5) {
  const r = logLauncherBattle(level, version, x),
    snapshots: { at: number; battle: Battle }[] = [];
  for (const at of [0.05, 0.55, 1, 1.5, 2.5, 3.5, 5, 7, 9]) {
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
