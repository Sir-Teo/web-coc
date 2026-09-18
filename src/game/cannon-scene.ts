import Phaser from 'phaser';
import type { AudioManager } from './audio';
import { cueAudible, registerCachedSample, type SampleCue } from './sample-audio';
import type { Battle, Building } from './model';
import { NativeSceneView, quantizedDensity } from './native-scene-view';
import { NativeEffectViews } from './native-effect-views';
import { presentationLive, presentationTime } from './presentation-clock';
import { guardRender } from './render-guard';
import { preloadNativeMeshes } from './native-mesh-scene';
import { CANNON_ART_LEVELS, cannonAsset, cannonTexture } from './cannon-art';
import { CANNON_GRAPH, cannonPose, cannonPoses, cannonProjectilePose } from './cannon-poses';
import { cannonStats } from './cannon-stats';
import {
  CANNON_SOUNDS,
  cannonSample,
  cannonSoundCues,
  cannonEffectPoses,
  cannonHandlingEffect,
  cannonTrailPoses,
  type CannonHandling,
} from './cannon-effects';

export function preloadCannons(scene: Phaser.Scene) {
  preloadNativeMeshes(scene, CANNON_GRAPH, 'cannon');
  for (const level of CANNON_ART_LEVELS) scene.load.image(cannonTexture(level), cannonAsset(level));
  for (const [path, sound] of Object.entries(CANNON_SOUNDS))
    scene.load.binary(cannonSample(path), '/' + sound.path);
}

