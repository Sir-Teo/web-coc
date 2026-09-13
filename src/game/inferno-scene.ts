import type Phaser from 'phaser';
import type { Building } from './model';
import { NativeSceneView } from './native-scene-view';
import { preloadNativeMeshes } from './native-mesh-scene';
import { INFERNO_GRAPH, infernoAsset, infernoTexture, infernoPoses } from './inferno-art';

export function preloadInfernos(scene: Phaser.Scene) {
  preloadNativeMeshes(scene, INFERNO_GRAPH, 'inferno');
  for (let level = 1; level <= 12; level++)
    for (const mode of ['single', 'multi'] as const)
      scene.load.image(infernoTexture(level, mode), infernoAsset(level, mode));
}
export class InfernoPresentation {
  readonly views = new Map<number, NativeSceneView>();
  constructor(private scene: Phaser.Scene) {}
  clear() {
    for (const view of this.views.values()) view.destroy();
    this.views.clear();
  }
  render(
    buildings: Building[],
    seconds: number,
    iso: (x: number, y: number) => { x: number; y: number },
  ) {
    const wanted = new Set<number>();
    for (const building of buildings) {
      if (building.kind !== 'inferno') continue;
      wanted.add(building.id);
      let view = this.views.get(building.id);
      if (!view) this.views.set(building.id, (view = new NativeSceneView(this.scene, 'inferno')));
      const point = iso(building.x + 1, building.y + 1);
      const state =
        building.hp <= 0
          ? 'ruin'
          : building.constructing
            ? 'constructing'
            : building.upgradeEnd
              ? 'upgrading'
              : 'active';
      view.render(
        infernoPoses(building.level, 'single', state, seconds, [1.2, 0, 0, 0, 1.2, -64]),
        point.x,
        point.y,
        point.y,
      );
      for (const object of view.objects) object.setData('nativeInferno', building.id);
    }
    for (const [id, view] of this.views)
      if (!wanted.has(id)) {
        view.destroy();
        this.views.delete(id);
      }
  }
}
