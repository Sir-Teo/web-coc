import type Phaser from 'phaser';
import type { Building } from './model';
import { NativeSceneView } from './native-scene-view';
import { preloadNativeMeshes } from './native-mesh-scene';
import { DARK_DRILL_GRAPH, darkDrillBuildingPoses } from './dark-drill-art';

export function preloadDarkDrills(scene: Phaser.Scene) {
  preloadNativeMeshes(scene, DARK_DRILL_GRAPH, 'darkdrill');
}
export class DarkDrillPresentation {
  readonly drills = new Map<number, NativeSceneView>();
  constructor(private scene: Phaser.Scene) {}
  clear() {
    for (const view of this.drills.values()) view.destroy();
    this.drills.clear();
  }
  render(
    buildings: Building[],
    seconds: number,
    iso: (x: number, y: number) => { x: number; y: number },
  ) {
    const wanted = new Set<number>();
    for (const building of buildings) {
      if (building.kind !== 'darkdrill') continue;
      wanted.add(building.id);
      let view = this.drills.get(building.id);
      if (!view)
        this.drills.set(building.id, (view = new NativeSceneView(this.scene, 'darkdrill')));
      const point = iso(building.x + 1.5, building.y + 1.5);
      view.render(darkDrillBuildingPoses(building, seconds), point.x, point.y, point.y);
      for (const object of view.objects) object.setData('nativeDrill', building.id);
    }
    for (const [id, view] of this.drills)
      if (!wanted.has(id)) {
        view.destroy();
        this.drills.delete(id);
      }
  }
}
