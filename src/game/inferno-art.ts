import raw from '../../reference/inferno/art-runtime.json';
import portraits from '../../reference/inferno/portraits.json';
import { infernoStats, type InfernoMode } from './inferno-weapon';
import {
  NATIVE_IDENTITY,
  nativeScenePoses,
  type NativeMatrix,
  type NativeMeshGraph,
} from './native-mesh';

export const INFERNO_GRAPH = raw as unknown as NativeMeshGraph;
export type InfernoArtState = 'active' | 'empty' | 'constructing' | 'upgrading' | 'ruin';

/** Original source layers. The world adapter supplies registration explicitly. */
export function infernoPoses(
  level: number,
  mode: InfernoMode,
  state: InfernoArtState,
  seconds: number,
  root: NativeMatrix = NATIVE_IDENTITY,
) {
  const { art } = infernoStats(level);
  if (!Number.isFinite(seconds) || seconds < 0) throw new Error('Invalid Inferno art time');
  const sample = (name: string, empty = false) =>
    nativeScenePoses(INFERNO_GRAPH, name, seconds, empty ? { ammo: false } : {}, root);
  if (state === 'ruin') return sample(art.ExportNameDamaged);
  const base = sample(art.ExportNameBase);
  if (state === 'constructing') return [...base, ...sample(art.ExportNameConstruction)];
  if (state === 'upgrading')
    return [
      ...base,
      ...sample(mode === 'multi' ? art.AlternateUpgradeExportName : art.ExportNameUpgradeAnim),
      ...sample(art.ExportNameBuildAnim),
    ];
  return [
    ...base,
    ...sample(mode === 'multi' ? art.AlternateExportName : art.ExportName, state === 'empty'),
  ];
}

export function infernoPortrait(level: number, mode: InfernoMode = 'single') {
  const portrait = portraits.portraits.find((row) => row.level === level && row.mode === mode);
  if (!portrait) throw new Error(`Unsupported Inferno portrait: ${level} ${mode}`);
  return portrait;
}
export const infernoTexture = (level: number, mode: InfernoMode = 'single') => {
  infernoPortrait(level, mode);
  return `inferno-level-${level}-${mode}`;
};
export const infernoAsset = (level: number, mode: InfernoMode = 'single') =>
  `/${infernoPortrait(level, mode).path}`;
