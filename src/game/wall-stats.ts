import { namedLevels } from './townhall-catalog';

/** Undiscounted Home Village values; the original rows are pinned in reference/townhall.
 * Source and compatibility notes: docs/WALL-PROGRESSION.md. */
export const WALL_LEVELS = namedLevels('Wall').map((row) => ({ hp: row.hp!, cost: row.cost }));
