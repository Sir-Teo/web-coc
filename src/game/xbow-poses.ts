import source from '../../reference/xbow/runtime.json';
import { nativeMeshPoses, type NativeMatrix, type NativeMeshGraph } from './native-mesh';
import { XBOW_ART, xbowExport } from './xbow-art';
import type { XbowMode } from './xbow-stats';

export const XBOW_GRAPH = source as unknown as NativeMeshGraph;
export const XBOW_SOUNDS = source.sounds;
export function xbowPoses(
  level: number,
  mode: XbowMode,
  direction: number,
  seconds: number,
  ammunition: number,
  upgrading = false,
) {
  const { scale, anchorX, anchorY } = XBOW_ART;
  const matrix: NativeMatrix = [scale, 0, -anchorX * scale, 0, scale, -anchorY * scale];
  return nativeMeshPoses(
    XBOW_GRAPH,
    xbowExport(level, mode, upgrading),
    seconds,
    { turret: direction, ammo: ammunition > 0 ? direction : false },
    matrix,
  );
}
