import type { Battle } from '../../src/game/model';
import { REPLAY_VERSION, type ReplayData } from '../../src/game/replay';
import { attackingHoundBattle } from './attacking-hound';

/** An actual Monolith defeat releases the normal seeded Pup wave; no injected combat state. */
export function houndDeathRecording(version = REPLAY_VERSION, ice = false, level = 8) {
  const r = attackingHoundBattle(level, version, 17.6, ice, 'monolith'),
    snapshots: { at: number; battle: Battle }[] = [];
  const snapshot = () => {
    if (snapshots.at(-1)?.at !== r.battle.elapsed)
      snapshots.push({ at: r.battle.elapsed, battle: JSON.parse(JSON.stringify(r.battle)) });
    return r.battle.elapsed;
  };
  const deployed = snapshot();
  while (r.unit.hp > 0) r.step();
  const born = snapshot(),
    children = r.battle.units.filter((u) => u.native?.owner === r.unit.id).map((u) => u.id);
  if (!children.length) throw Error('Monolith did not release Hound Pups');
  r.step();
  const moving = snapshot();
  r.until(born + 0.5);
  const fighting = snapshot();
  r.until(born + 1.5);
  const later = snapshot();
  r.step();
  r.model.finishBattle();
  return {
    ice,
    level,
    seed: r.battle.seed,
    id: r.unit.id,
    children,
    deployed,
    born,
    moving,
    fighting,
    later,
    snapshots,
    data: JSON.parse(JSON.stringify(r.model.state.raidLog![0].replay!)) as ReplayData,
  };
}
