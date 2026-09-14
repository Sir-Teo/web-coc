import catalog from '../../reference/garrison/catalog.json' with { type: 'json' };
import raw from '../../reference/garrison/castle.json' with { type: 'json' };
import {
  nativeScenePoses,
  nativeVertices,
  type NativeScenePose,
  type NativeMeshGraph,
  type NativeMatrix,
} from './native-mesh';

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

const boundsCache = new Map<string, [number, number, number, number]>();
/** Bounds of the exact displayed source pose, including construction/scaffold/ruin variants. */
export function castleBounds(
  level: number,
  state: 'setup' | 'ruin' | 'constructing' | 'upgrading' = 'setup',
): [number, number, number, number] {
  const key = `${level}:${state}`;
  const cached = boundsCache.get(key);
  if (cached) return cached;
  const bounds: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
  const visit = (poses: NativeScenePose[]) => {
    for (const pose of poses) {
      if ('group' in pose) visit(pose.group);
      else {
        const vertices = nativeVertices(pose);
        for (let i = 0; i < vertices.length; i += 4) {
          bounds[0] = Math.min(bounds[0], vertices[i]);
          bounds[1] = Math.min(bounds[1], vertices[i + 1]);
          bounds[2] = Math.max(bounds[2], vertices[i]);
          bounds[3] = Math.max(bounds[3], vertices[i + 1]);
        }
      }
    }
  };
  visit(castlePoses(level, state === 'setup' ? 'guard' : state));
  if (!bounds.every(Number.isFinite)) throw Error('Empty original Clan Castle pose');
  boundsCache.set(key, bounds);
  return bounds;
}
