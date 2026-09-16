import type Phaser from 'phaser';
import type { AudioManager } from './audio';
import { FREEZE_TRAP_ART, freezeTrapAsset, freezeTrapTexture } from './freeze-trap-art';
import {
  FREEZE_GRAPH,
  FREEZE_SOUNDS,
  freezeEffectPoses,
  freezeSample,
  freezeSoundCues,
  freezeTrapPoses,
} from './freeze-trap-poses';
import type { LatePresentation, LateRenderContext } from './late-campaign-scene';
import type { Building } from './model';
import { preloadNativeMeshes } from './native-mesh-scene';
import { NativeSceneView } from './native-scene-view';
import type { SampleCue } from './sample-audio';

const PREFIX = 'freeze-trap';

export function preloadFreezeTrap(scene: Phaser.Scene) {
  scene.load.image(freezeTrapTexture(1), freezeTrapAsset(1));
  preloadNativeMeshes(scene, FREEZE_GRAPH, PREFIX);
  for (const [path, sound] of Object.entries(FREEZE_SOUNDS))
    scene.load.binary(freezeSample(path), '/' + sound.path);
}

/** State-driven presentation; rendering reads battle histories so replay seeks stay exact. */
export class FreezeTrapPresentation implements LatePresentation {
  readonly bodies = new Map<number, NativeSceneView>();
  readonly effects = new Map<string, NativeSceneView>();
  constructor(
    private scene: Phaser.Scene,
    audio: AudioManager,
  ) {
    for (const path of Object.keys(FREEZE_SOUNDS))
      audio.samples.register(freezeSample(path), scene.cache.binary.get(freezeSample(path)));
  }
  /** Every Goblin Freeze Trap body is drawn from the retained source graph. */
  handles(b: Building) {
    return b.npc === 'freeze-trap';
  }
  bounds(b: Building): readonly [number, number, number, number] | undefined {
    if (!this.handles(b)) return undefined;
    const { scale, anchorX, anchorY, bounds } = FREEZE_TRAP_ART;
    return [
      (bounds[0] - anchorX) * scale,
      (bounds[1] - anchorY) * scale,
      (bounds[2] - anchorX) * scale,
      (bounds[3] - anchorY) * scale,
    ];
  }
  render({ buildings, battle, elapsed, reduced, iso }: LateRenderContext): SampleCue[] {
    const bodies = new Set<number>(),
      effects = new Set<string>(),
      cues: SampleCue[] = [];
    for (const trap of buildings) {
      if (!this.handles(trap)) continue;
      bodies.add(trap.id);
      const cast = battle?.late?.freezeTrap?.casts[trap.id];
      const point = iso(trap.x + 1, trap.y + 1);
      let view = this.bodies.get(trap.id);
      if (!view) this.bodies.set(trap.id, (view = new NativeSceneView(this.scene, PREFIX)));
      view.render(
        freezeTrapPoses(cast, elapsed, reduced, battle?.finished),
        point.x,
        point.y,
        point.y,
      );
      for (const object of view.objects)
        object.setData('nativeFreezeTrap', { id: trap.id, activated: !!cast });
      if (!battle || battle.finished || !cast) continue;
      cues.push(...freezeSoundCues(cast));
      for (const fx of freezeEffectPoses(cast, elapsed, point, reduced)) {
        effects.add(fx.key);
        let effect = this.effects.get(fx.key);
        if (!effect) this.effects.set(fx.key, (effect = new NativeSceneView(this.scene, PREFIX)));
        effect.render(fx.poses, fx.x, fx.y, fx.depth);
        for (const object of effect.objects)
          object.setData('nativeFreezeEffect', { id: trap.id, key: fx.key, emitter: fx.emitter });
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
  clear() {
    for (const map of [this.bodies, this.effects]) {
      for (const view of map.values()) view.destroy();
      map.clear();
    }
  }
  destroy() {
    this.clear();
  }
}
