import catalog from '../../reference/builder-menu/catalog.json' with { type: 'json' };
import { craftedModules } from './crafted-defenses';
import { BUILDINGS, buildPrice, needsBuilder, type BuildingKind } from './data';
import { isMergedKind } from './native-merges';
import { HERO_SOURCE, type HeroKind } from './native-hero-data';
import type { Building, GameModel } from './model';

/**
 * The builder menu, the list the original opens from its builder counter: what the builders are
 * working on, then the upgrades and new buildings the village could start, as "Suggested
 * upgrades" and "Other upgrades" (the client's TID_INFOBUBBLE_BUILDER_SUGGESTION and
 * _EXTRA_SUGGESTION). See docs/BUILDER-MENU.md.
 */
export type BuilderJob = {
  name: string;
  /** Construction or the next upgrade level. */
  detail: string;
  end: number;
} & ({ id: number; hero?: never } | { hero: HeroKind; id?: never });
export interface BuilderOption {
  kind: BuildingKind;
  /** The level the buildings are at (0 for a new one from the Shop). */
  level: number;
  /** The buildings of this kind at this level that could start the upgrade, by id. */
  ids: number[];
  cost: number;
  resource: string;
  affordable: boolean;
}
/** The menu's headings, as the client words them. */
export const BUILDER_MENU_TEXTS = catalog.texts;
/** How many affordable options the menu suggests; the rest are "Other upgrades". */
export const SUGGESTED = 5;

export function buildingJobDetail(b: Building) {
  if (b.constructing) return 'Construction';
  switch (b.improving) {
    case 'gearup':
      return 'Gear Up';
    case 'weapon':
      return `Weapon level ${(b.weaponLevel ?? 1) + 1}`;
    case 'guardian':
      return `Guardian level ${(b.guardianLevel ?? 1) + 1}`;
    case 'supercharge':
      return `Supercharge ${(b.supercharge ?? 0) + 1}`;
    case 'module': {
      const job = b.moduleUpgrade;
      if (!job) return 'Module upgrade';
      const level = b.craftedModules?.[job.kind]?.[job.module] ?? 1;
      return `${craftedModules(job.kind)[job.module].name} level ${level + 1}`;
    }
    default:
      return `Level ${b.level + 1}`;
  }
}

export function builderMenu(m: GameModel) {
  const jobs: BuilderJob[] = [];
  for (const b of m.state.buildings)
    if (b.upgradeEnd && b.kind !== 'wall')
      jobs.push({
        id: b.id,
        name: BUILDINGS[b.kind].name,
        detail: buildingJobDetail(b),
        end: b.upgradeEnd,
      });
  const heroes: [HeroKind, { level: number; upgradeEnd?: number } | undefined][] = [
    ['king', m.state.king],
    ...(Object.entries(m.state.heroes ?? {}) as [
      HeroKind,
      { level: number; upgradeEnd?: number },
    ][]),
  ];
  for (const [kind, hero] of heroes)
    if (hero?.upgradeEnd)
      jobs.push({
        hero: kind,
        name: HERO_SOURCE[kind],
        detail: `Level ${hero.level + 1}`,
        end: hero.upgradeEnd,
      });
  jobs.sort((a, b) => a.end - b.end);

  // Upgrades by kind and level, as the original groups them; new buildings from the Shop.
  const groups = new Map<string, BuilderOption>();
  for (const b of m.state.buildings) {
    // Walls upgrade instantly, without a builder, and stay out of the menu as in the original.
    if (b.npc || b.upgradeEnd || b.constructing || b.kind === 'wall') continue;
    const issue = m.upgradeIssue(b);
    // Only resources or busy builders may stand in the way: those clear with time.
    if (issue && !/^Need |builders are busy/.test(issue.reason)) continue;
    const key = `${b.kind}:${b.level}`;
    const group = groups.get(key);
    if (group) group.ids.push(b.id);
    else {
      const resource = BUILDINGS[b.kind].resource;
      const cost = m.upgradeCost(b);
      groups.set(key, {
        kind: b.kind,
        level: b.level,
        ids: [b.id],
        cost,
        resource,
        affordable: m.state[resource as 'gold'] >= cost,
      });
    }
  }
  for (const kind of Object.keys(BUILDINGS) as BuildingKind[]) {
    if (
      kind === 'townhall' ||
      kind === 'wall' ||
      !needsBuilder(kind) ||
      isMergedKind(kind) ||
      m.countOf(kind) >= m.maxCount(kind)
    )
      continue;
    const price = buildPrice(kind, m.countOf(kind));
    groups.set(`${kind}:new`, {
      kind,
      level: 0,
      ids: [],
      cost: price.cost,
      resource: price.resource,
      affordable: m.state[price.resource as 'gold'] >= price.cost,
    });
  }
  // Cheapest first, comparing gems at a premium: a gem price is never the easy choice.
  const weight = (o: BuilderOption) => (o.resource === 'gems' ? o.cost * 1000 : o.cost);
  const options = [...groups.values()].sort(
    (a, b) => weight(a) - weight(b) || a.kind.localeCompare(b.kind),
  );
  const suggested = options.filter((o) => o.affordable).slice(0, SUGGESTED);
  const other = options.filter((o) => !suggested.includes(o));
  return { jobs, suggested, other };
}
