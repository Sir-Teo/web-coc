import source from '../../reference/full-client/progression.json';
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
] as const;
export type ExtraBuildingKind = (typeof EXTRA_BUILDING_KINDS)[number];
export const EXTRA_BUILDINGS = Object.fromEntries(
  EXTRA_BUILDING_KINDS.map((kind) => {
    const family = source.buildings[kind],
      row = family.levels[0];
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
