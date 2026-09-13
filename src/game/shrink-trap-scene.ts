import Phaser from 'phaser';
import { NativeSceneView } from './native-scene-view';
import { preloadNativeMeshes } from './native-mesh-scene';
import { SHRINK_ART } from './shrink-trap-art';
import {
  SHRINK_GRAPH,
  SHRINK_SOUNDS,
  shrinkSample,
  shrinkTrapPoses,
  shrinkEffectPoses,
  shrinkSoundCues,
} from './shrink-trap-poses';
import type { Battle, Building } from './model';
import type { AudioManager } from './audio';
import type { SampleCue } from './sample-audio';

export function preloadShrinkTraps(scene: Phaser.Scene) {
  scene.load.image(SHRINK_ART.texture, SHRINK_ART.asset);
  preloadNativeMeshes(scene, SHRINK_GRAPH, 'shrink-trap');
  for (const [path, sound] of Object.entries(SHRINK_SOUNDS))
    scene.load.binary(shrinkSample(path), '/' + sound.path);
}
export class ShrinkTrapPresentation {
  readonly bodies = new Map<number, NativeSceneView>();
  readonly effects = new Map<string, NativeSceneView>();
  constructor(
    private scene: Phaser.Scene,
    audio: AudioManager,
  ) {
    for (const path of Object.keys(SHRINK_SOUNDS))
      audio.samples.register(shrinkSample(path), scene.cache.binary.get(shrinkSample(path)));
  }
  clear() {
    for (const map of [this.bodies, this.effects]) {
      for (const view of map.values()) view.destroy();
      map.clear();
    }
  }
  destroy() {
    this.clear();
  }
  render(
    buildings: Building[],
    battle: Battle | null,
    reduced: boolean,
    iso: (x: number, y: number) => { x: number; y: number },
  ) {
    const bodies = new Set<number>(),
      effects = new Set<string>(),
      cues: SampleCue[] = [];
    for (const trap of buildings) {
      if (trap.npc !== 'shrink-trap') continue;
      bodies.add(trap.id);
      const state = battle?.traps[trap.id],
        elapsed = battle?.elapsed ?? 0;
      const point = iso(trap.x + 1, trap.y + 1);
      let view = this.bodies.get(trap.id);
      if (!view) this.bodies.set(trap.id, (view = new NativeSceneView(this.scene, 'shrink-trap')));
      view.render(
        shrinkTrapPoses(state, elapsed, reduced, battle?.finished),
        point.x,
        point.y,
        point.y,
      );
      for (const object of view.objects)
        object.setData('nativeShrinkTrap', { id: trap.id, activated: !!state });
      if (!battle || battle.finished || !state) continue;
      cues.push(...shrinkSoundCues(trap.id, state));
      for (const fx of shrinkEffectPoses(trap.id, state, elapsed, point, reduced)) {
        effects.add(fx.key);
        let view = this.effects.get(fx.key);
        if (!view)
          this.effects.set(fx.key, (view = new NativeSceneView(this.scene, 'shrink-trap')));
        view.render(fx.poses, fx.x, fx.y, fx.depth);
        for (const object of view.objects)
          object.setData('nativeShrinkEffect', { id: trap.id, key: fx.key, emitter: fx.emitter });
      }
    }
    for (const [id, view] of this.bodies)
      if (!bodies.has(id)) {
        view.destroy();
        this.bodies.delete(id);
      }
    for (const [key, view] of this.effects)
      if (!effects.has(key)) {
        view.destroy();
        this.effects.delete(key);
      }
    return cues;
  }
}
