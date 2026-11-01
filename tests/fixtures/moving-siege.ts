import type { Battle } from '../../src/game/model';
import { REPLAY_VERSION, type ReplayData } from '../../src/game/replay';
import { nativeDirectBattle } from './native-direct-attacks';
import { logLauncherBattle } from './attacking-log-launcher';

export function movingSiegeBattle(
  kind: 'battleblimp' | 'loglauncher',
  level = 1,
  version = REPLAY_VERSION,
) {
  return kind === 'loglauncher'
    ? logLauncherBattle(level, version)
    : nativeDirectBattle('battleblimp', level, version);
}

/** Actual moving releases, with no injected combat or animation state. */
export function movingSiegeRecording(
  kind: 'battleblimp' | 'loglauncher',
  level = 1,
  version = REPLAY_VERSION,
) {
  const r = movingSiegeBattle(kind, level, version),
    snapshots: { at: number; battle: Battle }[] = [];
  for (const at of [0.05, 0.1, 0.25, 0.5, 0.75, 1, 1.65, 2.5, 3.2, 3.4]) {
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
