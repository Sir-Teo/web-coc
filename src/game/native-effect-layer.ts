import type Phaser from 'phaser';
import effectArt from '../../reference/full-client/effect-art.json';
import { NativeSceneView } from './native-scene-view';
import { NativeArtPacks, nativePackPrefix, type NativeArtPack } from './native-art-pack';
import {
  nativeEffectDuration,
  nativeEffectPoses,
  nativeTrailBirths,
  nativeTrailPoses,
  type NativeEffectEvent,
  type NativeEffectPose,
} from './native-effects';

type Point = { x: number; y: number };
const index = effectArt as unknown as {
  effects: Record<string, string>;
  emitters: Record<string, string>;
  packs: Record<string, { path: string }>;
};
/** Pack of an effects.csv record, or undefined for sound-only and unreferenced records. */
export const nativeEffectPack = (effect: string | undefined) =>
  effect && Object.hasOwn(index.effects, effect)
    ? index.packs[index.effects[effect]].path
    : undefined;
export const nativeEmitterPack = (emitter: string | undefined) =>
  emitter && Object.hasOwn(index.emitters, emitter)
    ? index.packs[index.emitters[emitter]].path
    : undefined;

/**
 * Draws sampled original effect particles with retained native meshes. Each owner keeps its own
 * layer (views live between begin() and end()); packs are shared through one loader.
 */
export class NativeEffectLayer {
  private views = new Map<string, NativeSceneView>();
  private used = new Set<string>();
  constructor(
    private scene: Phaser.Scene,
    private packs: NativeArtPacks<NativeArtPack>,
    private tag: string,
  ) {}
  begin() {
    this.used.clear();
  }
  /** 'ready' once the record's art is drawable, 'loading' while fetching, 'none' without art. */
  status(effect: string | undefined): 'ready' | 'loading' | 'none' {
    const path = nativeEffectPack(effect);
    if (!path || this.packs.unavailable(path)) return 'none';
    return this.packs.get(path) ? 'ready' : 'loading';
  }
  duration(effect: string) {
    const path = nativeEffectPack(effect);
    const pack = path ? this.packs.get(path) : undefined;
    return pack ? nativeEffectDuration(pack, effect) : undefined;
  }
  play(event: NativeEffectEvent, elapsed: number, reduced: boolean) {
    const path = nativeEffectPack(event.effect);
    const pack = path ? this.packs.get(path) : undefined;
    if (!path || !pack) return false;
    this.draw(path, nativeEffectPoses(pack, event, elapsed, reduced));
    return true;
  }
  /** Particles an emitter leaves along a flight; each birth keeps the point where it was emitted. */
  emitterTrail(
    emitter: string,
    key: string,
    span: { launched: number; end: number },
    pointAt: (time: number) => Point,
    elapsed: number,
    reduced: boolean,
    facing?: Point,
    depth?: number,
  ) {
    const path = nativeEmitterPack(emitter);
    const pack = path ? this.packs.get(path) : undefined;
    if (!path || !pack) return false;
    this.trailPoses(path, pack, emitter, key, span, pointAt, elapsed, reduced, facing, depth);
    return true;
  }
  /** An AttachToParent effect (e.g. Artillery Trail): every emitter row trails the moving parent. */
  effectTrail(
    effect: string,
    key: string,
    span: { launched: number; end: number },
    pointAt: (time: number) => Point,
    elapsed: number,
    reduced: boolean,
    facing?: Point,
    depth?: number,
  ) {
    const path = nativeEffectPack(effect);
    const pack = path ? this.packs.get(path) : undefined;
    if (!path || !pack) return false;
    for (const [i, row] of (pack.effects[effect] ?? []).entries())
      if (row.ParticleEmitter)
        this.trailPoses(
          path,
          pack,
          row.ParticleEmitter,
          `${key}:${i}`,
          span,
          pointAt,
          elapsed,
          reduced,
          facing,
          depth,
        );
    return true;
  }
  private trailPoses(
    path: string,
    pack: NativeArtPack,
    emitter: string,
    key: string,
    span: { launched: number; end: number },
    pointAt: (time: number) => Point,
    elapsed: number,
    reduced: boolean,
    facing?: Point,
    depth?: number,
  ) {
    const rows = pack.emitters[emitter];
    if (!rows) return;
    const births = nativeTrailBirths(rows[0], span.launched, span.end, elapsed).map((b) => ({
      ...b,
      ground: pointAt(b.at),
    }));
    this.draw(path, nativeTrailPoses(pack, emitter, key, births, elapsed, reduced, facing, depth));
  }
  private draw(path: string, poses: NativeEffectPose[]) {
    for (const pose of poses) {
      const key = `${this.tag}:${pose.key}`;
      this.used.add(key);
      let view = this.views.get(key);
      if (!view)
        this.views.set(
          key,
          (view = new NativeSceneView(this.scene, nativePackPrefix(path, pose.scene))),
        );
      view.render(pose.poses, pose.x, pose.y, pose.depth);
      for (const object of view.objects) object.setData('nativeEffect', pose.emitter);
    }
  }
  end() {
    for (const [key, view] of this.views)
      if (!this.used.has(key)) {
        view.destroy();
        this.views.delete(key);
      }
  }
  clear() {
    for (const view of this.views.values()) view.destroy();
    this.views.clear();
    this.used.clear();
  }
}
