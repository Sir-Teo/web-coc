import raw from '../../reference/campaign/runtime.json';
import { BUILDINGS, defenseDamage, type BuildingKind } from './data';
import { BUILD_MIN } from './grid';
import { NPC_BUILDINGS, type NpcBuildingKind } from './npc-buildings';
import type { Building } from './model';

export type NativePlacement = [data: number, x: number, y: number, level: number];
export interface NativeStage {
  stage: number;
  name: string;
  dependencies: number[];
  alwaysUnlocked: boolean;
  gold: number;
  elixir: number;
  darkElixir: number;
  recommendedTownHall: number | null;
  allianceDefenders: unknown[];
  activeModes: unknown[];
  buildings: NativePlacement[];
  traps: NativePlacement[];
  obstacles: NativePlacement[];
  decos: NativePlacement[];
}
const source = raw as unknown as {
  stages: NativeStage[];
  combat: Record<number, { name: string; size: number; hp: number[]; dps: number[] }>;
  scenery: Record<
    number,
    {
      name: string;
      size: number;
      export: string;
      passable: boolean;
      faded: boolean;
      passableEdge: number;
    }
  >;
};
export const NATIVE_CAMPAIGN = source.stages;
export const NATIVE_SCENERY = source.scenery;
export const NATIVE_COMBAT = source.combat;
const KINDS: Record<number, BuildingKind> = {
  1000001: 'townhall',
  1000002: 'collector',
  1000003: 'elixirstorage',
  1000004: 'goldmine',
  1000005: 'goldstorage',
  1000008: 'cannon',
  1000009: 'archertower',
  1000010: 'wall',
  1000011: 'wizardtower',
  1000012: 'airdefense',
  1000013: 'mortar',
  1000015: 'builder',
  1000018: 'builder',
  1000019: 'tesla',
  1000028: 'airsweeper',
  1000032: 'bombtower',
  1000060: 'cannon',
  12000000: 'bomb',
  12000001: 'springtrap',
  12000002: 'giantbomb',
  12000003: 'bomb',
  12000005: 'airbomb',
  12000006: 'seekingairmine',
  12000007: 'bomb',
  12000008: 'skeletontrap',
};
const NPC_IDS: Partial<Record<number, NpcBuildingKind>> = {
  12000007: 'santa-trap',
  12000003: 'pumpkin-bomb',
  1000001: 'goblin-townhall',
  1000018: 'goblin-hut',
  1000060: 'tutorial-cannon',
};
/** Never substitute a different weapon, clamp a native level or discard a defender. */
export function nativeCampaignIssues(index: number): string[] {
  const stage = NATIVE_CAMPAIGN[index];
  if (!stage) return ['Unknown village'];
  const issues = new Set<string>();
  if (stage.darkElixir) issues.add('Dark elixir rewards');
  if (stage.allianceDefenders.length) issues.add('Garrison defenders');
  if (stage.activeModes.length) issues.add('Alternate defense modes');
  for (const [id, , , level] of [...stage.buildings, ...stage.traps]) {
    const kind = KINDS[id],
      stats = source.combat[id],
      npc = NPC_IDS[id];
    if (!kind) {
      issues.add(stats?.name ?? `Building ${id}`);
      continue;
    }
    if (level > (npc ? NPC_BUILDINGS[npc].hp.length : BUILDINGS[kind].maxLevel)) {
      issues.add(`${stats.name} level ${level}`);
      continue;
    }
    if (!stats.hp[level - 1]) issues.add(`${stats.name} hitpoints`);
    if (
      !npc &&
      BUILDINGS[kind].damage &&
      Math.abs(defenseDamage(kind, level) / BUILDINGS[kind].rate! - stats.dps[level - 1]) > 1e-6
    )
      issues.add(`${stats.name} level ${level} weapon`);
  }
  return [...issues];
}
export function nativeBuildings(index: number): Building[] {
  const issues = nativeCampaignIssues(index);
  if (issues.length) throw Error(`Village is not implemented: ${issues.join(', ')}`);
  const s = NATIVE_CAMPAIGN[index];
  return [...s.buildings, ...s.traps].map(([data, x, y, level], i) => {
    const npc = NPC_IDS[data],
      hp = source.combat[data].hp[level - 1];
    return {
      id: 1000 + i,
      kind: KINDS[data],
      x: x + BUILD_MIN,
      y: y + BUILD_MIN,
      level,
      hp,
      maxHp: hp,
      cooldown: 0,
      stored: 0,
      ...(npc ? { npc } : {}),
    };
  });
}
/** Native 44×44 coordinates gain only the simulation's two-tile border. */
export interface CampaignScenery {
  data: number;
  x: number;
  y: number;
}
export function nativeScenery(index: number): CampaignScenery[] {
  const s = NATIVE_CAMPAIGN[index];
  return [...s.obstacles, ...s.decos].map(([data, x, y]) => ({
    data,
    x: x + BUILD_MIN,
    y: y + BUILD_MIN,
  }));
}
export function nativeUnlocked(index: number, stars: readonly number[]) {
  const s = NATIVE_CAMPAIGN[index];
  // Dependency edges are alternative paths on the campaign map, not a linear index gate.
  return (
    !!s &&
    (s.alwaysUnlocked ||
      !s.dependencies.length ||
      s.dependencies.some((stage) => stars[stage - 1] > 0))
  );
}

export interface NativeCampaignProgress {
  catalog: 'goblin-v1';
  stars: number[];
  remaining: { gold: number; elixir: number; dark: number }[];
}
export function freshNativeCampaign(): NativeCampaignProgress {
  return {
    catalog: 'goblin-v1',
    stars: NATIVE_CAMPAIGN.map(() => 0),
    remaining: NATIVE_CAMPAIGN.map((s) => ({ gold: s.gold, elixir: s.elixir, dark: s.darkElixir })),
  };
}
export function validNativeCampaign(value: unknown): value is NativeCampaignProgress {
  if (!value || typeof value !== 'object') return false;
  const v = value as NativeCampaignProgress;
  return (
    v.catalog === 'goblin-v1' &&
    Array.isArray(v.stars) &&
    v.stars.length === 90 &&
    NATIVE_CAMPAIGN.every(
      (s, i) => Number.isInteger(v.stars[i]) && v.stars[i] >= 0 && v.stars[i] <= 3,
    ) &&
    Array.isArray(v.remaining) &&
    v.remaining.length === 90 &&
    NATIVE_CAMPAIGN.every((s, i) => {
      const r = v.remaining[i];
      return (
        !!r &&
        Number.isSafeInteger(r.gold) &&
        r.gold >= 0 &&
        r.gold <= s.gold &&
        Number.isSafeInteger(r.elixir) &&
        r.elixir >= 0 &&
        r.elixir <= s.elixir &&
        Number.isSafeInteger(r.dark) &&
        r.dark >= 0 &&
        r.dark <= s.darkElixir
      );
    })
  );
}
