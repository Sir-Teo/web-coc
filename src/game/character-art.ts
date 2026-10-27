import { CHARACTER_GRAPHS, CHARACTER_GRAPH_ALIASES, PROJECTILE_GROUPS } from './character-catalog';
import type { NativeMeshGraph } from './native-mesh';

export type CharacterGraph = NativeMeshGraph & { shadowShapes?: number[] };
export interface CharacterGraphEntry {
  graph: CharacterGraph;
  /** Scene texture prefix; the No Flight Zone foundation keeps its established keys. */
  prefix: string;
  /** Original black-alpha ground shadow shapes rendered on their own layer. */
  shadows: readonly number[];
}
type Graphs = typeof import('./character-graphs');
type SharedGraphs = typeof import('./character-shared-graphs');
let graphs: Graphs | undefined;
let loading: Promise<Graphs> | undefined;
let shared: SharedGraphs | undefined;
let sharedLoading: Promise<SharedGraphs> | undefined;
const bodies = new Map<string, CharacterGraphEntry>();
const bodyLoads = new Map<string, Promise<void>>();
const orderedBodies: Record<string, CharacterGraphEntry> = {};
const graphKeys = new Map<string, string>();
/**
 * Fetches the requested body graphs and shared death/projectiles. Explicit callers without
 * a roster retain the full preload. Failed module requests remain retryable.
 */
function loaders(): Promise<Graphs> {
  loading ??= import('./character-graphs').then(
    (module) => (graphs = module),
    (error) => {
      loading = undefined;
      throw error;
    },
  );
  return loading;
}
function graphKey(animation: string) {
  const known = graphKeys.get(animation);
  if (known) return known;
  if (!graphs) return undefined;
  const target = aliasTarget(animation).replaceAll(' ', '');
  const key = Object.keys(graphs.CHARACTER_LOADERS).find(
    (name) => name.replaceAll(' ', '') === target,
  );
  if (key) graphKeys.set(animation, key);
  return key;
}
function loadBody(key: string, module: Graphs) {
  if (bodies.has(key)) return Promise.resolve();
  const pending = bodyLoads.get(key);
  if (pending) return pending;
  const request = module.CHARACTER_LOADERS[key]()
    .then((entry) => {
      bodies.set(key, entry);
      // Keep the original catalog order, regardless of network completion order.
      for (const name of Object.keys(orderedBodies)) delete orderedBodies[name];
      for (const name of Object.keys(module.CHARACTER_LOADERS)) {
        const body = bodies.get(name);
        if (body) orderedBodies[name] = body;
      }
    })
    .finally(() => {
      if (bodyLoads.get(key) === request) bodyLoads.delete(key);
    });
  bodyLoads.set(key, request);
  return request;
}
export async function loadCharacterArt(animations?: ReadonlySet<string>): Promise<void> {
  const module = await loaders();
  sharedLoading ??= module.loadSharedCharacterGraphs().then(
    (value) => (shared = value),
    (error) => {
      sharedLoading = undefined;
      throw error;
    },
  );
  const keys = animations
    ? [...animations].map((animation) => {
        const key = graphKey(animation);
        if (!key) throw Error(`Missing native character art: ${animation}`);
        return key;
      })
    : Object.keys(module.CHARACTER_LOADERS);
  await Promise.all([
    sharedLoading.then((value) => value.loadProjectileGroups(animations)),
    ...[...new Set(keys)].map((key) => loadBody(key, module)),
  ]);
}
export const characterArtLoaded = (animation?: string) =>
  !!shared &&
  (animation === undefined ||
    (bodies.has(graphKey(animation) ?? '') && shared.projectileGroupsLoaded(animation)));
const loaded = () => {
  if (!shared) throw new Error('Character art is not loaded yet');
  return shared;
};
/** Captured native character graphs, keyed by animation block. */
export const characterArts = (): Record<string, CharacterGraphEntry> => {
  loaded();
  return orderedBodies;
};
export const commonDeathArt = (): CharacterGraphEntry => loaded().COMMON_DEATH_ART;
/** Projectile exports grouped by their original file. */
export const projectileArts = (): Record<string, CharacterGraphEntry> => loaded().PROJECTILE_ART;
/** Later projectile rows keep their own graphs (Witch bolt, Bowler boulder, Lava Hound shots). */
export const projectileGroupArts = (): Record<string, CharacterGraphEntry> =>
  loaded().PROJECTILE_GROUP_ART;
const projectileCache = new Map<string, CharacterGraphEntry>();
const projectileGroups = new Map<string, string | undefined>();
const projectileGroup = (name: string) => {
  if (projectileGroups.has(name)) return projectileGroups.get(name);
  const group = Object.entries(PROJECTILE_GROUPS).find(([, names]) => names.includes(name))?.[0];
  projectileGroups.set(name, group);
  return group;
};
/** Recorded shots can exist while their character's independent graph is still pending. */
export const projectileArtLoaded = (name: string, swf: string) => {
  const group = projectileGroup(name);
  return !!shared && !!(group ? shared.PROJECTILE_GROUP_ART[group] : shared.PROJECTILE_ART[swf]);
};
/** The graph holding a projectile row's export: its later group, else its original file. */
export function projectileArt(name: string, swf: string) {
  const cacheKey = `${name}\n${swf}`;
  const known = projectileCache.get(cacheKey);
  if (known) return known;
  const group = projectileGroup(name);
  const art = group ? projectileGroupArts()[group] : projectileArts()[swf];
  if (!art) throw Error(`Missing native projectile art: ${name}`);
  projectileCache.set(cacheKey, art);
  return art;
}
/** Resolve graph aliases (GolemSmall_lvl6 names exactly the Golem_lvl6 exports). */
const aliasTarget = (animation: string) => {
  const alias = Object.keys(CHARACTER_GRAPH_ALIASES).find(
    (name) => name.replaceAll(' ', '') === animation.replaceAll(' ', ''),
  );
  return alias ? CHARACTER_GRAPHS[CHARACTER_GRAPH_ALIASES[alias]].animation! : animation;
};
// Several lookups per garrison defender per frame: resolve each animation name once.
const artCache = new Map<string, CharacterGraphEntry>();
export function characterArt(animation: string) {
  const known = artCache.get(animation);
  if (known) return known;
  const key = graphKey(animation);
  const art = key && bodies.get(key);
  if (!art) throw Error(`Missing native character art: ${animation}`);
  artCache.set(animation, art);
  return art;
}
/** Imported previews (idle frame zero, two pixels per native unit) and their padded icons. */
export function characterPreview(animation: string) {
  const target = aliasTarget(animation);
  const key = Object.entries(CHARACTER_GRAPHS).find(([, g]) => g.animation === target)?.[0];
  return key
    ? {
        preview: `/assets/characters-native/${key}/preview.png`,
        icon: `/assets/characters-native/${key}/icon.png`,
      }
    : undefined;
}
