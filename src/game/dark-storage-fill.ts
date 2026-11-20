import type { Battle, Building } from './model';
import { campaignStorageFill } from './campaign-storage-fill';

/** Campaign fill follows persistent level loot and the local health-based payout model. */
export function darkStorageFill(
  building: Building,
  battle: Battle | null,
  dark: number,
  capacity: number,
) {
  if (building.constructing || building.hp <= 0) return 0;
  if (!battle) return Math.min(1, Math.max(0, capacity ? dark / capacity : 0));
  // Practice snapshots carry no home resource balance. Keep their presentation
  // deterministic, including when shared with a different village.
  if (battle.practice) return 1;
  return campaignStorageFill(building, battle, 'dark');
}
