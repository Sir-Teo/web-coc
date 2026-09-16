import type Phaser from 'phaser';
import type { Building } from './model';
import { NativeSceneView } from './native-scene-view';
import { preloadNativeMeshes } from './native-mesh-scene';
import { CASTLE_LEVELS, castleAsset, castleTexture } from './castle-art';
import { CASTLE_GRAPH, castlePoses } from './castle-graph';

export function preloadCastles(scene: Phaser.Scene) {
  preloadNativeMeshes(scene, CASTLE_GRAPH, 'clancastle');
  for (const row of CASTLE_LEVELS)
    scene.load.image(castleTexture(row.level), castleAsset(row.level));
}
export class CastlePresentation {
  readonly castles = new Map<number, NativeSceneView>();
  constructor(private scene: Phaser.Scene) {}
  clear() {
    for (const view of this.castles.values()) view.destroy();
    this.castles.clear();
  }
  render(buildings: Building[], iso: (x: number, y: number) => { x: number; y: number }) {
    const wanted = new Set<number>();
    for (const building of buildings) {
      // The Goblin Castle NPC keeps its own body/foundation/ruin in the late Goblin family.
      if (building.kind !== 'clancastle' || building.npc === 'goblin-castle') continue;
      wanted.add(building.id);
      let view = this.castles.get(building.id);
      if (!view)
        this.castles.set(building.id, (view = new NativeSceneView(this.scene, 'clancastle')));
      const point = iso(building.x + 1.5, building.y + 1.5);
      const state =
        building.hp <= 0
          ? 'ruin'
          : building.constructing
            ? 'constructing'
            : building.upgradeEnd
              ? 'upgrading'
              : 'guard';
      view.render(castlePoses(building.level, state), point.x, point.y, point.y);
      for (const object of view.objects) object.setData('nativeCastle', building.id);
    }
    for (const [id, view] of this.castles)
      if (!wanted.has(id)) {
        view.destroy();
        this.castles.delete(id);
      }
  }
}
