/** Supercell client 18.400.21 tables; interpretation notes in docs/AIR-CONTROL.md. */
export const SWEEPER_LEVELS = [
  { hp: 750, cost: 200000, seconds: 14400, push: 1.6 },
  { hp: 800, cost: 300000, seconds: 21600, push: 2 },
  { hp: 850, cost: 450000, seconds: 28800, push: 2.4 },
  { hp: 900, cost: 800000, seconds: 43200, push: 2.8 },
] as const;

export const SWEEPER = {
  range: 15,
  minRange: 1,
  rate: 5,
  prepare: 0.6,
  speed: 6,
  offset: 1.25,
  cone: (105 * Math.PI) / 180,
  waveCone: Math.PI / 3,
  halfWidth: 2.5,
  // The client table does not define the displacement easing duration.
  pushSeconds: 0.6,
} as const;

export const SEEKING_MINE = {
  speed: 3.5,
  minHousing: 5,
  // Seven animation frames; this local timing assumes 30 fps.
  delay: 7 / 30,
} as const;

export const validDirection = (v: unknown) =>
  v === undefined || (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < 8);

/** Zero points along +x (screen lower-right); each step turns clockwise on the map. */
export const sweeperAngle = (direction = 0) => (direction * Math.PI) / 4;
export const sweeperStats = (level: number) => SWEEPER_LEVELS[Math.max(0, Math.min(3, level - 1))];
