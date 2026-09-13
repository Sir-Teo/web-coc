import type Phaser from 'phaser';
import type { AudioManager } from './audio';
import type { LatePresentation, LateRenderContext } from './late-campaign-scene';
import type { Battle, Building } from './model';
import type { SampleCue } from './sample-audio';
import { BUILDINGS } from './data';
import { preloadNativeMeshes } from './native-mesh-scene';
import { NativeSceneView } from './native-scene-view';
import type { NativeParticlePose } from './native-particles';
import { campaignBuilderHut } from './builder-hut';
import { builderHutAsset, builderHutTexture, BUILDER_HUT_ART_LEVELS } from './builder-hut-art';
import {
  BUILDER_HUT_GRAPH,
  builderHutBasePoses,
  builderHutBodyPoses,
  builderHutBounds,
  builderHutMuzzleHeight,
  builderHutNailPose,
  builderHutPose,
} from './builder-hut-poses';
import { BUILDER_HUT_SOURCE, builderHutLevel, builderHutWeapon } from './builder-hut-stats';
import {
  BUILDER_HUT_EFFECT_PLAYER,
  BUILDER_HUT_SOUNDS,
  builderHutSample,
} from './builder-hut-effects';

const PREFIX = 'builder-hut';

export function preloadBuilderHut(scene: Phaser.Scene) {
  preloadNativeMeshes(scene, BUILDER_HUT_GRAPH, PREFIX);
  for (const level of BUILDER_HUT_ART_LEVELS)
    scene.load.image(builderHutTexture(level), builderHutAsset(level));
  for (const [path, sound] of Object.entries(BUILDER_HUT_SOUNDS))
    scene.load.binary(builderHutSample(path), '/' + sound.path);
}

