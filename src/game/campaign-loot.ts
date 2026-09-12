import { CAMPAIGN } from './data';

export type CampaignResources = { gold: number; elixir: number };
/** Namespaces the authored valley's inventory; native maps need their own catalog. */
export interface CampaignLoot {
  catalog: 'valley-v1';
  remaining: CampaignResources[];
}
export function freshCampaignLoot(): CampaignLoot {
  return {
    catalog: 'valley-v1',
    remaining: CAMPAIGN.map(({ gold, elixir }) => ({ gold, elixir })),
  };
}
export function validCampaignResources(
  value: unknown,
  ceiling: CampaignResources,
): value is CampaignResources {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as CampaignResources;
  return (['gold', 'elixir'] as const).every(
    (k) => Number.isSafeInteger(v[k]) && v[k] >= 0 && v[k] <= ceiling[k],
  );
}
export function validCampaignLoot(value: unknown): value is CampaignLoot {
  if (!value || typeof value !== 'object') return false;
  const v = value as CampaignLoot;
  return (
    v.catalog === 'valley-v1' &&
    Array.isArray(v.remaining) &&
    v.remaining.length === CAMPAIGN.length &&
    CAMPAIGN.every((r, i) => validCampaignResources(v.remaining[i], r))
  );
}
