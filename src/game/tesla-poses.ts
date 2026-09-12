import source from '../../reference/tesla/runtime.json';
import {
  nativeScenePoses,
  nativeVertices,
  type NativeMeshGraph,
  type NativeScenePose,
} from './native-mesh';
import { TESLA_ART } from './tesla-art';

export const TESLA_GRAPH = source as unknown as NativeMeshGraph;
export const TESLA_APPEAR_SOUND = source.sounds['sfx/tesla_appear_01.ogg'];
export type TeslaVisualState = 'setup' | 'reveal' | 'constructing' | 'upgrading' | 'ruin';

export function teslaPoses(
  level: number,
  state: TeslaVisualState,
  seconds: number,
  reduced = false,
): NativeScenePose[] {
  const row = source.levels[level - 1];
  if (!row) throw Error(`Unsupported native Tesla level: ${level}`);
  const { scale, anchorX, anchorY } = TESLA_ART;
  const root: [number, number, number, number, number, number] = [
    scale,
    0,
    -anchorX * scale,
    0,
    scale,
    -anchorY * scale,
  ];
  const sample = (name: string, time: number, controls: Record<string, number | false> = {}) =>
    nativeScenePoses(TESLA_GRAPH, name, time, controls, root);
  if (state === 'ruin') return sample(row.ExportNameDamaged, 0);
  if (state === 'constructing') return sample(row.ExportNameConstruction, 0);
  if (state === 'upgrading')
    return [
      ...sample(row.ExportName, 0, { idle_electricity: false }),
      ...sample(row.ExportNameBuildAnim, 0),
    ];
  if (state === 'setup')
    return sample(row.ExportName, seconds, reduced ? { idle_electricity: false } : {});
  const clip = TESLA_GRAPH.clips[TESLA_GRAPH.exports[row.ExportNameTriggered]];
  const last = clip.timeline.length - 1;
  const frame = Math.floor(Math.max(0, Number.isFinite(seconds) ? seconds : 0) * clip.fps + 1e-9);
  // Hold the last reveal composition, while the separately placed electricity
  // keeps its own clock. Replaying the root would hide the tower every 0.75 s.
  return sample(row.ExportNameTriggered, (reduced ? last : Math.min(last, frame)) / clip.fps, {
    idle_electricity: reduced ? false : Math.max(0, frame - last),
  });
}

const bounds = new Map<string, [number, number, number, number]>();
/** Native foreground extent for picking, bars and the temporary beam registration. */
export function teslaBodyBounds(
  level: number,
  state: Exclude<TeslaVisualState, 'reveal'> = 'setup',
) {
  const key = `${level}:${state}`;
  let cached = bounds.get(key);
  if (!cached) {
    let left = Infinity,
      top = Infinity,
      right = -Infinity,
      bottom = -Infinity;
    for (const pose of teslaPoses(level, state, 0, true)) {
      if ('group' in pose) continue;
      const vertices = nativeVertices(pose);
      for (let i = 0; i < vertices.length; i += 4) {
        left = Math.min(left, vertices[i]);
        right = Math.max(right, vertices[i]);
        top = Math.min(top, vertices[i + 1]);
        bottom = Math.max(bottom, vertices[i + 1]);
      }
    }
    cached = [left, top, right, bottom];
    bounds.set(key, cached);
  }
  return cached;
}
