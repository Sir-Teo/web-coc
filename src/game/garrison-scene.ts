import type Phaser from 'phaser';
import type { Battle } from './model';
import { NativeSceneView } from './native-scene-view';
import { preloadNativeMeshes } from './native-mesh-scene';
import { GARRISON_GRAPHS, garrisonPoses } from './garrison-poses';
import { GARRISON_SOUNDS, garrisonSample } from './garrison-sounds';
import type { AudioManager } from './audio';

export function preloadGarrisonTroops(scene: Phaser.Scene) {
  for (const [path, sound] of Object.entries(GARRISON_SOUNDS))
    scene.load.binary(garrisonSample(path), '/' + sound.path);
  for (const [kind, graph] of Object.entries(GARRISON_GRAPHS))
    preloadNativeMeshes(scene, graph, `garrison-${kind}`);
}
export class GarrisonPresentation {
  readonly defenders = new Map<number, NativeSceneView>();
  constructor(
    private scene: Phaser.Scene,
    audio: AudioManager,
  ) {
    for (const path of Object.keys(GARRISON_SOUNDS))
      audio.samples.register(garrisonSample(path), scene.cache.binary.get(garrisonSample(path)));
  }
  clear() {
    for (const view of this.defenders.values()) view.destroy();
    this.defenders.clear();
  }
  render(
    battle: Battle | null,
    reduced: boolean,
    iso: (x: number, y: number) => { x: number; y: number },
    lift: number,
  ) {
    const wanted = new Set<number>();
    for (const defender of battle?.defenders ?? []) {
      if (defender.kind === 'skeleton') continue;
      wanted.add(defender.id);
      let view = this.defenders.get(defender.id);
      if (!view)
        this.defenders.set(
          defender.id,
          (view = new NativeSceneView(this.scene, `garrison-${defender.kind}`)),
        );
      const point = iso(defender.x, defender.y);
      view.render(
        garrisonPoses(defender, battle!, reduced),
        point.x,
        point.y - lift,
        7500 + point.y / 10000,
      );
      for (const object of view.objects) object.setData('nativeGarrisonDefender', defender.id);
    }
    for (const [id, view] of this.defenders)
      if (!wanted.has(id)) {
        view.destroy();
        this.defenders.delete(id);
      }
  }
}
