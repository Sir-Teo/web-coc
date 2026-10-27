export interface NativeProjectileAim {
  at: number;
  x: number;
  y: number;
}

/** Fixed simulation observations keep past particle births independent of render cadence. */
export function recordNativeProjectileAim(
  shot: { nativeAim?: NativeProjectileAim[]; impact: number; x: number; y: number },
  elapsed: number,
) {
  const points = shot.nativeAim;
  if (!points) return;
  const at = Math.min(elapsed, shot.impact);
  if (at <= points[points.length - 1].at + 1e-9) return;
  // Retain stationary samples too: a later movement must not rewrite the preceding interval.
  points.push({ at, x: shot.x, y: shot.y });
}

/** Sample only captured aims, preserving the existing launch-to-deadline flight convention. */
export function nativeProjectileAimAt(
  shot: { nativeAim?: readonly NativeProjectileAim[]; x: number; y: number },
  at: number,
): { x: number; y: number } {
  const points = shot.nativeAim;
  if (!points?.length) return shot;
  if (at <= points[0].at) return points[0];
  const last = points[points.length - 1];
  if (at >= last.at) return last;
  let low = 0,
    high = points.length - 1;
  while (high - low > 1) {
    const middle = (low + high) >>> 1;
    if (points[middle].at <= at) low = middle;
    else high = middle;
  }
  const from = points[low],
    to = points[high];
  if (from.x === to.x && from.y === to.y) return from;
  const t = (at - from.at) / (to.at - from.at);
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
}