export class CannonPresentation {
  readonly towers = new Map<number, NativeSceneView>();
  readonly projectiles = new Map<string, NativeSceneView>();
  private fx: NativeEffectViews;
  /** Live effect views by key (pooled; see NativeEffectViews). */
  readonly effects: Map<string, NativeSceneView>;
  private signatures = new Map<number, string>();
  private homeSequence = 0;
  private homeEffects: {
    id: number;
    index: number;
    kind: CannonHandling;
    at: number;
    x: number;
    y: number;
  }[] = [];
  constructor(
    private scene: Phaser.Scene,
    private audio: AudioManager,
  ) {
    this.fx = new NativeEffectViews(scene, 'cannon', 'nativeCannonEffect');
    this.effects = this.fx.views;
    this.bindAudio();
  }
  /** Heavy art bundles in after boot; sounds bind when the binaries arrive. */
  bindAudio() {
    for (const path of Object.keys(CANNON_SOUNDS))
      registerCachedSample(this.scene, this.audio.samples, cannonSample(path));
  }
  /** Heavy textures arrive after boot; the fallback sprite covers until then. */
  artReady = false;
  handling(id: number, kind: CannonHandling | 'cancel', at: number, x: number, y: number) {
    if (kind === 'cancel') this.homeEffects = this.homeEffects.filter((e) => e.id !== id);
    else {
      this.homeEffects.push({ id, index: ++this.homeSequence, kind, at, x, y });
      if (this.homeEffects.length > 16) this.homeEffects.shift();
    }
  }
  clear() {
    this.fx.clear();
    for (const map of [this.towers, this.projectiles]) {
      for (const view of map.values()) view.destroy();
      map.clear();
    }
    this.signatures.clear();
    this.homeEffects = [];
  }
  destroy() {
    this.clear();
  }
  render(
    buildings: Building[],
    battle: Battle | null,
    elapsed: number,
    reduced: boolean,
    iso: (x: number, y: number) => { x: number; y: number },
  ) {
    // Sound cues never depend on the heavy art; only the views wait for it.
    const art = this.artReady;
    const live = presentationLive(battle);
    // After the finish, transient effects keep sampling on the presentation clock.
    if (battle) elapsed = presentationTime(battle);
    const wanted = new Set<number>(),
      flying = new Set<string>(),
      cues: SampleCue[] = [];
    const effect = (
      id: number,
      event: string,
      index: number,
      name: string,
      at: number,
      point: { x: number; y: number },
      facing = { x: 1, y: 0 },
    ) => {
      if (cueAudible(at, elapsed)) cues.push(...cannonSoundCues(id, event, index, name, at));
      if (!art) return;
      for (const fx of cannonEffectPoses(
        id,
        event,
        index,
        name,
        at,
        elapsed,
        point,
        reduced,
        facing,
      )) {
        fx.depth += depthLift;
        this.fx.show(fx);
      }
    };
    let depthLift = 0;
    const camera = this.scene.cameras.main;
    const zoom = quantizedDensity(Math.max(1, camera.zoomX, camera.zoomY));
    for (const tower of buildings) {
      if (tower.kind !== 'cannon' || tower.npc) continue;
      const p = iso(tower.x + 1.5, tower.y + 1.5);
      wanted.add(tower.id);
      if (art) {
        const pose = cannonPose(tower, battle, elapsed, reduced);
        let view = this.towers.get(tower.id);
        if (!view) this.towers.set(tower.id, (view = new NativeSceneView(this.scene, 'cannon')));
        const signature = `${tower.level}:${pose.state}:${pose.turret}:${tower.level === 14 || tower.level === 15 ? Math.floor(pose.time * 30 + 1e-9) : 0}:${p.x}:${p.y}:${zoom}`;
        if (this.signatures.get(tower.id) !== signature) {
          const poses = guardRender(
            `cannon level ${tower.level}`,
            () => cannonPoses(tower.level, pose),
            [],
          );
          view.render(poses, p.x, p.y, p.y + (pose.state === 'ruin' ? -2 : 0));
          for (const object of view.objects)
            object.setData('nativeCannon', { id: tower.id, level: tower.level, ...pose });
          this.signatures.set(tower.id, signature);
        }
      }
      if (battle && live) {
        const history = battle.cannons?.[tower.id];
        for (const shot of history?.shots ?? []) {
          effect(
            tower.id,
            'attack',
            shot.index,
            cannonStats(shot.level).attackEffect,
            shot.launched,
            iso(shot.fromX, shot.fromY),
            { x: shot.aimX - shot.fromX, y: shot.aimY - shot.fromY },
          );
          if (!reduced && art) {
            for (const fx of cannonTrailPoses(shot, elapsed, iso)) this.fx.show(fx);
            if (
              elapsed >= shot.launched &&
              elapsed < shot.impact &&
              !history!.hits.some((hit) => hit.index === shot.index)
            ) {
              const key = `${tower.id}:${shot.index}`,
                p = cannonProjectilePose(shot, elapsed, iso);
              flying.add(key);
              let flight = this.projectiles.get(key);
              if (!flight)
                this.projectiles.set(key, (flight = new NativeSceneView(this.scene, 'cannon')));
              flight.render(p.poses, p.x, p.y, 8000);
              for (const object of flight.objects)
                object.setData('nativeCannonProjectile', {
                  key,
                  level: shot.level,
                  export: p.export,
                  t: p.progress,
                });
            }
          }
        }
        // Hits burst 16 px up at the struck troop: sort them as that troop's front, not
        // 16 px behind it, like the Wizard Tower's raised hits.
        depthLift = 16;
        for (const hit of history?.hits ?? []) {
          const ground = iso(hit.x, hit.y);
          effect(tower.id, 'hit', hit.index, cannonStats(hit.level).hitEffect, hit.at, {
            x: ground.x,
            y: ground.y - 16,
          });
        }
        depthLift = 0;
        if (history?.destroyedAt !== undefined)
          effect(tower.id, 'destroy', 0, 'Building Destroyed', history.destroyedAt, p);
      }
    }
    if (battle) this.homeEffects = [];
    else {
      this.homeEffects = this.homeEffects.filter((e) => elapsed - e.at < 1 && wanted.has(e.id));
      for (const e of this.homeEffects)
        effect(e.id, `home-${e.kind}`, e.index, cannonHandlingEffect(e.kind), e.at, iso(e.x, e.y));
    }
    for (const [id, view] of this.towers)
      if (!wanted.has(id) || !art) {
        view.destroy();
        this.towers.delete(id);
        this.signatures.delete(id);
      }
    this.fx.sweep();
    for (const map of [this.projectiles])
      for (const [key, view] of map)
        if (!flying.has(key)) {
          view.destroy();
          map.delete(key);
        }
    return cues;
  }
}
