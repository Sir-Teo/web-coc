import { makeBuilding, type Battle } from '../../src/game/model';
import { REPLAY_VERSION, type ReplayData } from '../../src/game/replay';
import { nativeDirectBattle } from './native-direct-attacks';

export function drillSurfaceBattle(level = 1, version = REPLAY_VERSION, x = 10.5) {
  return nativeDirectBattle(
    'battledrill',
    level,
    version,
    x,
    'cannon',
    {},
    {
      buildingLevel: 21,
      extraBuildings: [makeBuilding(3, 'wall', 12, 11, 18), makeBuilding(6, 'wall', 11, 15, 18)],
    },
  );
}

export function drillSurfaceRecording(level = 1, version = REPLAY_VERSION, x = 10.5) {
  const r = drillSurfaceBattle(level, version, x),
    snapshots: { at: number; battle: Battle }[] = [];
  const snapshot = () => {
    snapshots.push({ at: r.battle.elapsed, battle: JSON.parse(JSON.stringify(r.battle)) });
    return r.battle.elapsed;
  };
  snapshot();
  while (!r.battle.nativeSpells?.some((c) => c.name === 'DrillerSurfacing')) r.step();
  const surfaced = snapshot();
  r.step();
  const pulsed = snapshot();
  for (const delay of [0.25, 0.75, 1.5, 2.5, 4]) {
    r.until(pulsed + delay);
    snapshot();
  }
  r.step();
  r.model.finishBattle();
  return {
    id: r.unit.id,
    surfaced,
    pulsed,
    snapshots,
    data: JSON.parse(JSON.stringify(r.model.state.raidLog![0].replay!)) as ReplayData,
  };
}
