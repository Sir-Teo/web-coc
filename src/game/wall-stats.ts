import native from '../../reference/full-client/progression.json';
/** Undiscounted Home Village values. Source and compatibility notes: docs/WALL-PROGRESSION.md. */
export const WALL_LEVELS = [
  { hp: 100, cost: 0 },
  { hp: 200, cost: 1000 },
  { hp: 400, cost: 5000 },
  { hp: 800, cost: 10000 },
  { hp: 1200, cost: 20000 },
  { hp: 1800, cost: 30000 },
  { hp: 2400, cost: 50000 },
  { hp: 3000, cost: 75000 },
  // Retained for validated legacy saves; the playable Town Hall catalog ends at TH8.
  { hp: 3500, cost: 100000 },
  { hp: 4000, cost: 200000 },
  { hp: 5000, cost: 500000 },
  { hp: 7000, cost: 1000000 },
  ...native.buildings.wall.levels.slice(12).map((row) => ({ hp: row.hp, cost: row.cost })),
];

/** Maximum wall pieces at TH1 through TH8. Existing extras are never removed. */
export const WALL_COUNTS = [0, 25, 50, 75, 100, 125, 175, 225] as const;
