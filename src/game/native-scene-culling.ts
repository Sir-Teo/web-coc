import { includeNativeVertices, type NativeScenePose } from './native-mesh';

export interface NativeViewport {
  centerX: number;
  centerY: number;
  width: number;
  height: number;
}

const bounds = [0, 0, 0, 0];
/** Conservative leaf bounds; groups already carry their transforms on their leaves. */
function intersects(
  poses: readonly NativeScenePose[],
  left: number,
  top: number,
  right: number,
  bottom: number,
): boolean {
  for (const pose of poses) {
    if ('group' in pose) {
      if (intersects(pose.group, left, top, right, bottom)) return true;
      continue;
    }
    if (!pose.vertices.length) continue;
    bounds[0] = bounds[1] = Infinity;
    bounds[2] = bounds[3] = -Infinity;
    includeNativeVertices(pose, bounds);
    // Unknown geometry must fail open, rather than hiding a potentially visible effect.
    if (!bounds.every(Number.isFinite)) return true;
    if (bounds[0] <= right && bounds[2] >= left && bounds[1] <= bottom && bounds[3] >= top)
      return true;
  }
  return false;
}

/** Skip only effects whose complete transformed geometry is outside the padded viewport. */
export function nativeEffectInView(
  poses: readonly NativeScenePose[],
  x: number,
  y: number,
  view?: NativeViewport,
  padding = 0,
) {
  if (
    !view ||
    !Number.isFinite(padding) ||
    padding < 0 ||
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(view.centerX) ||
    !Number.isFinite(view.centerY) ||
    !(view.width > 0 && Number.isFinite(view.width)) ||
    !(view.height > 0 && Number.isFinite(view.height))
  )
    return true;
  const left = view.centerX - view.width / 2 - padding - x,
    right = view.centerX + view.width / 2 + padding - x,
    top = view.centerY - view.height / 2 - padding - y,
    bottom = view.centerY + view.height / 2 + padding - y;
  // Most particles originate on screen. Avoid a second geometry pass for that common case.
  if (left <= 0 && right >= 0 && top <= 0 && bottom >= 0) return true;
  return intersects(poses, left, top, right, bottom);
}
