import type { Battle } from '../../src/game/model';
import { makeBuilding } from '../../src/game/model';
import { REPLAY_VERSION, type ReplayData } from '../../src/game/replay';
import { nativeDirectBattle } from './native-direct-attacks';

/** Actual deployments distinguish a completed attack from a live Cannon casualty. */
export function superWallBreakerRecording(
  version = REPLAY_VERSION,
  level = 1,
  target: 'storage' | 'cannon' | 'wall' = 'storage',
  x = 11.4,
) {
  const r = nativeDirectBattle(
      'superwallbreaker',
      level,
      version,
      x,
      target === 'wall' ? 'storage' : target,
      {},
      {
        buildingLevel: target === 'cannon' ? 21 : undefined,
        extraBuildings:
          target === 'wall'
            ? Array.from({ length: 48 }, (_, y) => makeBuilding(1000 + y, 'wall', 12, y, 18))
            : [],
      },
    ),
    snapshots: { at: number; battle: Battle }[] = [];
  const capture = () => ({
    at: r.battle.elapsed,
    battle: JSON.parse(JSON.stringify(r.battle)) as Battle,
  });
  const snapshot = () => {
    if (snapshots.at(-1)?.at !== r.battle.elapsed) snapshots.push(capture());
    return r.battle.elapsed;
  };
  const born = snapshot();
  let previous = capture();
  while (r.unit.hp > 0) {
    previous = capture();
    r.step();
  }
  if (previous.at > born) snapshots.push(previous);
  const defeated = snapshot();
  r.step();
  const exploded = snapshot();
  r.until(defeated + 0.5);
  const settled = snapshot();
  r.step();
  r.model.finishBattle();
  return {
    id: r.unit.id,
    born,
    defeated,
    exploded,
    settled,
    snapshots,
    data: JSON.parse(JSON.stringify(r.model.state.raidLog![0].replay!)) as ReplayData,
  };
}
