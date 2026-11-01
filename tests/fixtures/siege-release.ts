import type { Battle } from '../../src/game/model';
import { REPLAY_VERSION, type ReplayData } from '../../src/game/replay';
import { nativeDirectBattle } from './native-direct-attacks';

export const RELEASE_SIEGES = [
  'wallwrecker',
  'battleblimp',
  'stoneslammer',
  'siegebarracks',
  'loglauncher',
  'flameflinger',
  'battledrill',
  'trooplauncher',
] as const;
export type ReleaseSiegeKind = (typeof RELEASE_SIEGES)[number];

export function siegeReleaseBattle(kind: ReleaseSiegeKind, level = 1, version = REPLAY_VERSION) {
  return nativeDirectBattle(kind, level, version);
}

/** Untouched deployed machines for historical compatibility controls. */
export function siegeUnreleasedRecording(
  kind: ReleaseSiegeKind,
  level = 1,
  version = REPLAY_VERSION,
) {
  const r = siegeReleaseBattle(kind, level, version),
    snapshots: { at: number; battle: Battle }[] = [];
  for (const at of [0.05, 0.8, 1.35, 3, 5]) {
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

/** A genuine manual input between simulation steps, with checkpoints across death delays. */
export function siegeReleasedRecording(kind: ReleaseSiegeKind, level = 1) {
  const r = siegeReleaseBattle(kind, level),
    snapshots: { at: number; battle: Battle }[] = [];
  const snapshot = () =>
    snapshots.push({ at: r.battle.elapsed, battle: JSON.parse(JSON.stringify(r.battle)) });
  for (const at of [0.05, 0.8, 1.35, 3, 4.95]) {
    r.until(at);
    snapshot();
  }
  r.until(5);
  const endedAt = r.battle.elapsed;
  if (!r.model.endSiege()) throw Error('Manual siege release failed');
  snapshot();
  for (const delay of [0.05, 0.4, 0.65, 0.75, 1.5]) {
    r.until(endedAt + delay);
    snapshot();
  }
  r.step();
  r.model.finishBattle();
  return {
    id: r.unit.id,
    endedAt,
    snapshots,
    data: JSON.parse(JSON.stringify(r.model.state.raidLog![0].replay!)) as ReplayData,
  };
}
