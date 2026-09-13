import catalog from '../../reference/garrison/catalog.json';
import { createGarrisonReserve, type GarrisonKind, type GarrisonTroop } from './garrison-reserve';
import type { GarrisonSetup } from './garrison-release';
import type { Building } from './model';
import { BUILD_MIN } from './grid';

/** Resolve every member or reject the whole roster; source levels are not home levels. */
export function resolvedCampaignGarrison(index: number) {
  const source = catalog.garrisons.find((g) => g.stageIndex === index);
  if (!source) return undefined;
  if (source.castles.length !== 1 || source.castles[0].globalId !== 1000014) return null;
  const kinds: Record<string, GarrisonKind> = { Dragon: 'dragon', Balloon: 'balloon' };
  const troops: GarrisonTroop[] = [];
  for (const row of source.roster) {
    const kind = kinds[row.character];
    if (!kind) return null;
    troops.push({ kind, level: row.sourceLevel, count: row.count });
  }
  try {
    createGarrisonReserve(1, troops);
  } catch {
    return null;
  }
  return { castle: source.castles[0], troops };
}

export function campaignGarrisonSetup(
  index: number,
  buildings: Building[],
): GarrisonSetup[] | undefined {
  const source = resolvedCampaignGarrison(index);
  if (source === undefined) return undefined;
  if (!source) throw Error('Unsupported campaign garrison');
  const matches = buildings.filter(
    (b) =>
      b.kind === 'clancastle' &&
      b.x === source.castle.x + BUILD_MIN &&
      b.y === source.castle.y + BUILD_MIN &&
      b.level === source.castle.level,
  );
  if (matches.length !== 1)
    throw Error('Campaign garrison Castle does not match its source placement');
  return [{ castleId: matches[0].id, mode: 'guard', troops: source.troops }];
}
