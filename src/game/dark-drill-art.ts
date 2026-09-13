import raw from '../../reference/dark-drill/art-runtime.json';
import { darkDrillStats } from './dark-drill-stats';
import {
  NATIVE_IDENTITY,
  nativeScenePoses,
  type NativeMatrix,
  type NativeMeshGraph,
} from './native-mesh';

export const DARK_DRILL_GRAPH = raw as unknown as NativeMeshGraph;
export type DarkDrillArtState = 'working' | 'idle' | 'constructing' | 'upgrading' | 'ruin';

/** Original source layers with an explicit reservoir frame, independent of the body clock.
 * Working loops the complete source timeline; idle/upgrading hold its frame-zero idle pose.
 * Those state choices are local interpretations, not verified native executable behavior.
 */
export function darkDrillPoses(
  level: number,
  state: DarkDrillArtState,
  seconds: number,
  resourceFrame = 0,
  root: NativeMatrix = NATIVE_IDENTITY,
) {
  const { art } = darkDrillStats(level);
  if (!Number.isFinite(seconds) || seconds < 0) throw new Error('Invalid Drill art time');
  if (!Number.isInteger(resourceFrame) || resourceFrame < 0 || resourceFrame >= 100)
    throw new Error('Invalid Drill reservoir frame');
  const sample = (name: string, time = 0) =>
    nativeScenePoses(DARK_DRILL_GRAPH, name, time, { resource: resourceFrame }, root);
  if (state === 'ruin') return sample(art.ExportNameDamaged);
  const base = sample(art.ExportNameBase);
  if (state === 'constructing') return [...base, ...sample(art.ExportNameConstruction)];
  return [
    ...base,
    ...sample(art.ExportName, state === 'working' ? seconds : 0),
    ...(state === 'upgrading' ? sample(art.ExportNameBuildAnim) : []),
  ];
}
