import {
  CHARACTER_SCALE,
  animationStates,
  characterAttackTime,
  characterFacing,
  characterLocator,
  characterPose,
  rowExport,
} from './character-poses';
import { CHARACTER_ART, COMMON_DEATH_ART } from './character-art';
import type { GarrisonDefender } from './defenders';
import type { Battle } from './model';

/** The No Flight Zone foundation graphs, retained under their established names. */
export const GARRISON_GRAPHS = {
  dragon: CHARACTER_ART.Dragon7.graph,
  balloon: CHARACTER_ART['Balloon Goblin8'].graph,
  dragonDeath: COMMON_DEATH_ART.graph,
};
const deathClip = GARRISON_GRAPHS.dragonDeath.clips[GARRISON_GRAPHS.dragonDeath.exports.barbarian_death_1];
export const DRAGON_DEATH_LAST_TIME = (deathClip.timeline.length - 1) / deathClip.fps;
const balloonAttack = GARRISON_GRAPHS.balloon.clips[GARRISON_GRAPHS.balloon.exports.balloon_lvl8_attack1];
/** Local one-based interpretation of source ActionFrame 34 in this 34-frame clip. */
export const BALLOON_ACTION_TIME = (balloonAttack.timeline.length - 1) / balloonAttack.fps;
export function balloonAttackPose(defender: GarrisonDefender, elapsed: number, reduced = false) {
  const attack = characterAttackTime(defender, elapsed, 'Balloon Goblin8', 1, reduced);
  return attack ? { name: rowExport(attack.row, 1), time: attack.time } : null;
}
/** Local world size; all source vertices, colors and nested timelines remain unchanged. */
export const GARRISON_SCALE = CHARACTER_SCALE;
/** Local direction buckets shared by the original body and its source mouth locator. */
export function dragonFacing(dx: number, dy: number) {
  const { view, mirror } = characterFacing(dx, dy);
  return { name: `dragon7_fly1_${view}`, mirror };
}
/** The three source roots are static; their empty attack_pivot children retain placement matrices. */
export function dragonAttackOffset(dx: number, dy: number, animation = 'Dragon7') {
  const { view, mirror } = characterFacing(dx, dy);
  const name = rowExport(animationStates(animation).attack[0], view);
  const offset = characterLocator(animation, name, mirror, GARRISON_SCALE);
  if (!offset) throw Error('Missing original Dragon attack locator');
  return offset;
}
export function garrisonPoses(defender: GarrisonDefender, battle: Battle, reduced = false) {
  return characterPose(defender, battle, reduced)?.poses ?? [];
}
