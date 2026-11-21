import { DEPLOY_MARGIN } from './grid';

/**
 * Joins unit tile edges ([x0, y0, x1, y1], each one tile long and axis aligned) that continue
 * each other into longer segments, so an outline records a few hundred lines, not thousands.
 */
export function mergeEdges(edges: readonly number[][]) {
  const horizontal = new Map<number, number[]>(),
    vertical = new Map<number, number[]>();
  for (const [x0, y0, x1, y1] of edges) {
    if (y0 === y1) {
      const row = horizontal.get(y0) ?? [];
      row.push(Math.min(x0, x1));
      horizontal.set(y0, row);
    } else {
      const column = vertical.get(x0) ?? [];
      column.push(Math.min(y0, y1));
      vertical.set(x0, column);
    }
  }
  const merged: number[][] = [];
  const runs = (starts: number[], emit: (from: number, to: number) => void) => {
    starts.sort((a, b) => a - b);
    let from = starts[0],
      to = from + 1;
    for (let i = 1; i < starts.length; i++) {
      // Duplicated edges (two blocked sides meeting) stay one line.
      if (starts[i] <= to) to = Math.max(to, starts[i] + 1);
      else {
        emit(from, to);
        from = starts[i];
        to = from + 1;
      }
    }
    emit(from, to);
  };
  for (const [y, starts] of horizontal) runs(starts, (a, b) => merged.push([a, y, b, y]));
  for (const [x, starts] of vertical) runs(starts, (a, b) => merged.push([x, a, x, b]));
  return merged;
}

export const DEPLOY_CELLS_PER_TILE = 2;

/** Outline the union of the exclusion rectangles at the model's half-tile coordinates. */
export function deploymentBoundary(
  footprints: readonly { x: number; y: number; size: number }[],
  mapSize: number,
  grid: Uint8Array,
) {
  const scale = DEPLOY_CELLS_PER_TILE;
  const size = mapSize * scale;
  const start = scale;
  const end = size - scale;
  grid.fill(0);
  for (const building of footprints) {
    const x0 = Math.max(start, (building.x - DEPLOY_MARGIN) * scale);
    const x1 = Math.min(end, (building.x + building.size + DEPLOY_MARGIN) * scale);
    const y0 = Math.max(start, (building.y - DEPLOY_MARGIN) * scale);
    const y1 = Math.min(end, (building.y + building.size + DEPLOY_MARGIN) * scale);
    if (x0 >= x1) continue;
    for (let y = y0; y < y1; y++) grid.fill(1, y * size + x0, y * size + x1);
  }
  const blocked = (x: number, y: number) =>
    x < start || y < start || x >= end || y >= end || grid[y * size + x] === 1;
  const edges: number[][] = [];
  for (let y = start; y < end; y++)
    for (let x = start; x < end; x++) {
      if (!blocked(x, y)) continue;
      if (!blocked(x - 1, y)) edges.push([x, y, x, y + 1]);
      if (!blocked(x + 1, y)) edges.push([x + 1, y, x + 1, y + 1]);
      if (!blocked(x, y - 1)) edges.push([x, y, x + 1, y]);
      if (!blocked(x, y + 1)) edges.push([x, y + 1, x + 1, y + 1]);
    }
  return mergeEdges(edges).map((edge) => edge.map((coordinate) => coordinate / scale));
}
