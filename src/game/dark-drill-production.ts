import { darkDrillStats } from './dark-drill-stats';

export function darkDrillProduction(level: number) {
  const row = darkDrillStats(level);
  return {
    perHour: row.production.per100Hours / 100,
    capacity: row.production.capacity,
  };
}

/** Preserve already-earned legacy overflow; resume production after collection creates space. */
export function produceDarkElixir(level: number, stored: number, seconds: number) {
  const { perHour, capacity } = darkDrillProduction(level);
  if (!Number.isFinite(stored) || stored < 0 || !Number.isFinite(seconds) || seconds < 0)
    throw new Error('Invalid Dark Elixir production state');
  return Math.max(stored, Math.min(capacity, stored + (seconds * perHour) / 3600));
}
