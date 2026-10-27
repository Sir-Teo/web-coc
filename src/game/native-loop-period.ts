import type { NativeMeshGraph } from './native-mesh';

interface Loop {
  period: number;
  warmup: number;
}

// Bounds on metadata work and integer-clock arithmetic; other graphs keep their raw keys.
const MAX_PERIOD = 4096;
const MAX_WARMUP = 65_536;
const MAX_FRAME = 1_000_000_000;
const loops = new WeakMap<NativeMeshGraph, Map<number, Loop | null>>();

function gcd(a: number, b: number) {
  while (b) {
    const next = a % b;
    a = b;
    b = next;
  }
  return a;
}

function combinedPeriod(a: number, b: number) {
  const period = (a / gcd(a, b)) * b;
  return Number.isSafeInteger(period) && period <= MAX_PERIOD ? period : null;
}

/** A repeat period includes continuously present children's independent source clocks. */
function loopFor(graph: NativeMeshGraph, id: number, ancestors?: Set<number>): Loop | null {
  let byClip = loops.get(graph);
  if (!byClip) loops.set(graph, (byClip = new Map()));
  const known = byClip.get(id);
  if (known !== undefined) return known;
  // Allocate traversal state only when deriving metadata, never on a cached lookup.
  ancestors ??= new Set();
  if (ancestors.has(id) || ancestors.size >= 32) return null;
  const clip = graph.clips[id];
  if (
    !clip ||
    !Number.isInteger(clip.fps) ||
    clip.fps < 1 ||
    clip.fps > 240 ||
    !clip.timeline.length ||
    clip.timeline.length > MAX_PERIOD
  ) {
    byClip.set(id, null);
    return null;
  }
  let period = clip.timeline.length;
  let warmup = period;
  let valid = true;
  ancestors.add(id);
  const slots = new Set(clip.timeline.flatMap((frame) => clip.frames[frame].map((p) => p[0])));
  for (const slot of slots) {
    // A removed child's clock resets on placement. Its bounded ages already repeat with
    // the parent, once the first source loop's initial-age clamp has passed.
    if (!clip.timeline.every((frame) => clip.frames[frame].some((p) => p[0] === slot))) continue;
    const childId = clip.children[slot];
    if (graph.shapes[childId]) continue;
    const child = graph.clips[childId];
    const nested = loopFor(graph, childId, ancestors);
    if (!child || !nested) {
      valid = false;
      break;
    }
    // The parent must advance a whole number of the child's periods at its own FPS.
    const numerator = clip.fps * nested.period;
    const next = combinedPeriod(period, numerator / gcd(numerator, child.fps));
    if (next === null) {
      valid = false;
      break;
    }
    period = next;
    warmup = Math.max(warmup, Math.ceil((nested.warmup * clip.fps) / child.fps));
  }
  ancestors.delete(id);
  const loop = valid && warmup <= MAX_WARMUP ? { period, warmup } : null;
  byClip.set(id, loop);
  return loop;
}

/** Cache identity only: the sampler still receives the caller's original clock. */
export function nativeSharedFrame(graph: NativeMeshGraph, id: number, frame: number) {
  if (graph.shapes[id]) return 0;
  const clip = graph.clips[id];
  // First-use draws and clamped non-looping clips need no period analysis. Very old clocks
  // retain their exact raw key rather than relying on large-integer phase arithmetic.
  if (!clip || frame < clip.timeline.length || !Number.isSafeInteger(frame) || frame > MAX_FRAME)
    return frame;
  const loop = loopFor(graph, id);
  return loop && frame >= loop.warmup ? loop.warmup + ((frame - loop.warmup) % loop.period) : frame;
}
