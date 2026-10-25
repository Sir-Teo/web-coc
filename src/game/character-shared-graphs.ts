import commonDeath from '../../reference/garrison/dragon-death.json' with { type: 'json' };
import arrows from '../../reference/characters/projectiles/characters.json' with { type: 'json' };
import cards from '../../reference/characters/projectiles/chr-headhunter.json' with { type: 'json' };
import rockets from '../../reference/characters/projectiles/chr-super-minion.json' with { type: 'json' };
import fireballs from '../../reference/characters/projectiles/buildings.json' with { type: 'json' };
import type { CharacterGraphEntry } from './character-art';
import { characterGraphEntry as entry } from './character-graph-entry';
import { characterProjectileGroups } from './character-catalog';

export const COMMON_DEATH_ART = entry(commonDeath, 'garrison-dragonDeath', [45]);
/** Projectile exports grouped by their original file. */
export const PROJECTILE_ART: Record<string, CharacterGraphEntry> = {
  'sc/characters.sc': entry(arrows, 'character-projectiles-characters'),
  'sc/chr_headhunter.sc': entry(cards, 'character-projectiles-headhunter'),
  'sc/chr_super_minion.sc': entry(rockets, 'character-projectiles-super-minion'),
  'sc/buildings.sc': entry(fireballs, 'character-projectiles-buildings'),
};
/** Later projectile rows keep their own graphs (Witch bolt, Bowler boulder, Lava Hound shots). */
const GROUP_LOADERS: Record<string, () => Promise<CharacterGraphEntry>> = {
  witch: () =>
    import('../../reference/characters/projectiles/witch.json').then((module) =>
      entry(module.default, 'character-projectiles-witch'),
    ),
  bowler: () =>
    import('../../reference/characters/projectiles/bowler.json').then((module) =>
      entry(module.default, 'character-projectiles-bowler'),
    ),
  'lava-hound': () =>
    import('../../reference/characters/projectiles/lava-hound.json').then((module) =>
      entry(module.default, 'character-projectiles-lava-hound'),
    ),
};
export const PROJECTILE_GROUP_ART: Record<string, CharacterGraphEntry> = {};
const pending = new Map<string, Promise<void>>();
export async function loadProjectileGroups(animations?: ReadonlySet<string>) {
  const wanted = animations
    ? new Set([...animations].flatMap((animation) => [...characterProjectileGroups(animation)]))
    : new Set(Object.keys(GROUP_LOADERS));
  await Promise.all(
    [...wanted].map((group) => {
      if (PROJECTILE_GROUP_ART[group]) return Promise.resolve();
      const known = pending.get(group);
      if (known) return known;
      const request = GROUP_LOADERS[group]()
        .then((art) => {
          PROJECTILE_GROUP_ART[group] = art;
          // Network completion order must not change the original preload order.
          const entries = { ...PROJECTILE_GROUP_ART };
          for (const name of Object.keys(PROJECTILE_GROUP_ART)) delete PROJECTILE_GROUP_ART[name];
          for (const name of Object.keys(GROUP_LOADERS))
            if (entries[name]) PROJECTILE_GROUP_ART[name] = entries[name];
        })
        .finally(() => {
          if (pending.get(group) === request) pending.delete(group);
        });
      pending.set(group, request);
      return request;
    }),
  );
}
export function projectileGroupsLoaded(animation: string) {
  for (const group of characterProjectileGroups(animation))
    if (!PROJECTILE_GROUP_ART[group]) return false;
  return true;
}
