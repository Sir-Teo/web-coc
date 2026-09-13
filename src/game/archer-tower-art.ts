import definitions from '../../reference/archer-tower/native.json';
import body from '../../reference/archer-tower/buildings-runtime.json';
import actors from '../../reference/archer-tower/defenders-runtime.json';
import animations from '../../reference/archer-tower/defenders-source.json';
import {
  nativeScenePoses,
  NATIVE_IDENTITY,
  type NativeMatrix,
  type NativeMeshGraph,
} from './native-mesh';
export const ARCHER_TOWER_GRAPH = body as unknown as NativeMeshGraph;
export const TOWER_ARCHER_GRAPH = actors as unknown as NativeMeshGraph;
export type ArcherTowerState = 'ready' | 'constructing' | 'upgrading' | 'ruin';
export const archerTowerSource = (level: number): Record<string, string> => {
  if (!Number.isInteger(level) || level < 1 || level > definitions.levels.length)
    throw Error(`Unsupported original Archer Tower tier: ${level}`);
  return definitions.levels[level - 1] as Record<string, string>;
};
const timeValid = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds < 0) throw Error('Invalid Archer Tower artwork time');
};
/** Explicit source state sampling. World registration and gear-up eligibility belong to callers. */
export function archerTowerPoses(
  level: number,
  state: ArcherTowerState,
  seconds: number,
  alternate = false,
  root: NativeMatrix = NATIVE_IDENTITY,
) {
  const row = archerTowerSource(level);
  timeValid(seconds);
  if (alternate && !row.AlternateExportName)
    throw Error(`No original alternate Archer Tower artwork at tier ${level}`);
  const sample = (name: string) => nativeScenePoses(ARCHER_TOWER_GRAPH, name, seconds, {}, root);
  if (state === 'ruin') return sample(row.ExportNameDamaged);
  const base = sample(row.ExportNameBase);
  if (state === 'constructing') return [...base, ...sample(row.ExportNameConstruction)];
  return [
    ...base,
    ...sample(alternate ? row.AlternateExportName : row.ExportName),
    ...(state === 'upgrading' ? sample(row.ExportNameBuildAnim) : []),
  ];
}
/** Source direction suffixes are explicit; this function does not infer facing or shot timing. */
export function towerArcherPoses(
  level: number,
  action: 'idle' | 'attack',
  direction: 1 | 2 | 3,
  seconds: number,
  root: NativeMatrix = NATIVE_IDENTITY,
) {
  const definition = archerTowerSource(level);
  timeValid(seconds);
  if (![1, 2, 3].includes(direction)) throw Error('Invalid original Archer direction');
  const table = animations.animations as unknown as Record<
    string,
    { rows: Record<string, string>[] }
  >;
  const row = table[definition.DefenderCharacter].rows.find((row) => row.Name === action);
  if (!row) throw Error('Missing original Archer action');
  const name = `${row.ExportName}_${direction}`;
  const clip = TOWER_ARCHER_GRAPH.clips[TOWER_ARCHER_GRAPH.exports[name]];
  const time =
    row.Looping === 'TRUE' ? seconds : Math.min(seconds, (clip.timeline.length - 1) / clip.fps);
  return nativeScenePoses(TOWER_ARCHER_GRAPH, name, time, {}, root);
}
