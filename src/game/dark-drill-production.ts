import catalog from '../../reference/dark-drill/catalog.json';

export function darkDrillProduction(level: number) {
  const row = catalog.levels.find((row) => row.level === level);
  if (!row) throw new Error(`Unsupported Dark Elixir Drill level: ${level}`);
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
