import type Phaser from 'phaser';
import type { AudioManager } from './audio';
import type { LatePresentation, LateRenderContext } from './late-campaign-scene';
import type { Building } from './model';
import type { SampleCue } from './sample-audio';
import { BUILDINGS } from './data';
import { preloadNativeMeshes } from './native-mesh-scene';
import { NativeSceneView } from './native-scene-view';
import type { NativeParticlePose } from './native-particles';
import type { NativeScenePose } from './native-mesh';
import { LATE_GOBLIN_BUILDING_ART } from './late-goblin-buildings-art';
import {
  LATE_GOBLIN_ARROW_GRAPH,
  LATE_GOBLIN_GRAPH,
  goblinArrowPose,
  goblinBombPose,
  lateGoblinBasePoses,
  lateGoblinBodyPoses,
  lateGoblinBounds,
  lateGoblinPose,
} from './late-goblin-buildings-poses';
import {
  GOBLIN_WEAPONS,
  goblinBuildingArt,
  isLateGoblinIdentity,
  type LateGoblinIdentity,
} from './late-goblin-buildings-stats';
import {
  LATE_GOBLIN_EFFECT_PLAYER,
  LATE_GOBLIN_SOUNDS,
  goblinBombTrailPoses,
  lateGoblinSample,
} from './late-goblin-buildings-effects';

const PREFIX = 'late-goblin';
const ARROW_PREFIX = 'late-goblin-arrow';

export function preloadLateGoblinBuildings(scene: Phaser.Scene) {
  preloadNativeMeshes(scene, LATE_GOBLIN_GRAPH, PREFIX);
  preloadNativeMeshes(scene, LATE_GOBLIN_ARROW_GRAPH, ARROW_PREFIX);
  for (const art of Object.values(LATE_GOBLIN_BUILDING_ART))
    scene.load.image(art.texture, art.asset);
  for (const [path, sound] of Object.entries(LATE_GOBLIN_SOUNDS))
    scene.load.binary(lateGoblinSample(path), '/' + sound.path);
}

