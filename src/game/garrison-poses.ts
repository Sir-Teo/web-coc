import dragon from '../../reference/garrison/dragon7.json';
import balloon from '../../reference/garrison/balloon8.json';
import { nativeScenePoses, type NativeMeshGraph, type NativeMatrix } from './native-mesh';
import type { GarrisonDefender } from './defenders';
import type { Battle } from './model';

export const GARRISON_GRAPHS = {
  dragon: dragon as unknown as NativeMeshGraph,
  balloon: balloon as unknown as NativeMeshGraph,
};
/** Local world size; all source vertices, colors and nested timelines remain unchanged. */
export const GARRISON_SCALE = 0.6;
export function garrisonPoses(defender: GarrisonDefender, battle: Battle, reduced = false) {
  if (battle.elapsed < defender.spawnedAt) return [];
  const graph = GARRISON_GRAPHS[defender.kind];
  const age = Math.max(0, battle.elapsed - defender.spawnedAt);
  let name: string;
  let time = reduced ? 0 : age;
  let mirror = 1;
  if (defender.kind === 'dragon') {
    // Common Dragon death export/effects still require a separate source import.
    if (defender.hp <= 0) return [];
    const target = battle.units.find((u) => u.id === defender.target);
    const last = defender.attacks.at(-1);
    const dx = (target?.x ?? last?.targetX ?? defender.x + 1) - defender.x;
    const dy = (target?.y ?? last?.targetY ?? defender.y) - defender.y;
    const screenX = dx - dy,
      screenY = (dx + dy) / 2;
    mirror = screenX < 0 ? -1 : 1;
    // Source views point up-right, right and down-right. These angular buckets are local.
    const slope = screenY / Math.max(1e-9, Math.abs(screenX));
    const view = slope < -0.41421356237309503 ? 1 : slope > 0.41421356237309503 ? 3 : 2;
    name = `dragon7_fly1_${view}`;
  } else if (defender.hp <= 0) {
    name = 'balloon_lvl8_die1';
    time = reduced
      ? 10 / 24
      : Math.min(10 / 24, Math.max(0, battle.elapsed - (defender.defeatedAt ?? battle.elapsed)));
  } else {
    const shot = defender.attacks.at(-1);
    const since = shot ? battle.elapsed - shot.at : Infinity;
    if (!reduced && since >= 0 && since < 34 / 24) {
      name = 'balloon_lvl8_attack1';
      time = since;
    } else name = 'balloon_lvl8_idle1';
  }
  const s = GARRISON_SCALE;
  const root: NativeMatrix = [s * mirror, 0, 0, 0, s, 0];
  return nativeScenePoses(graph, name, time, {}, root);
}
