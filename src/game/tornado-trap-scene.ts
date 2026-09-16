import type Phaser from 'phaser';
import type { AudioManager } from './audio';
import type { LatePresentation, LateRenderContext } from './late-campaign-scene';
import type { Building } from './model';
import { preloadNativeMeshes } from './native-mesh-scene';
import { NativeSceneView } from './native-scene-view';
import type { SampleCue } from './sample-audio';
import { TORNADO_TRAP_ART, tornadoTrapAsset, tornadoTrapTexture } from './tornado-trap-art';
import {
  TORNADO_DEPTH,
  TORNADO_GRAPH,
  TORNADO_SOUNDS,
  TORNADO_VFX_GRAPH,
  tornadoBodyPose,
  tornadoEffectPoses,
  tornadoSample,
  tornadoSoundCues,
} from './tornado-trap-poses';

const PREFIX = 'tornado-trap',
  VFX_PREFIX = 'tornado-trap-vfx';

export function preloadTornadoTrap(scene: Phaser.Scene) {
  for (const level of [1, 2]) scene.load.image(tornadoTrapTexture(level), tornadoTrapAsset(level));
  preloadNativeMeshes(scene, TORNADO_GRAPH, PREFIX);
  preloadNativeMeshes(scene, TORNADO_VFX_GRAPH, VFX_PREFIX);
  for (const [path, sound] of Object.entries(TORNADO_SOUNDS))
    scene.load.binary(tornadoSample(path), '/' + sound.path);
}

/** State-driven presentation; rendering reads battle histories so replay seeks stay exact. */
export class TornadoTrapPresentation implements LatePresentation {
  readonly bodies = new Map<number, NativeSceneView>();
  readonly effects = new Map<string, NativeSceneView>();
  constructor(
    private scene: Phaser.Scene,
    audio: AudioManager,
  ) {
    for (const path of Object.keys(TORNADO_SOUNDS))
      audio.samples.register(tornadoSample(path), scene.cache.binary.get(tornadoSample(path)));
  }
  /** Every Tornado Trap body is drawn from the retained source graph. */
  handles(b: Building) {
    return b.kind === 'tornadotrap';
  }
  bounds(b: Building): readonly [number, number, number, number] | undefined {
    if (!this.handles(b)) return undefined;
    const { scale, anchorX, anchorY, bounds } = TORNADO_TRAP_ART;
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
      const vortex = battle?.late?.tornadoTrap?.vortices[trap.id];
      const point = iso(trap.x + 0.5, trap.y + 0.5);
      const body = tornadoBodyPose(trap.level, vortex, elapsed, reduced, battle?.finished);
      let view = this.bodies.get(trap.id);
      if (!view) this.bodies.set(trap.id, (view = new NativeSceneView(this.scene, PREFIX)));
      view.render(body.poses, point.x, point.y, body.ground ? TORNADO_DEPTH.whirl : point.y);
      for (const object of view.objects)
        object.setData('nativeTornadoTrap', { id: trap.id, export: body.export });
      if (!battle || battle.finished || !vortex) continue;
      cues.push(...tornadoSoundCues(vortex));
      for (const fx of tornadoEffectPoses(vortex, elapsed, point, reduced)) {
        effects.add(fx.key);
        const prefix =
          fx.emitter === 'gen_appear_fx' || fx.emitter === 'Grass' ? PREFIX : VFX_PREFIX;
        let effect = this.effects.get(fx.key);
        if (!effect) this.effects.set(fx.key, (effect = new NativeSceneView(this.scene, prefix)));
        effect.render(fx.poses, fx.x, fx.y, fx.depth);
        for (const object of effect.objects)
          object.setData('nativeTornadoEffect', { id: trap.id, key: fx.key, emitter: fx.emitter });
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
