import { nativeInfernoStates } from './inferno-campaign-state';
import { MAX_ARCHER_TOWER_LEVEL } from './archer-tower-stats';
import { MAX_DARK_DRILL_LEVEL } from './dark-drill-stats';
import raw from '../../reference/campaign/runtime.json' with { type: 'json' };
import { BUILDINGS, defenseDamage, type BuildingKind } from './data';
import { BUILD_MIN } from './grid';
import { NPC_BUILDINGS, type NpcBuildingKind } from './npc-buildings';
import type { Building } from './model';
import { XBOW } from './xbow-stats';
import { resolvedCampaignGarrison } from './garrison-campaign';
import { lateCampaignIssues, lateKey, lateNativeFields } from './late-campaign';

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
  infernoStates?: unknown[];
  /** Late campaign weapon, ammunition and bunker selections. */
  lateStates?: unknown[];
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
  1000016: 'builder',
  1000017: 'townhall',
  1000031: 'eagleartillery',
  1000061: 'clancastle',
  1000062: 'camp',
  1000067: 'scattershot',
  1000069: 'townhall',
  1000072: 'spelltower',
  1000077: 'monolith',
  12000016: 'tornadotrap',
  12000018: 'giantbomb',
  12000019: 'bomb',
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
  1000014: 'clancastle',
  1000015: 'builder',
  1000018: 'builder',
  1000019: 'tesla',
  1000021: 'xbow',
  1000023: 'darkdrill',
  1000024: 'darkstorage',
  1000027: 'inferno',
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
  12000017: 'giantbomb',
};
const NPC_IDS: Partial<Record<number, NpcBuildingKind>> = {
  1000016: 'comm-mast',
  1000017: 'goblin-hall',
  1000061: 'goblin-castle',
  1000062: 'foreboding-cave',
  1000069: 'goblin-boss-th',
  12000018: 'freeze-trap',
  12000019: 'ghost-trap',
  12000017: 'shrink-trap',
  12000007: 'santa-trap',
  12000003: 'pumpkin-bomb',
  1000001: 'goblin-townhall',
  1000018: 'goblin-hut',
  1000060: 'tutorial-cannon',
};
const placementKey = (data: number, x: number, y: number, level: number) =>
  `${data}:${x}:${y}:${level}`;
export function nativeDefenseModes(stage: NativeStage) {
  const modes = new Map<
    string,
    Pick<Building, 'xbowMode' | 'skeletonMode' | 'infernoMode' | 'infernoAmmo'>
  >();
  const issues = new Set<string>();
  let infernos: ReturnType<typeof nativeInfernoStates> = [];
  try {
    infernos = nativeInfernoStates(stage);
  } catch {
    issues.add('Invalid Inferno state');
  }
  const placements = [...stage.buildings, ...stage.traps];
  for (const raw of stage.activeModes) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      issues.add('Invalid defense mode');
      continue;
    }
    const v = raw as Record<string, unknown>;
    if (!['data', 'x', 'y', 'lvl'].every((k) => Number.isInteger(v[k]))) {
      issues.add('Invalid defense mode');
      continue;
    }
    const data = v.data as number,
      x = v.x as number,
      y = v.y as number,
      level = (v.lvl as number) + 1;
    const key = placementKey(data, x, y, level);
    if (modes.has(key) || placements.filter((p) => placementKey(...p) === key).length !== 1) {
      issues.add('Unmatched or duplicate defense mode');
      continue;
    }
    if (data === 1000021 && v.attack_mode === true && v.ammo === XBOW.ammunition)
      modes.set(key, { xbowMode: 'both' });
    else if (
      data === 1000027 &&
      v.attack_mode === true &&
      infernos.some(
        (t) =>
          t.x === x && t.y === y && t.level === level && t.attackMode && t.ammunition === v.ammo,
      )
    )
      modes.set(key, { infernoMode: 'multi', infernoAmmo: v.ammo as number });
    else if (data === 12000008 && v.air_mode === true) modes.set(key, { skeletonMode: 'air' });
    else issues.add('Alternate defense modes');
  }
  // Original NormalModeTID is SINGLE_CONFIG; AlternateModeTID is MULTI_CONFIG.
  // The explicit active bit selects that alternate configuration, never draft/war fields.
  for (const t of infernos)
    modes.set(placementKey(1000027, t.x, t.y, t.level), {
      infernoMode: t.attackMode ? 'multi' : 'single',
      infernoAmmo: t.ammunition,
    });
  return { modes, issues };
}
/** Never substitute a different weapon, clamp a native level or discard a defender. */
export function nativeCampaignIssues(index: number): string[] {
  const stage = NATIVE_CAMPAIGN[index];
  if (!stage) return ['Unknown village'];
  const issues = new Set<string>();
  if (stage.allianceDefenders.length && !resolvedCampaignGarrison(index))
    issues.add('Garrison defenders');
  for (const issue of nativeDefenseModes(stage).issues) issues.add(issue);
  const placements = [...stage.buildings, ...stage.traps];
  for (const issue of lateCampaignIssues(placements)) issues.add(issue);
  for (const issue of lateNativeFields(placements, stage.lateStates ?? []).issues)
    issues.add(issue);
  for (const [id, , , level] of [...stage.buildings, ...stage.traps]) {
    const kind = KINDS[id],
      stats = source.combat[id],
      npc = NPC_IDS[id];
    if (!kind) {
      issues.add(stats?.name ?? `Building ${id}`);
      continue;
    }
    if (
      level >
      (npc
        ? NPC_BUILDINGS[npc].hp.length
        : kind === 'archertower'
          ? MAX_ARCHER_TOWER_LEVEL
          : kind === 'darkdrill'
            ? MAX_DARK_DRILL_LEVEL
            : BUILDINGS[kind].maxLevel)
    ) {
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
  return nativeLayout(index);
}
/** Every source entity with its explicit modes, without the playability gate.
 * For tests and developer inspection of villages whose remaining families are in progress. */
export function nativeLayout(index: number): Building[] {
  const s = NATIVE_CAMPAIGN[index];
  if (!s) throw Error('Unknown village');
  const modes = nativeDefenseModes(s).modes;
  const late = lateNativeFields([...s.buildings, ...s.traps], s.lateStates ?? []).fields;
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
      ...(KINDS[data] === 'xbow' ? { xbowMode: 'ground' as const } : {}),
      ...(KINDS[data] === 'skeletontrap' ? { skeletonMode: 'ground' as const } : {}),
      ...modes.get(placementKey(data, x, y, level)),
      ...late.get(lateKey(data, x, y, level)),
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
