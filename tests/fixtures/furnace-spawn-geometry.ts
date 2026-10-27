import { furnaceAuraBattle } from './furnace-aura';
import { REPLAY_VERSION, type ReplayData } from '../../src/game/replay';
import type { Battle } from '../../src/game/model';

/** The lower coordinate lane exposes the old host-sine rounding through unit separation. */
export function furnaceSpawnGeometryRecording(level = 1, version = REPLAY_VERSION) {
  const r = furnaceAuraBattle(level, 18, version, 0, { x: 6.9, y: 11.5, allyOffset: 1 }),
    snapshots: { at: number; battle: Battle }[] = [];
  for (const at of [1, 12.45, 14.25, 14.4, 20, 40, 59.5, 65]) {
    r.until(at);
    snapshots.push({ at: r.battle.elapsed, battle: JSON.parse(JSON.stringify(r.battle)) });
  }
  r.step();
  r.model.finishBattle();
  return {
    id: r.unit.id,
    level,
    snapshots,
    data: JSON.parse(JSON.stringify(r.model.state.raidLog![0].replay!)) as ReplayData,
  };
}
