import type Phaser from 'phaser';
import type { AudioManager } from './audio';
import type { Battle, Building } from './model';
import type { SampleCue } from './sample-audio';
import { presentationTime } from './presentation-clock';
import { ALL_LATE_BUILDING_ART, LATE_BUILDING_ART } from './late-building-demand';

export interface LateRenderContext {
  /** Buildings currently visible to the player (concealed traps are excluded). */
  buildings: Building[];
  battle: Battle | null;
  /**
   * Battle time (the presentation clock: it runs on for a short grace after the finish),
   * or the home render clock outside battle.
   */
  elapsed: number;
  reduced: boolean;
  iso: (x: number, y: number) => { x: number; y: number };
  airLift: number;
}
export interface LatePresentation {
  /** False when body textures failed; another family in the same batch can still render. */
  readonly artReady?: boolean;
  handles(building: Building): boolean;
  /** Registered source bounds relative to the building's ground center. */
  bounds(building: Building): readonly [number, number, number, number] | undefined;
  render(context: LateRenderContext): SampleCue[];
  clear(): void;
  destroy(): void;
}

type Preloader = (scene: Phaser.Scene, fetching?: (key: string) => boolean) => void;
interface PreparedFamily {
  preload: Preloader;
  create: (scene: Phaser.Scene, audio: AudioManager) => LatePresentation;
}
const WORKER_FAMILY = 1 << 9;
const FAMILIES: readonly [number, () => Promise<PreparedFamily>][] = [
  [
    LATE_BUILDING_ART.spellTower,
    () =>
      import('./spell-tower-scene').then((module) => ({
        preload: module.preloadSpellTower,
        create: (scene: Phaser.Scene, audio: AudioManager) =>
          new module.SpellTowerPresentation(scene, audio),
      })),
  ],
  [
    LATE_BUILDING_ART.tornadoTrap,
    () =>
      import('./tornado-trap-scene').then((module) => ({
        preload: module.preloadTornadoTrap,
        create: (scene: Phaser.Scene, audio: AudioManager) =>
          new module.TornadoTrapPresentation(scene, audio),
      })),
  ],
  [
    LATE_BUILDING_ART.freezeTrap,
    () =>
      import('./freeze-trap-scene').then((module) => ({
        preload: module.preloadFreezeTrap,
        create: (scene: Phaser.Scene, audio: AudioManager) =>
          new module.FreezeTrapPresentation(scene, audio),
      })),
  ],
  [
    LATE_BUILDING_ART.ghostTrap,
    () =>
      import('./ghost-trap-scene').then((module) => ({
        preload: module.preloadGhostTrap,
        create: (scene: Phaser.Scene, audio: AudioManager) =>
          new module.GhostTrapPresentation(scene, audio),
      })),
  ],
  [
    LATE_BUILDING_ART.eagleArtillery,
    () =>
      import('./eagle-artillery-scene').then((module) => ({
        preload: module.preloadEagleArtillery,
        create: (scene: Phaser.Scene, audio: AudioManager) =>
          new module.EagleArtilleryPresentation(scene, audio),
      })),
  ],
  [
    LATE_BUILDING_ART.scattershot,
    () =>
      import('./scattershot-scene').then((module) => ({
        preload: module.preloadScattershot,
        create: (scene: Phaser.Scene, audio: AudioManager) =>
          new module.ScattershotPresentation(scene, audio),
      })),
  ],
  [
    LATE_BUILDING_ART.monolith,
    () =>
      import('./monolith-scene').then((module) => ({
        preload: module.preloadMonolith,
        create: (scene: Phaser.Scene, audio: AudioManager) =>
          new module.MonolithPresentation(scene, audio),
      })),
  ],
  [
    LATE_BUILDING_ART.goblinBuildings,
    () =>
      import('./late-goblin-buildings-scene').then((module) => ({
        preload: module.preloadLateGoblinBuildings,
        create: (scene: Phaser.Scene, audio: AudioManager) =>
          new module.LateGoblinBuildingsPresentation(scene, audio),
      })),
  ],
  [
    LATE_BUILDING_ART.builderHut,
    () =>
      import('./builder-hut-scene').then((module) => ({
        preload: module.preloadBuilderHut,
        create: (scene: Phaser.Scene, audio: AudioManager) =>
          new module.BuilderHutPresentation(scene, audio),
      })),
  ],
  [
    WORKER_FAMILY,
    () =>
      import('./defending-builder-scene').then((module) => ({
        preload: () => {},
        create: (scene: Phaser.Scene, audio: AudioManager) =>
          new module.DefendingBuilderPresentation(scene, audio),
      })),
  ],
];
const prepared = new Map<number, PreparedFamily>();
const loading = new Map<number, Promise<void>>();
/** Fetch only the presentation graphs the scene can draw; retry failed modules on demand. */
export async function prepareLateCampaign(mask = ALL_LATE_BUILDING_ART, workers = true) {
  const requested = mask | (workers ? WORKER_FAMILY : 0);
  await Promise.all(
    FAMILIES.filter(([family]) => requested & family).map(([family, load]) => {
      let pending = loading.get(family);
      if (!pending) {
        pending = load().then(
          (module) => {
            prepared.set(family, module);
          },
          (error) => {
            loading.delete(family);
            throw error;
          },
        );
        loading.set(family, pending);
      }
      return pending;
    }),
  );
}

/** Explicit callers keep the full preload; the scene can request individual families. */
export function preloadLateCampaign(
  scene: Phaser.Scene,
  mask = ALL_LATE_BUILDING_ART,
  onTextures?: (family: number, keys: string[]) => void,
  fetching?: (key: string) => boolean,
) {
  for (const [family] of FAMILIES) {
    if (!(mask & family)) continue;
    const queued = onTextures ? new Set(scene.load.list) : undefined;
    const module = prepared.get(family);
    if (!module) throw new Error(`Late presentation ${family} has not been prepared`);
    module.preload(scene, fetching);
    if (onTextures)
      onTextures(
        family,
        [...scene.load.list]
          .filter(
            (file) => !queued!.has(file) && (file.type === 'image' || file.type === 'spritesheet'),
          )
          .map((file) => file.key),
      );
  }
}

/** One scene entry point for every late single-player campaign family. */
export class LateCampaignPresentation {
  private families: LatePresentation[];
  constructor(scene: Phaser.Scene, audio: AudioManager) {
    this.families = FAMILIES.flatMap(([family]) => {
      const module = prepared.get(family);
      return module ? [module.create(scene, audio)] : [];
    }).filter((family) => {
      if (family.artReady !== false) return true;
      family.destroy();
      return false;
    });
  }
  handles(building: Building) {
    return this.families.some((family) => family.handles(building));
  }
  bounds(building: Building) {
    for (const family of this.families)
      if (family.handles(building)) return family.bounds(building);
    return undefined;
  }
  render(context: LateRenderContext) {
    // Transient effects play out on the presentation clock after the battle finishes.
    if (context.battle) context = { ...context, elapsed: presentationTime(context.battle) };
    return this.families.flatMap((family) => family.render(context));
  }
  clear() {
    for (const family of this.families) family.clear();
  }
  destroy() {
    for (const family of this.families) family.destroy();
  }
}
