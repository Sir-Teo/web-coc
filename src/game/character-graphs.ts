import type { CharacterGraphEntry } from './character-art';
import { characterGraphEntry } from './character-graph-entry';

/** Body graphs load independently; callers share each JSON module across art requests. */
export const CHARACTER_LOADERS: Record<string, () => Promise<CharacterGraphEntry>> = {
  Dragon7: () =>
    import('../../reference/garrison/dragon7.json').then((module) =>
      characterGraphEntry(module.default, 'garrison-dragon', [0]),
    ),
  'Balloon Goblin8': () =>
    import('../../reference/garrison/balloon8.json').then((module) =>
      characterGraphEntry(module.default, 'garrison-balloon', [0]),
    ),
  Goblin7: () =>
    import('../../reference/characters/goblin/goblin7.json').then((module) =>
      characterGraphEntry(module.default, 'character-goblin7'),
    ),
  Archer9: () =>
    import('../../reference/characters/archer/archer9.json').then((module) =>
      characterGraphEntry(module.default, 'character-archer9'),
    ),
  Dragon5: () =>
    import('../../reference/characters/dragon/dragon5.json').then((module) =>
      characterGraphEntry(module.default, 'character-dragon5'),
    ),
  PEKKA8: () =>
    import('../../reference/characters/pekka/pekka8.json').then((module) =>
      characterGraphEntry(module.default, 'character-pekka8'),
    ),
  WarriorGirl_lvl4: () =>
    import('../../reference/characters/valkyrie/warriorgirl-lvl4.json').then((module) =>
      characterGraphEntry(module.default, 'character-warriorgirl-lvl4'),
    ),
  HeadHunter_lvl3: () =>
    import('../../reference/characters/headhunter/headhunter-lvl3.json').then((module) =>
      characterGraphEntry(module.default, 'character-headhunter-lvl3'),
    ),
  SuperMinion: () =>
    import('../../reference/characters/super_minion/superminion.json').then((module) =>
      characterGraphEntry(module.default, 'character-superminion'),
    ),
  'Baby Dragon 6': () =>
    import('../../reference/characters/baby_dragon/baby-dragon-6.json').then((module) =>
      characterGraphEntry(module.default, 'character-baby-dragon-6'),
    ),
  ElectroDragon_lvl3: () =>
    import('../../reference/characters/electro_dragon/electrodragon-lvl3.json').then((module) =>
      characterGraphEntry(module.default, 'character-electrodragon-lvl3'),
    ),
  Golem_lvl6: () =>
    import('../../reference/characters/golem/golem-lvl6.json').then((module) =>
      characterGraphEntry(module.default, 'character-golem-lvl6'),
    ),
  Necromancer_lvl2: () =>
    import('../../reference/characters/witch/necromancer-lvl2.json').then((module) =>
      characterGraphEntry(module.default, 'character-necromancer-lvl2'),
    ),
  Skeleton: () =>
    import('../../reference/characters/skeleton/skeleton.json').then((module) =>
      characterGraphEntry(module.default, 'character-skeleton'),
    ),
  Troll_lvl3: () =>
    import('../../reference/characters/bowler/troll-lvl3.json').then((module) =>
      characterGraphEntry(module.default, 'character-troll-lvl3'),
    ),
  ADSeeker_lvl6: () =>
    import('../../reference/characters/lava_hound/adseeker-lvl6.json').then((module) =>
      characterGraphEntry(module.default, 'character-adseeker-lvl6'),
    ),
  TinyBaby_lvl1: () =>
    import('../../reference/characters/lava_hound/tinybaby-lvl1.json').then((module) =>
      characterGraphEntry(module.default, 'character-tinybaby-lvl1'),
    ),
  ElectroTitan_lvl2: () =>
    import('../../reference/characters/electro_titan/electrotitan-lvl2.json').then((module) =>
      characterGraphEntry(module.default, 'character-electrotitan-lvl2'),
    ),
  'Golden Dragon': () =>
    import('../../reference/characters/dragon/golden-dragon.json').then((module) =>
      characterGraphEntry(module.default, 'character-golden-dragon'),
    ),
  MOMMA: () =>
    import('../../reference/characters/pekka/momma.json').then((module) =>
      characterGraphEntry(module.default, 'character-momma'),
    ),
  Prototype_Ghost: () =>
    import('../../reference/characters/royale_ghost/prototype-ghost.json').then((module) =>
      characterGraphEntry(module.default, 'character-prototype-ghost'),
    ),
  'Defending Builder': () =>
    import('../../reference/characters/worker/defending-builder.json').then((module) =>
      characterGraphEntry(module.default, 'character-defending-builder'),
    ),
};
export const loadSharedCharacterGraphs = () => import('./character-shared-graphs');