/** State-driven presentation; rendering reads battle histories so replay seeks stay exact. */
export class LateGoblinBuildingsPresentation implements LatePresentation {
  readonly bases = new Map<number, NativeSceneView>();
  readonly bodies = new Map<number, NativeSceneView>();
  readonly projectiles = new Map<string, NativeSceneView>();
  readonly shadows = new Map<string, NativeSceneView>();
  readonly effects = new Map<string, NativeSceneView>();
  private signatures = new Map<string, string>();
  constructor(
    private scene: Phaser.Scene,
    audio: AudioManager,
  ) {
    for (const path of Object.keys(LATE_GOBLIN_SOUNDS))
      audio.samples.register(
        lateGoblinSample(path),
        scene.cache.binary.get(lateGoblinSample(path)),
      );
  }
  /** True once this family renders the building itself (the fallback sprite is hidden). */
  handles(b: Building) {
    return isLateGoblinIdentity(b.npc);
  }
  bounds(b: Building): readonly [number, number, number, number] | undefined {
    return isLateGoblinIdentity(b.npc) ? lateGoblinBounds(b) : undefined;
  }
  private view<K>(map: Map<K, NativeSceneView>, key: K, prefix = PREFIX) {
    let view = map.get(key);
    if (!view) map.set(key, (view = new NativeSceneView(this.scene, prefix)));
    return view;
  }
  render(context: LateRenderContext): SampleCue[] {
    const { battle, elapsed, reduced, iso, airLift } = context;
    const wanted = new Set<number>(),
      flying = new Set<string>(),
      showing = new Set<string>(),
      cues: SampleCue[] = [];
    const zoom = `${this.scene.cameras.main.zoomX}:${this.scene.cameras.main.zoomY}`;
    const drawEffects = (poses: NativeParticlePose[]) => {
      for (const fx of poses) {
        showing.add(fx.key);
        const view = this.view(this.effects, fx.key);
        view.render(fx.poses, fx.x, fx.y, fx.depth);
        for (const object of view.objects)
          object.setData('lateGoblinEffect', { key: fx.key, emitter: fx.emitter });
      }
    };
    const effect = (
      id: number,
      event: string,
      index: number,
      name: string,
      at: number,
      point: { x: number; y: number },
    ) => {
      cues.push(...LATE_GOBLIN_EFFECT_PLAYER.cues(id, event, index, name, at));
      drawEffects(
        LATE_GOBLIN_EFFECT_PLAYER.poses(id, event, index, name, at, elapsed, point, reduced),
      );
    };
    for (const b of context.buildings) {
      if (!isLateGoblinIdentity(b.npc)) continue;
      wanted.add(b.id);
      const npc: LateGoblinIdentity = b.npc;
      const size = BUILDINGS[b.kind].size,
        p = iso(b.x + size / 2, b.y + size / 2);
      const pose = lateGoblinPose(b, battle, elapsed, reduced);
      const place = `${p.x}:${p.y}:${zoom}`;
      const baseKey = `base:${b.id}`,
        baseSignature = `${npc}:${b.level}:${pose.state}:${place}`;
      if (this.signatures.get(baseKey) !== baseSignature) {
        this.view(this.bases, b.id).render(lateGoblinBasePoses(pose), p.x, p.y, -880);
        this.signatures.set(baseKey, baseSignature);
      }
      const bodyKey = `body:${b.id}`,
        bodySignature = `${baseSignature}:${pose.frame}:${pose.flag}`;
      if (this.signatures.get(bodyKey) !== bodySignature) {
        const view = this.view(this.bodies, b.id);
        const poses: NativeScenePose[] = lateGoblinBodyPoses(pose);
        view.render(poses, p.x, p.y, p.y + (pose.state === 'ruin' ? -2 : 0));
        for (const object of view.objects)
          object.setData('lateGoblinBuilding', {
            id: b.id,
            npc,
            level: b.level,
            state: pose.state,
            frame: pose.frame,
          });
        this.signatures.set(bodyKey, bodySignature);
      }
      if (!battle || battle.finished) continue;
      const state = battle.late?.goblinBuildings;
      const destroyedAt = state?.destroyed[b.id];
      if (destroyedAt !== undefined)
        effect(b.id, 'destroy', 0, goblinBuildingArt(npc, b.level).destroyEffect, destroyedAt, p);
      const weapon = state?.weapons[b.id];
      if (!weapon) continue;
      const source = GOBLIN_WEAPONS[weapon.kind].source;
      if (weapon.activatedAt !== undefined && source.activationEffect)
        effect(b.id, 'activate', 0, source.activationEffect, weapon.activatedAt, p);
      for (const shot of weapon.shots) {
        cues.push(
          ...LATE_GOBLIN_EFFECT_PLAYER.cues(
            b.id,
            'attack',
            shot.index,
            source.attackEffect,
            shot.at,
          ),
        );
        if (weapon.kind === 'goblin-boss-th' && !reduced)
          drawEffects(
            goblinBombTrailPoses({ ...shot, sourceId: b.id, launched: shot.at }, elapsed, iso),
          );
      }
      for (const hit of weapon.hits) {
        const ground = iso(hit.x, hit.y);
        effect(b.id, 'hit', hit.index, source.hitEffect, hit.at, {
          x: ground.x,
          y: ground.y - (hit.toAir ? airLift : 0),
        });
      }
    }
    if (battle && !battle.finished && !reduced)
      for (const shot of battle.late?.goblinBuildings?.projectiles ?? []) {
        const weapon = battle.late!.goblinBuildings!.weapons[shot.sourceId];
        if (!weapon || elapsed < shot.launched) continue;
        flying.add(shot.id);
        if (weapon.kind === 'goblin-hall') {
          const pose = goblinArrowPose(shot, elapsed, iso, shot.toAir ? airLift + 8 : 16);
          const view = this.view(this.projectiles, shot.id, ARROW_PREFIX);
          view.render(pose.poses, pose.x, pose.y, 8000);
          for (const object of view.objects)
            object.setData('lateGoblinArrow', { id: shot.id, progress: pose.progress });
        } else {
          const pose = goblinBombPose(shot, elapsed, iso);
          const view = this.view(this.projectiles, shot.id);
          view.render(pose.poses, pose.x, pose.y, 8000);
          this.view(this.shadows, shot.id).render(
            pose.shadow,
            pose.ground.x,
            pose.ground.y,
            pose.ground.y - 0.1,
          );
          for (const object of view.objects)
            object.setData('lateGoblinBomb', { id: shot.id, progress: pose.t });
        }
      }
    for (const [map, keep] of [
      [this.bases, wanted],
      [this.bodies, wanted],
    ] as const)
      for (const [id, view] of map)
        if (!keep.has(id)) {
          view.destroy();
          map.delete(id);
          this.signatures.delete(`${map === this.bases ? 'base' : 'body'}:${id}`);
        }
    for (const [map, keep] of [
      [this.projectiles, flying],
      [this.shadows, flying],
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
    for (const map of [this.bases, this.bodies, this.projectiles, this.shadows, this.effects]) {
      for (const view of map.values()) view.destroy();
      map.clear();
    }
    this.signatures.clear();
  }
  destroy() {
    this.clear();
  }
}
