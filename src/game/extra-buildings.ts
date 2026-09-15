import source from '../../reference/full-client/progression.json';
import combat from '../../reference/full-client/combat.json';
import type { BuildingDef } from './data';
export const EXTRA_BUILDING_KINDS = [
  'darkbarracks',
  'darkspellfactory',
  'workshop',
  'pethouse',
  'eagle',
  'scattershot',
  'spelltower',
  'monolith',
  'multiarchertower',
  'ricochetcannon',
  'multigeartower',
  'firespitter',
  'revengetower',
  'superwizardtower',
  'tornadotrap',
  'gigabomb',
] as const;
export type ExtraBuildingKind = (typeof EXTRA_BUILDING_KINDS)[number];
/** Town Hall 11+ traps; their battle rules live in native-traps.ts (version 45+). */
export const EXTRA_TRAP_KINDS = ['tornadotrap', 'gigabomb'] as const;
const TRAP_TEXT: Record<(typeof EXTRA_TRAP_KINDS)[number], string> = {
  tornadotrap:
    'A hidden whirlwind that drags attacking troops toward its center and holds them there.',
  gigabomb:
    'A visible bomb that explodes once enough troops gather around it, flinging them away.',
};
export const EXTRA_BUILDINGS = Object.fromEntries(
  EXTRA_BUILDING_KINDS.map((kind) => {
    const family = source.buildings[kind],
      row = family.levels[0];
    if (kind === 'tornadotrap' || kind === 'gigabomb') {
      const trap = combat.traps[family.name as 'Tornado Trap' | 'Giga Bomb'][0] as Record<
        string,
        string
      >;
      return [
        kind,
        {
          name: family.name,
          description: TRAP_TEXT[kind],
          size: row.size,
          width: row.size * 54,
          hp: 1,
          cost: row.cost,
          resource: row.resource as BuildingDef['resource'],
          build: row.seconds,
          maxLevel: family.levels.length,
          available: family.counts,
          category: 'Traps',
          singleArtwork: true,
          trap: {
            trigger: +trap.TriggerRadius / 100,
            radius: +trap.DamageRadius / 100,
            delay: +trap.ActionFrame / 24,
            damage: +(trap.Damage ?? 0),
            targets: 'both',
            minHousing: +trap.MinTriggerHousingLimit,
          },
        } satisfies BuildingDef,
      ];
    }
    const defense = [
      'eagle',
      'scattershot',
      'spelltower',
      'monolith',
      'multiarchertower',
      'ricochetcannon',
      'multigeartower',
      'firespitter',
      'revengetower',
      'superwizardtower',
    ].includes(kind);
    return [
      kind,
      {
        name: family.name,
        description: defense
          ? 'Protects your village with an advanced defensive weapon.'
          : 'Unlocks advanced army options.',
        size: row.size,
        width: row.size * 60,
        hp: row.hp,
        cost: row.cost,
        resource: row.resource,
        build: row.seconds,
        maxLevel: family.levels.length,
        available: family.counts,
        category: defense ? 'Defenses' : 'Army',
        singleArtwork: true,
        ...(defense
          ? {
              damage: row.damage || row.dps * (row.rate || 1),
              rate: row.rate || 1,
              range: row.range,
              minRange: row.minRange,
              splash: row.splash || undefined,
              targets: row.targets,
            }
          : {}),
      },
    ];
  }),
) as unknown as Record<ExtraBuildingKind, BuildingDef>;
