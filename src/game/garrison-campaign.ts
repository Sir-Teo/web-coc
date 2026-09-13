import { CHARACTER_ROSTERS } from './character-catalog';
import { createGarrisonReserve, type GarrisonTroop } from './garrison-reserve';
import { garrisonKindForCharacter, garrisonTroopVersion } from './garrison-kinds';
import type { GarrisonSetup } from './garrison-release';
import type { Building } from './model';
import { BUILD_MIN } from './grid';

/** Source bunker GlobalIDs and the runtime identity each must match exactly. */
const BUNKERS: Record<number, (b: Building) => boolean> = {
  1000014: (b) => b.kind === 'clancastle' && b.npc === undefined,
  1000061: (b) => b.kind === 'clancastle' && b.npc === 'goblin-castle',
  1000062: (b) => b.kind === 'camp' && b.npc === 'foreboding-cave',
};

/** Why a campaign roster cannot be released yet; empty when it resolves completely. */
export function campaignGarrisonIssues(index: number): string[] {
  const source = CHARACTER_ROSTERS.find((g) => g.stageIndex === index);
  if (!source) return [];
  const issues: string[] = [];
  // Besieged (index 73) lists Electro Dragons but its layout has no Bunker=TRUE building.
  // Never synthesize a Castle: the roster stays unreleasable until a source mechanism is known.
  if (source.bunkers.length !== 1 || !BUNKERS[source.bunkers[0].globalId])
    issues.push('No source bunker');
  for (const row of source.members) {
    const kind = garrisonKindForCharacter(row.character);
    if (!kind || garrisonTroopVersion(kind, row.sourceLevel) === undefined)
      issues.push(`${row.character} ${row.sourceLevel}`);
  }
  return issues;
}

/** Resolve every member or reject the whole roster; source levels are not home levels. */
export function resolvedCampaignGarrison(index: number) {
  const source = CHARACTER_ROSTERS.find((g) => g.stageIndex === index);
  if (!source) return undefined;
  if (campaignGarrisonIssues(index).length) return null;
  const troops: GarrisonTroop[] = source.members.map((row) => ({
    kind: garrisonKindForCharacter(row.character)!,
    level: row.sourceLevel,
    count: row.count,
  }));
  try {
    createGarrisonReserve(1, troops);
  } catch {
    return null;
  }
  return { castle: source.bunkers[0], troops };
}

export function campaignGarrisonSetup(
  index: number,
  buildings: Building[],
): GarrisonSetup[] | undefined {
  const source = resolvedCampaignGarrison(index);
  if (source === undefined) return undefined;
  if (!source) throw Error('Unsupported campaign garrison');
  const identity = BUNKERS[source.castle.globalId];
  const matches = buildings.filter(
    (b) =>
      identity(b) &&
      b.x === source.castle.x + BUILD_MIN &&
      b.y === source.castle.y + BUILD_MIN &&
      b.level === source.castle.level,
  );
  if (matches.length !== 1)
    throw Error('Campaign garrison Castle does not match its source placement');
  return [{ castleId: matches[0].id, mode: 'guard', troops: source.troops }];
}
