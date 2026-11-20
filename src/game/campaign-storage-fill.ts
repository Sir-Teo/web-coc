import type { Battle, Building } from './model';
import { campaignStage } from './campaign-catalog';
import { campaignAmount, type CampaignResource } from './campaign-loot';

/** Show the snapshotted level inventory, then drain each holder with its own damage. */
export function campaignStorageFill(
  building: Building,
  battle: Battle,
  resource: CampaignResource,
) {
  const total = campaignAmount(campaignStage(battle.index, battle.catalog), resource);
  const remaining = battle.availableLoot?.[resource] ?? total;
  return Math.min(1, Math.max(0, total ? (remaining / total) * (building.hp / building.maxHp) : 0));
}
