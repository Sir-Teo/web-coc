import Phaser from 'phaser';
import type { Battle, Building } from './model';
import { NativeMeshView, preloadNativeMeshes } from './native-mesh-scene';
import { DARK_STORAGE_GRAPH, darkStoragePoses } from './dark-storage-poses';
import { DARK_STORAGE_LEVELS } from './dark-storage-stats';
import { darkStorageAsset, darkStorageTexture, darkStorageFrame } from './dark-storage-art';
import { darkStorageFill } from './dark-storage-fill';

export function preloadDarkStorages(scene: Phaser.Scene) {
  preloadNativeMeshes(scene, DARK_STORAGE_GRAPH, 'dark-storage');
  for (const { level } of DARK_STORAGE_LEVELS)
    scene.load.image(darkStorageTexture(level), darkStorageAsset(level));
}
export class DarkStoragePresentation {
  readonly storages = new Map<number, NativeMeshView>();
  private signatures = new Map<number, string>();
  constructor(private scene: Phaser.Scene) {}
  clear() {
    for (const view of this.storages.values()) view.destroy();
    this.storages.clear();
    this.signatures.clear();
  }
  destroy() {
    this.clear();
  }
  render(
    buildings: Building[],
    battle: Battle | null,
    dark: number,
    capacity: number,
    iso: (x: number, y: number) => { x: number; y: number },
  ) {
    const wanted = new Set<number>();
    for (const storage of buildings) {
      if (storage.kind !== 'darkstorage' || storage.hp <= 0) continue;
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
      const signature = `${storage.level}:${frame}:${p.x}:${p.y}:${alpha}`;
      if (this.signatures.get(storage.id) === signature) continue;
      this.signatures.set(storage.id, signature);
      view.render(darkStoragePoses(storage.level, fraction), p.x, p.y, p.y, alpha);
      for (const mesh of view.meshes.values())
        mesh.setData('darkStorage', { id: storage.id, level: storage.level, frame });
    }
    for (const [id, view] of this.storages)
      if (!wanted.has(id)) {
        view.destroy();
        this.storages.delete(id);
        this.signatures.delete(id);
      }
  }
}
