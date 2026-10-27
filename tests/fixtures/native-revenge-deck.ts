import { REPLAY_VERSION, type ReplayData } from '../../src/game/replay';
import { revengeDeckBattle } from './revenge-deck';

/** Two real Archer Towers land within one shared legacy cooldown; both deserve a response. */
export function nativeRevengeDeckRecording(version = REPLAY_VERSION) {
  const r = revengeDeckBattle(1, version, false, true),
    snapshots: { at: number; battle: unknown }[] = [];
  const times = { before: 0.5, flight: 0.85, firstHit: 1.05, bothHit: 1.35, later: 2.5 };
  for (const key of Object.keys(times) as (keyof typeof times)[]) {
    r.until(times[key]);
    times[key] = r.battle.elapsed;
    snapshots.push({ at: r.battle.elapsed, battle: JSON.parse(JSON.stringify(r.battle)) });
  }
  r.model.step(0.05);
  r.model.finishBattle();
  return {
    unitId: r.unit.id,
    ...times,
    snapshots,
    data: JSON.parse(JSON.stringify(r.model.state.raidLog![0].replay!)) as ReplayData,
  };
}
