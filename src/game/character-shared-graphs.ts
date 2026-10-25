import commonDeath from '../../reference/garrison/dragon-death.json' with { type: 'json' };
import arrows from '../../reference/characters/projectiles/characters.json' with { type: 'json' };
import cards from '../../reference/characters/projectiles/chr-headhunter.json' with { type: 'json' };
import rockets from '../../reference/characters/projectiles/chr-super-minion.json' with { type: 'json' };
import fireballs from '../../reference/characters/projectiles/buildings.json' with { type: 'json' };
import witchShots from '../../reference/characters/projectiles/witch.json' with { type: 'json' };
import boulders from '../../reference/characters/projectiles/bowler.json' with { type: 'json' };
import houndShots from '../../reference/characters/projectiles/lava-hound.json' with { type: 'json' };
import type { CharacterGraphEntry } from './character-art';
import { characterGraphEntry as entry } from './character-graph-entry';

export const COMMON_DEATH_ART = entry(commonDeath, 'garrison-dragonDeath', [45]);
/** Projectile exports grouped by their original file. */
export const PROJECTILE_ART: Record<string, CharacterGraphEntry> = {
  'sc/characters.sc': entry(arrows, 'character-projectiles-characters'),
  'sc/chr_headhunter.sc': entry(cards, 'character-projectiles-headhunter'),
  'sc/chr_super_minion.sc': entry(rockets, 'character-projectiles-super-minion'),
  'sc/buildings.sc': entry(fireballs, 'character-projectiles-buildings'),
};
/** Later projectile rows keep their own graphs (Witch bolt, Bowler boulder, Lava Hound shots). */
export const PROJECTILE_GROUP_ART: Record<string, CharacterGraphEntry> = {
  witch: entry(witchShots, 'character-projectiles-witch'),
  bowler: entry(boulders, 'character-projectiles-bowler'),
  'lava-hound': entry(houndShots, 'character-projectiles-lava-hound'),
};