/** State-driven presentation; rendering reads battle histories so replay seeks stay exact. */
export class BuilderHutPresentation implements LatePresentation {
  readonly bases = new Map<number, NativeSceneView>();
  readonly bodies = new Map<number, NativeSceneView>();
  readonly nails = new Map<string, NativeSceneView>();
  readonly effects = new Map<string, NativeSceneView>();
  private signatures = new Map<string, string>();
  constructor(
    private scene: Phaser.Scene,
    audio: AudioManager,
  ) {
    for (const path of Object.keys(BUILDER_HUT_SOUNDS))
      audio.samples.register(
        builderHutSample(path),
        scene.cache.binary.get(builderHutSample(path)),
      );
  }
  /** Campaign huts in version-44 late battles use original art; home huts keep their own sprite. */
  private battle(): Battle | null {
    return (
      (this.scene as Phaser.Scene & { model?: { battle: Battle | null } }).model?.battle ?? null
    );
  }
  /** True once this family renders the building itself (the fallback sprite is hidden). */
  handles(b: Building) {
    return campaignBuilderHut(this.battle(), b);
  }
  bounds(b: Building): readonly [number, number, number, number] | undefined {
    return this.handles(b) ? builderHutBounds(b) : undefined;
  }
  private view<K>(map: Map<K, NativeSceneView>, key: K) {
    let view = map.get(key);
    if (!view) map.set(key, (view = new NativeSceneView(this.scene, PREFIX)));
    return view;
  }
  render(context: LateRenderContext): SampleCue[] {
    const { battle, elapsed, reduced, iso, airLift } = context;
    const wanted = new Set<number>(),
      flying = new Set<string>(),
      showing = new Set<string>(),
      cues: SampleCue[] = [];
    const zoom = `${this.scene.cameras.main.zoomX}:${this.scene.cameras.main.zoomY}`;
    const effect = (
      id: number,
      event: string,
      index: number,
      name: string,
      at: number,
      point: { x: number; y: number },
    ) => {
      cues.push(...BUILDER_HUT_EFFECT_PLAYER.cues(id, event, index, name, at));
      const poses: NativeParticlePose[] = BUILDER_HUT_EFFECT_PLAYER.poses(
        id,
        event,
        index,
        name,
        at,
        elapsed,
        point,
        reduced,
      );
      for (const fx of poses) {
        showing.add(fx.key);
        const view = this.view(this.effects, fx.key);
        view.render(fx.poses, fx.x, fx.y, fx.depth);
        for (const object of view.objects)
          object.setData('builderHutEffect', { key: fx.key, emitter: fx.emitter });
      }
    };
    for (const b of context.buildings) {
      if (!campaignBuilderHut(battle, b)) continue;
      wanted.add(b.id);
      const size = BUILDINGS.builder.size,
        p = iso(b.x + size / 2, b.y + size / 2);
      const pose = builderHutPose(b, battle, elapsed, reduced);
      const place = `${p.x}:${p.y}:${zoom}`;
      const baseKey = `base:${b.id}`,
        baseSignature = `${b.level}:${pose.state === 'ruin'}:${place}`;
      if (this.signatures.get(baseKey) !== baseSignature) {
        this.view(this.bases, b.id).render(builderHutBasePoses(pose), p.x, p.y, -880);
        this.signatures.set(baseKey, baseSignature);
      }
      const bodyKey = `body:${b.id}`,
        bodySignature = `${b.level}:${pose.state}:${pose.root}:${pose.load}:${pose.turret}:${pose.ruin}:${place}`;
      if (this.signatures.get(bodyKey) !== bodySignature) {
        const view = this.view(this.bodies, b.id);
        view.render(builderHutBodyPoses(pose), p.x, p.y, p.y + (pose.state === 'ruin' ? -2 : 0));
        for (const object of view.objects) object.setData('builderHut', { id: b.id, ...pose });
        this.signatures.set(bodyKey, bodySignature);
      }
      if (!battle || battle.finished) continue;
      const state = battle.late?.builderHut;
      const destroyedAt = state?.destroyed[b.id];
      if (destroyedAt !== undefined)
        effect(b.id, 'destroy', 0, builderHutLevel(b.level).destroyEffect, destroyedAt, p);
      const hut = state?.huts[b.id];
      const weapon = builderHutWeapon(b.level);
      if (!hut || !weapon) continue;
      const muzzle = { x: p.x, y: p.y - builderHutMuzzleHeight(b.level) };
      for (const shot of hut.shots)
        effect(b.id, 'attack', shot.index, BUILDER_HUT_SOURCE.weapon.attackEffect, shot.at, muzzle);
      for (const hit of hut.hits) {
        const ground = iso(hit.x, hit.y);
        effect(b.id, 'hit', hit.index, BUILDER_HUT_SOURCE.weapon.hitEffect, hit.at, {
          x: ground.x,
          y: ground.y - (hit.toAir ? airLift : 0),
        });
      }
    }
    if (battle && !battle.finished && !reduced)
      for (const shot of battle.late?.builderHut?.projectiles ?? []) {
        const hut = battle.buildings.find((v) => v.id === shot.sourceId);
        if (!hut || elapsed < shot.launched || !builderHutWeapon(hut.level)) continue;
        flying.add(shot.id);
        const pose = builderHutNailPose(
          shot,
          hut.level,
          elapsed,
          iso,
          shot.toAir ? airLift + 8 : 16,
        );
        const view = this.view(this.nails, shot.id);
        view.render(pose.poses, pose.x, pose.y, 8000);
        for (const object of view.objects)
          object.setData('builderHutNail', {
            id: shot.id,
            progress: pose.progress,
            export: pose.export,
          });
      }
    for (const [map, prefix] of [
      [this.bases, 'base'],
      [this.bodies, 'body'],
    ] as const)
      for (const [id, view] of map)
        if (!wanted.has(id)) {
          view.destroy();
          map.delete(id);
          this.signatures.delete(`${prefix}:${id}`);
        }
    for (const [map, keep] of [
      [this.nails, flying],
      [this.effects, showing],
    ] as const)
      for (const [key, view] of map)
        if (!keep.has(key)) {
          view.destroy();
          map.delete(key);
        }
    return cues;
  }
  clear() {
    for (const map of [this.bases, this.bodies, this.nails, this.effects]) {
      for (const view of map.values()) view.destroy();
      map.clear();
    }
    this.signatures.clear();
  }
  destroy() {
    this.clear();
  }
}
