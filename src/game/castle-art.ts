import catalog from '../../reference/garrison/catalog.json';
import raw from '../../reference/garrison/castle.json';
import { nativeScenePoses, type NativeMeshGraph, type NativeMatrix } from './native-mesh';

export const CASTLE_LEVELS = catalog.castles['Clan Castle'];
export const castleStats = (level: number) => CASTLE_LEVELS.find((r) => r.level === level);
export const castleTexture = (level = 1) => `clancastle-level-${level}`;
export const castleAsset = (level = 1) => `/assets/garrison-native/castle/castle-${level}.png`;
export const CASTLE_GRAPH = raw as unknown as NativeMeshGraph;
/** Original portrait bounds; local world registration shares the native building anchor. */
export const CASTLE_ART = {
  width: 199 * 1.2,
  height: 242 * 1.2,
  originX: 105 / 199,
  originY: 180 / 242,
};
export function castlePoses(
  level: number,
  state: 'guard' | 'ruin' | 'constructing' | 'upgrading' = 'guard',
) {
  const row = castleStats(level);
  if (!row) throw Error(`Unsupported Clan Castle level: ${level}`);
  const root: NativeMatrix = [1.2, 0, 0, 0, 1.2, -96];
  const controls = {
    CoinsBackFull: false,
    CoinsBackHalf: false,
    CoinsFrontFull: false,
    CoinsFrontHalf: false,
    CoinsRoofFull: false,
    CoinsRoofHalf: false,
    badge: false,
    alliance_name: false,
    shadow_edit: false,
  } as const;
  // The 94-frame body timeline is sleep animation. A guarding Castle holds frame zero.
  const sample = (name: string) => nativeScenePoses(CASTLE_GRAPH, name, 0, controls, root);
  if (state === 'ruin') return sample(row.rubble);
  return [
    ...sample(row.base),
    ...sample(state === 'constructing' ? row.construction : row.body),
    ...(state === 'upgrading' ? sample(row.scaffold) : []),
  ];
}
