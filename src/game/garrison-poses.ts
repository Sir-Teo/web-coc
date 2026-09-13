import dragon from '../../reference/garrison/dragon7.json';
import balloon from '../../reference/garrison/balloon8.json';
import dragonDeath from '../../reference/garrison/dragon-death.json';
import {
  nativeScenePoses,
  nativeMatrix,
  type NativeMeshGraph,
  type NativeMatrix,
} from './native-mesh';
import type { GarrisonDefender } from './defenders';
import type { Battle } from './model';

export const GARRISON_GRAPHS = {
  dragon: dragon as unknown as NativeMeshGraph,
  balloon: balloon as unknown as NativeMeshGraph,
  dragonDeath: dragonDeath as unknown as NativeMeshGraph,
};
const deathClip = GARRISON_GRAPHS.dragonDeath.clips[dragonDeath.exports.barbarian_death_1];
export const DRAGON_DEATH_LAST_TIME = (deathClip.timeline.length - 1) / deathClip.fps;
const balloonAttack = GARRISON_GRAPHS.balloon.clips[balloon.exports.balloon_lvl8_attack1];
/** Local one-based interpretation of source ActionFrame 34 in this 34-frame clip. */
export const BALLOON_ACTION_TIME = (balloonAttack.timeline.length - 1) / balloonAttack.fps;
export function balloonAttackPose(defender: GarrisonDefender, elapsed: number, reduced = false) {
  if (reduced) return null;
  const last = defender.attacks.at(-1);
  const since = last ? elapsed - last.at : Infinity;
  // Retain the action pose for one source frame when the combat timer resets.
  if (since >= 0 && since < 1 / balloonAttack.fps)
    return { name: 'balloon_lvl8_attack1', time: BALLOON_ACTION_TIME };
  if (!defender.engaged || defender.cooldown > BALLOON_ACTION_TIME) return null;
  // Local alignment: preserve 24-fps sampling and end the windup at the damage event.
  // The precharged first attack enters partway through the source clip.
  return {
    name: 'balloon_lvl8_attack1',
    time: Math.max(0, BALLOON_ACTION_TIME - defender.cooldown),
  };
}
/** Local world size; all source vertices, colors and nested timelines remain unchanged. */
export const GARRISON_SCALE = 0.6;
/** Local direction buckets shared by the original body and its source mouth locator. */
export function dragonFacing(dx: number, dy: number) {
  const screenX = dx - dy,
    screenY = (dx + dy) / 2;
  const mirror = screenX < 0 ? -1 : 1;
  const slope = screenY / Math.max(1e-9, Math.abs(screenX));
  const view = slope < -0.41421356237309503 ? 1 : slope > 0.41421356237309503 ? 3 : 2;
  return { name: `dragon7_fly1_${view}`, mirror };
}
/** The three source roots are static; their empty attack_pivot children retain placement matrices. */
export function dragonAttackOffset(dx: number, dy: number) {
  const { name, mirror } = dragonFacing(dx, dy);
  const graph = GARRISON_GRAPHS.dragon;
  const clip = graph.clips[graph.exports[name]];
  const slot = clip.names.indexOf('attack_pivot');
  const placement = clip.frames[clip.timeline[0]].find((p) => p[0] === slot);
  if (!placement) throw Error('Missing original Dragon attack locator');
  const matrix = nativeMatrix(
    [GARRISON_SCALE * mirror, 0, 0, 0, GARRISON_SCALE, 0],
    graph.matrices[placement[1]],
  );
  return { x: matrix[2], y: matrix[5] };
}
export function garrisonPoses(defender: GarrisonDefender, battle: Battle, reduced = false) {
  if (battle.elapsed < defender.spawnedAt) return [];
  const graph = GARRISON_GRAPHS[defender.kind];
  const age = Math.max(0, battle.elapsed - defender.spawnedAt);
  let name: string;
  let time = reduced ? 0 : age;
  let mirror = 1;
  if (defender.kind === 'dragon') {
    if (defender.hp <= 0) {
      const deathAge = reduced
        ? DRAGON_DEATH_LAST_TIME
        : Math.min(
            DRAGON_DEATH_LAST_TIME,
            Math.max(0, battle.elapsed - (defender.defeatedAt ?? battle.elapsed)),
          );
      return nativeScenePoses(GARRISON_GRAPHS.dragonDeath, 'barbarian_death_1', deathAge, {}, [
        GARRISON_SCALE,
        0,
        0,
        0,
        GARRISON_SCALE,
        0,
      ]);
    }
    const target = battle.units.find((u) => u.id === defender.target);
    const last = defender.attacks.at(-1);
    const dx = (target?.x ?? last?.targetX ?? defender.x + 1) - defender.x;
    const dy = (target?.y ?? last?.targetY ?? defender.y) - defender.y;
    const facing = dragonFacing(dx, dy);
    mirror = facing.mirror;
    name = facing.name;
  } else if (defender.hp <= 0) {
    name = 'balloon_lvl8_die1';
    time = reduced
      ? 10 / 24
      : Math.min(10 / 24, Math.max(0, battle.elapsed - (defender.defeatedAt ?? battle.elapsed)));
  } else {
    const attack = balloonAttackPose(defender, battle.elapsed, reduced);
    if (attack) {
      name = attack.name;
      time = attack.time;
    } else name = 'balloon_lvl8_idle1';
  }
  const s = GARRISON_SCALE;
  const root: NativeMatrix = [s * mirror, 0, 0, 0, s, 0];
  return nativeScenePoses(graph, name, time, {}, root);
}
