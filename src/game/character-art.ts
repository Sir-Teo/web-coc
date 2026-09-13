import dragon7 from '../../reference/garrison/dragon7.json';
import balloon8 from '../../reference/garrison/balloon8.json';
import commonDeath from '../../reference/garrison/dragon-death.json';
import goblin7 from '../../reference/characters/goblin/goblin7.json';
import archer9 from '../../reference/characters/archer/archer9.json';
import dragon5 from '../../reference/characters/dragon/dragon5.json';
import pekka8 from '../../reference/characters/pekka/pekka8.json';
import valkyrie4 from '../../reference/characters/valkyrie/warriorgirl-lvl4.json';
import headhunter3 from '../../reference/characters/headhunter/headhunter-lvl3.json';
import superMinion from '../../reference/characters/super_minion/superminion.json';
import babyDragon6 from '../../reference/characters/baby_dragon/baby-dragon-6.json';
import arrows from '../../reference/characters/projectiles/characters.json';
import cards from '../../reference/characters/projectiles/chr-headhunter.json';
import rockets from '../../reference/characters/projectiles/chr-super-minion.json';
import fireballs from '../../reference/characters/projectiles/buildings.json';
import { CHARACTER_GRAPHS } from './character-catalog';
import type { NativeMeshGraph } from './native-mesh';

export type CharacterGraph = NativeMeshGraph & { shadowShapes?: number[] };
interface CharacterGraphEntry {
  graph: CharacterGraph;
  /** Scene texture prefix; the No Flight Zone foundation keeps its established keys. */
  prefix: string;
  /** Original black-alpha ground shadow shapes rendered on their own layer. */
  shadows: readonly number[];
}
const graph = (value: unknown) => value as CharacterGraph;
const entry = (value: unknown, prefix: string, shadows?: readonly number[]) => ({
  graph: graph(value),
  prefix,
  shadows: shadows ?? graph(value).shadowShapes ?? [],
});
/**
 * Captured native character graphs, keyed by animation block. Dragon 7, Balloon 8 and the
 * common death export come from the garrison foundation (their troop files use shadow shape 0;
 * the common death export uses 45); the rest come from import-native-characters.py.
 */
export const CHARACTER_ART: Record<string, CharacterGraphEntry> = {
  Dragon7: entry(dragon7, 'garrison-dragon', [0]),
  'Balloon Goblin8': entry(balloon8, 'garrison-balloon', [0]),
  Goblin7: entry(goblin7, 'character-goblin7'),
  Archer9: entry(archer9, 'character-archer9'),
  Dragon5: entry(dragon5, 'character-dragon5'),
  PEKKA8: entry(pekka8, 'character-pekka8'),
  WarriorGirl_lvl4: entry(valkyrie4, 'character-warriorgirl-lvl4'),
  HeadHunter_lvl3: entry(headhunter3, 'character-headhunter-lvl3'),
  SuperMinion: entry(superMinion, 'character-superminion'),
  'Baby Dragon 6': entry(babyDragon6, 'character-baby-dragon-6'),
};
export const COMMON_DEATH_ART = entry(commonDeath, 'garrison-dragonDeath', [45]);
/** Projectile exports grouped by their original file. */
export const PROJECTILE_ART: Record<string, CharacterGraphEntry> = {
  'sc/characters.sc': entry(arrows, 'character-projectiles-characters'),
  'sc/chr_headhunter.sc': entry(cards, 'character-projectiles-headhunter'),
  'sc/chr_super_minion.sc': entry(rockets, 'character-projectiles-super-minion'),
  'sc/buildings.sc': entry(fireballs, 'character-projectiles-buildings'),
};
export function characterArt(animation: string) {
  const key = Object.keys(CHARACTER_ART).find(
    (name) => name.replaceAll(' ', '') === animation.replaceAll(' ', ''),
  );
  if (!key) throw Error(`Missing native character art: ${animation}`);
  return CHARACTER_ART[key];
}
/** Imported previews (idle frame zero, two pixels per native unit) and their padded icons. */
export function characterPreview(animation: string) {
  const key = Object.entries(CHARACTER_GRAPHS).find(([, g]) => g.animation === animation)?.[0];
  return key
    ? {
        preview: `/assets/characters-native/${key}/preview.png`,
        icon: `/assets/characters-native/${key}/icon.png`,
      }
    : undefined;
}
