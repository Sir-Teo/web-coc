import type { NativeMeshGraph } from './native-mesh';

export type NativeGeometryBounds = readonly [
  left: number,
  top: number,
  right: number,
  bottom: number,
];
/** false is known empty geometry; undefined means its extent is unknown. */
export type NativeGeometryExtent = NativeGeometryBounds | false | undefined;

const cached = new WeakMap<NativeMeshGraph, Map<number, NativeGeometryExtent>>();

/**
 * Conservative bounds over every source placement and child phase, including named controls.
 * Source graphs are immutable. Cache by graph/node identity without retaining unloaded graphs.
 */
export function nativeExportBounds(graph: NativeMeshGraph, name: string): NativeGeometryExtent {
  const root = graph.exports[name];
  if (!Number.isInteger(root)) return undefined;
  let nodes = cached.get(graph);
  if (!nodes) cached.set(graph, (nodes = new Map()));
  if (nodes.has(root)) return nodes.get(root);
  const visiting = new Set<number>();

  function visit(id: number): NativeGeometryExtent {
    if (nodes!.has(id)) return nodes!.get(id);
    if (visiting.has(id)) return undefined;
    visiting.add(id);
    const result = compute(id);
    visiting.delete(id);
    nodes!.set(id, result);
    return result;
  }

  function compute(id: number): NativeGeometryExtent {
    let left = Infinity,
      top = Infinity,
      right = -Infinity,
      bottom = -Infinity;
    const shapes = graph.shapes[id];
    if (shapes) {
      for (const [, vertices] of shapes) {
        if (vertices.length % 4) return undefined;
        for (let i = 0; i < vertices.length; i += 4) {
          const x = vertices[i],
            y = vertices[i + 1];
          if (!Number.isFinite(x) || !Number.isFinite(y)) return undefined;
          left = Math.min(left, x);
          top = Math.min(top, y);
          right = Math.max(right, x);
          bottom = Math.max(bottom, y);
        }
      }
    } else {
      const clip = graph.clips[id];
      if (!clip) return undefined;
      // Repeated placements with changing colors need only one geometry traversal.
      const placements = new Set<string>();
      for (const frame of clip.frames) {
        for (const [slot, transform] of frame) {
          const child = clip.children[slot],
            matrix = graph.matrices[transform];
          if (!Number.isInteger(child) || matrix?.length !== 6 || !matrix.every(Number.isFinite))
            return undefined;
          const key = `${child}:${transform}`;
          if (placements.has(key)) continue;
          placements.add(key);
          const bounds = visit(child);
          if (bounds === undefined) return undefined;
          if (bounds === false) continue;
          const [a, c, x, b, d, y] = matrix;
          const ax0 = a * bounds[0],
            ax1 = a * bounds[2],
            cy0 = c * bounds[1],
            cy1 = c * bounds[3],
            bx0 = b * bounds[0],
            bx1 = b * bounds[2],
            dy0 = d * bounds[1],
            dy1 = d * bounds[3];
          left = Math.min(left, x + Math.min(ax0, ax1) + Math.min(cy0, cy1));
          right = Math.max(right, x + Math.max(ax0, ax1) + Math.max(cy0, cy1));
          top = Math.min(top, y + Math.min(bx0, bx1) + Math.min(dy0, dy1));
          bottom = Math.max(bottom, y + Math.max(bx0, bx1) + Math.max(dy0, dy1));
        }
      }
    }
    if (left === Infinity) return false;
    const result: NativeGeometryBounds = [left, top, right, bottom];
    return result.every(Number.isFinite) ? result : undefined;
  }

  return visit(root);
}
