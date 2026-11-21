import Phaser from 'phaser';
import type { Battle, Building } from './model';
import { NativeMeshView, preloadNativeMeshes } from './native-mesh-scene';
import { DARK_STORAGE_GRAPH, darkStoragePoses } from './dark-storage-poses';
import { DARK_STORAGE_LEVELS } from './dark-storage-stats';
import { darkStorageAsset, darkStorageTexture, darkStorageFrame } from './dark-storage-art';
import { darkStorageFill } from './dark-storage-fill';
import { NativeSceneView, quantizedDensity } from './native-scene-view';
import { castleGraph } from './castle-graph';
import { nativeScenePoses, type NativeMatrix } from './native-mesh';
import { guardRender } from './render-guard';
import { NativeEffectLayer } from './native-effect-layer';
import type { NativeArtPack, NativeArtPacks } from './native-art-pack';
import { presentationLive, presentationTime } from './presentation-clock';

const DESTROY_EFFECT = 'Elixir Storage Destroyed';

/**
 * The Dark Elixir Storage source file has only its level bodies: no construction or upgrade
 * export. The source reuses one 3×3 scaffold across buildings (`alliance_castle_upg` is also
 * the Cannon's scaffold from level 8), and the generic 3×3 construction pile; both live in the
 * Clan Castle graph (texture prefix `clancastle`), registered like the other three-tile native
 * buildings. The graph loads with this family too; the textures come with the Clan Castle's.
 */
const SCAFFOLD_EXPORT = 'alliance_castle_upg';
const CONSTRUCTION_EXPORT = 'generic_construction_state3';
const THREE_TILE_ROOT: NativeMatrix = [1.2, 0, 0, 0, 1.2, -96];
/** Still frame-zero poses like the castle's own scaffold (sampled once per state). */
function sitePoses(state: 'constructing' | 'upgrading') {
  return nativeScenePoses(
    castleGraph(),
    state === 'constructing' ? CONSTRUCTION_EXPORT : SCAFFOLD_EXPORT,
    0,
    {},
    THREE_TILE_ROOT,
  );
}

export function preloadDarkStorages(scene: Phaser.Scene) {
  preloadNativeMeshes(scene, DARK_STORAGE_GRAPH, 'dark-storage');
  for (const { level } of DARK_STORAGE_LEVELS)
    scene.load.image(darkStorageTexture(level), darkStorageAsset(level));
}
export class DarkStoragePresentation {
  readonly storages = new Map<number, NativeMeshView>();
  /** Construction pile / upgrade scaffold views while a storage is being built or upgraded. */
  readonly sites = new Map<number, NativeSceneView>();
  private signatures = new Map<number, string>();
  private destruction: NativeEffectLayer;
  constructor(
    private scene: Phaser.Scene,
    effects: NativeArtPacks<NativeArtPack>,
  ) {
    this.destruction = new NativeEffectLayer(scene, effects, 'dark-storage-destruction');
  }
  coversDestruction() {
    return this.destruction.status(DESTROY_EFFECT) === 'ready';
  }
  clear() {
    for (const view of this.storages.values()) view.destroy();
    this.storages.clear();
    for (const view of this.sites.values()) view.destroy();
    this.sites.clear();
    this.signatures.clear();
    this.destruction.clear();
  }
  destroy() {
    this.clear();
  }
  render(
    buildings: Building[],
    battle: Battle | null,
    dark: number,
    capacity: number,
    reduced: boolean,
    iso: (x: number, y: number) => { x: number; y: number },
  ) {
    const wanted = new Set<number>();
    const camera = this.scene.cameras.main;
    const zoom = quantizedDensity(Math.max(1, camera.zoomX, camera.zoomY));
    this.destruction.begin();
    const elapsed = battle && presentationLive(battle) ? presentationTime(battle) : Infinity;
    for (const storage of buildings) {
      if (storage.kind !== 'darkstorage') continue;
      if (battle && !storage.npc && !reduced && Number.isFinite(elapsed)) {
        // Warm the assigned effect while the intact storage is still visible.
        const duration = this.destruction.duration(DESTROY_EFFECT);
        const at = battle.darkStorageDestroyedAt?.[storage.id];
        if (at !== undefined && duration !== undefined && elapsed >= at && elapsed < at + duration)
          this.destruction.play(
            {
              key: `dark-storage:${storage.id}`,
              effect: DESTROY_EFFECT,
              at,
              ground: iso(storage.x + 1.5, storage.y + 1.5),
            },
            elapsed,
            false,
          );
      }
      if (storage.hp <= 0) continue;
      wanted.add(storage.id);
      let view = this.storages.get(storage.id);
      if (!view) {
        view = new NativeMeshView(this.scene, 'dark-storage');
        this.storages.set(storage.id, view);
      }
      const fraction = darkStorageFill(storage, battle, dark, capacity);
      const frame = darkStorageFrame(fraction);
      const p = iso(storage.x + 1.5, storage.y + 1.5),
        alpha = storage.constructing ? 0.58 : 1;
      const site = storage.constructing ? 'constructing' : storage.upgradeEnd ? 'upgrading' : '';
      const signature = `${storage.level}:${frame}:${site}:${p.x}:${p.y}:${alpha}:${site ? zoom : ''}`;
      if (this.signatures.get(storage.id) === signature) continue;
      this.signatures.set(storage.id, signature);
      view.render(
        guardRender(
          `dark storage level ${storage.level}`,
          () => darkStoragePoses(storage.level, fraction),
          [],
        ),
        p.x,
        p.y,
        p.y,
        alpha,
      );
      const data = { id: storage.id, level: storage.level, frame };
      for (const mesh of view.meshes.values()) mesh.setData('darkStorage', data);
      // A building site: the translucent storage under the source construction pile, or the
      // shared scaffold over the storage while it upgrades (the fallback sprite stays hidden).
      let scaffold = this.sites.get(storage.id);
      if (site) {
        if (!scaffold)
          this.sites.set(storage.id, (scaffold = new NativeSceneView(this.scene, 'clancastle')));
        scaffold.render(
          guardRender(`dark storage ${site}`, () => sitePoses(site), []),
          p.x,
          p.y,
          p.y + 0.01,
        );
      } else if (scaffold) {
        scaffold.destroy();
        this.sites.delete(storage.id);
      }
    }
    this.destruction.end();
    for (const [id, view] of this.storages)
      if (!wanted.has(id)) {
        view.destroy();
        this.storages.delete(id);
        this.signatures.delete(id);
        this.sites.get(id)?.destroy();
        this.sites.delete(id);
      }
  }
}
