import Phaser from 'phaser';
import type { AudioManager } from './audio';
import type { SampleCue } from './sample-audio';
import type { Battle, Building } from './model';
import { NativeSceneView } from './native-scene-view';
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
  readonly effects = new Map<string, NativeSceneView>();
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
    audio: AudioManager,
  ) {
    for (const path of Object.keys(CANNON_SOUNDS))
      audio.samples.register(cannonSample(path), scene.cache.binary.get(cannonSample(path)));
  }
  handling(id: number, kind: CannonHandling | 'cancel', at: number, x: number, y: number) {
    if (kind === 'cancel') this.homeEffects = this.homeEffects.filter((e) => e.id !== id);
    else {
      this.homeEffects.push({ id, index: ++this.homeSequence, kind, at, x, y });
      if (this.homeEffects.length > 16) this.homeEffects.shift();
    }
  }
  clear() {
    for (const map of [this.towers, this.effects, this.projectiles]) {
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
    const wanted = new Set<number>(),
      showing = new Set<string>(),
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
      cues.push(...cannonSoundCues(id, event, index, name, at));
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
        showing.add(fx.key);
        let view = this.effects.get(fx.key);
        if (!view) this.effects.set(fx.key, (view = new NativeSceneView(this.scene, 'cannon')));
        view.render(fx.poses, fx.x, fx.y, fx.depth);
        for (const object of view.objects)
          object.setData('nativeCannonEffect', { key: fx.key, emitter: fx.emitter });
      }
    };
    const zoom = `${this.scene.cameras.main.zoomX}:${this.scene.cameras.main.zoomY}`;
    for (const tower of buildings) {
      if (tower.kind !== 'cannon' || tower.npc) continue;
      wanted.add(tower.id);
      const p = iso(tower.x + 1.5, tower.y + 1.5),
        pose = cannonPose(tower, battle, elapsed, reduced);
      let view = this.towers.get(tower.id);
      if (!view) this.towers.set(tower.id, (view = new NativeSceneView(this.scene, 'cannon')));
      const signature = `${tower.level}:${pose.state}:${pose.turret}:${tower.level === 14 || tower.level === 15 ? Math.floor(pose.time * 30 + 1e-9) : 0}:${p.x}:${p.y}:${zoom}`;
      if (this.signatures.get(tower.id) !== signature) {
        view.render(
          cannonPoses(tower.level, pose),
          p.x,
          p.y,
          p.y + (pose.state === 'ruin' ? -2 : 0),
        );
        for (const object of view.objects)
          object.setData('nativeCannon', { id: tower.id, level: tower.level, ...pose });
        this.signatures.set(tower.id, signature);
      }
      if (battle && !battle.finished) {
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
          if (!reduced) {
            for (const fx of cannonTrailPoses(shot, elapsed, iso)) {
              showing.add(fx.key);
              let trail = this.effects.get(fx.key);
              if (!trail)
                this.effects.set(fx.key, (trail = new NativeSceneView(this.scene, 'cannon')));
              trail.render(fx.poses, fx.x, fx.y, fx.depth);
              for (const object of trail.objects)
                object.setData('nativeCannonEffect', { key: fx.key, emitter: fx.emitter });
            }
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
        for (const hit of history?.hits ?? [])
          effect(tower.id, 'hit', hit.index, cannonStats(hit.level).hitEffect, hit.at, {
            x: iso(hit.x, hit.y).x,
            y: iso(hit.x, hit.y).y - 16,
          });
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
      if (!wanted.has(id)) {
        view.destroy();
        this.towers.delete(id);
        this.signatures.delete(id);
      }
    for (const [key, view] of this.effects)
      if (!showing.has(key)) {
        view.destroy();
        this.effects.delete(key);
      }
    for (const map of [this.projectiles])
      for (const [key, view] of map)
        if (!flying.has(key)) {
          view.destroy();
          map.delete(key);
        }
    return cues;
  }
}
