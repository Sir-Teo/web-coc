import { makeBuilding, type Battle } from '../../src/game/model';
import { REPLAY_VERSION, type ReplayData } from '../../src/game/replay';
import { nativeDirectBattle, nativeDirectRecording } from './native-direct-attacks';

export const dragonRiderRecording = (
  version = REPLAY_VERSION,
  level = 1,
  guard: boolean | 'air' = false,
) => nativeDirectRecording('dragonrider', 184, version, level, guard, 0.7, 'airdefense');

/** Two real Monoliths bring down the Rider before its separate delayed crash blast. */
export function dragonRiderDeathRecording(level = 1, version = REPLAY_VERSION) {
  const r = nativeDirectBattle(
      'dragonrider',
      level,
      version,
      11.4,
      'monolith',
      {},
      {
        extraBuildings: [makeBuilding(3, 'monolith', 18, 10, 1)],
      },
    ),
    snapshots: { at: number; battle: Battle }[] = [];
  const snapshot = () => {
    if (snapshots.at(-1)?.at !== r.battle.elapsed)
      snapshots.push({ at: r.battle.elapsed, battle: JSON.parse(JSON.stringify(r.battle)) });
    return r.battle.elapsed;
  };
  const born = snapshot();
  while (r.unit.hp > 0) r.step();
  const died = snapshot(),
    blast = r.battle.nativeDeaths!.find((b) => b.sourceId === r.unit.id)!;
  if (!blast) throw Error('Rider defeat did not queue its crash blast');
  r.until(blast.at - 0.05);
  const before = snapshot();
  r.until(blast.at);
  const exploded = snapshot();
  r.until(blast.at + 0.5);
  const after = snapshot();
  r.step();
  r.model.finishBattle();
  return {
    id: r.unit.id,
    born,
    died,
    before,
    exploded,
    after,
    snapshots,
    data: JSON.parse(JSON.stringify(r.model.state.raidLog![0].replay!)) as ReplayData,
  };
}
