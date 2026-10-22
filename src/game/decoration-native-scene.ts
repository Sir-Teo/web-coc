import type Phaser from 'phaser';
import index from '../../reference/decorations/timelines.json' with { type: 'json' };
import { DECORATION_GROUND, DECORATION_SCALE, DECORATIONS, type Decoration } from './decorations';
import { NativeArtPacks, nativePackPrefix } from './native-art-pack';
import { nativeScenePosesShared, type NativeMatrix, type NativeMeshGraph } from './native-mesh';
import { nativeStaticExport } from './village-native-scene';
import { NativeSceneView } from './native-scene-view';

interface DecorationPack {
  base: string;
  body: string;
  scenes: { buildings: NativeMeshGraph };
}
const paths = new Map(Object.entries(index.decorations).map(([kind, entry]) => [kind, entry.path]));
const root: NativeMatrix = [
  DECORATION_SCALE,
  0,
  0,
  0,
  DECORATION_SCALE,
  -DECORATION_GROUND * DECORATION_SCALE,
];

/** Native home-only decoration timelines; portrait images remain available for picking. */
export class DecorationNativePresentation {
  private packs: NativeArtPacks<DecorationPack>;
  private views = new Map<number, { kind: string; view: NativeSceneView }>();
  constructor(private scene: Phaser.Scene) {
    this.packs = new NativeArtPacks<DecorationPack>(scene);
  }
  render(
    decorations: readonly Decoration[],
    seconds: number,
    reduced: boolean,
    moving: number | null,
    iso: (x: number, y: number) => { x: number; y: number },
    sprites: ReadonlyMap<number, Phaser.GameObjects.Image>,
  ) {
    const seen = new Set<number>();
    for (const decoration of decorations) {
      let entry = this.views.get(decoration.id);
      if (entry && entry.kind !== decoration.kind) {
        entry.view.destroy();
        this.views.delete(decoration.id);
        entry = undefined;
      }
      const path = paths.get(decoration.kind);
      if (!path) continue;
      const alpha = moving === decoration.id ? 0.4 : 1;
      const portrait = sprites.get(decoration.id);
      portrait?.setAlpha(alpha);
      const pack = this.packs.get(path);
      if (!pack) continue;
      if (!entry) {
        entry = {
          kind: decoration.kind,
          view: new NativeSceneView(this.scene, nativePackPrefix(path, 'buildings')),
        };
        this.views.set(decoration.id, entry);
      }
      const graph = pack.scenes.buildings;
      const clock = reduced ? 0 : seconds;
      const poses = [pack.base, pack.body].flatMap((name) =>
        nativeScenePosesShared(graph, name, nativeStaticExport(graph, name) ? 0 : clock, {}, root),
      );
      const size = DECORATIONS[decoration.kind].size;
      const point = iso(decoration.x + size / 2, decoration.y + size / 2);
      entry.view.render(poses, point.x, point.y, point.y, alpha);
      for (const object of entry.view.objects) {
        object.setData('nativeDecoration', decoration.id);
        object.setData('nativeDecorationKind', decoration.kind);
      }
      // Picking uses the portrait's registered bounds and visible flag.
      portrait?.setVisible(true).setAlpha(0);
      seen.add(decoration.id);
    }
    for (const [id, entry] of this.views)
      if (!seen.has(id)) {
        entry.view.destroy();
        this.views.delete(id);
      }
  }
  destroy() {
    for (const entry of this.views.values()) entry.view.destroy();
    this.views.clear();
    this.packs.destroy();
  }
}
