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
  // Town Hall 9 permits both of these levels; the playable catalog then ends.
  { hp: 3500, cost: 100000 },
  { hp: 4000, cost: 200000 },
  // Retained for validated legacy saves above the playable catalog.
  { hp: 5000, cost: 500000 },
  { hp: 7000, cost: 1000000 },
  // Late single-player campaign levels (source rows 13–16); unreachable at home.
  { hp: 8000, cost: 1500000 },
  { hp: 9000, cost: 2000000 },
  { hp: 10000, cost: 3000000 },
  { hp: 11000, cost: 4000000 },
] as const;

/** Maximum wall pieces at TH1 through TH9. Existing extras are never removed. */
export const WALL_COUNTS = [0, 25, 50, 75, 100, 125, 175, 225, 250] as const;
