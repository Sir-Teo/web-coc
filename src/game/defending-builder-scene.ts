import type Phaser from 'phaser';
import type { Battle } from './model';
import { NativeSceneView } from './native-scene-view';
import { defendingBuilderLayers } from './defending-builder';

/**
 * Defending Builder views for the Builder's Hut family to call each frame: the original worker
 * body and its ground shadow, sorted at the projected ground point like ground garrison troops.
 * The worker graph is preloaded with the other character graphs (garrison-scene.ts).
 */
export class DefendingBuilderPresentation {
  private views = new Map<number, { body: NativeSceneView; shadow: NativeSceneView }>();
  constructor(private scene: Phaser.Scene) {}
  render(battle: Battle | null, reduced: boolean, iso: (x: number, y: number) => { x: number; y: number }) {
    const wanted = new Set<number>();
    for (const builder of battle?.late?.defendingBuilders ?? []) {
      const layers = defendingBuilderLayers(builder, battle!, reduced);
      if (!layers) continue;
      wanted.add(builder.id);
      let views = this.views.get(builder.id);
      if (!views) {
        views = {
          body: new NativeSceneView(this.scene, layers.prefix),
          shadow: new NativeSceneView(this.scene, layers.prefix),
        };
        this.views.set(builder.id, views);
      }
      const point = iso(builder.x, builder.y);
      views.shadow.render(layers.shadow, point.x, point.y, point.y + 1.05);
      views.body.render(layers.body, point.x, point.y, point.y + 1.1);
      for (const object of views.body.objects) object.setData('defendingBuilder', builder.id);
    }
    for (const [id, views] of this.views)
      if (!wanted.has(id)) {
        views.body.destroy();
        views.shadow.destroy();
        this.views.delete(id);
      }
  }
  clear() {
    for (const views of this.views.values()) {
      views.body.destroy();
      views.shadow.destroy();
    }
    this.views.clear();
  }
}
