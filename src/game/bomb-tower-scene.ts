import type { AudioManager } from './audio';
import type { SampleCue } from './sample-audio';
import {
  BOMB_TOWER_PARTICLES,
  BOMB_TOWER_SOUNDS,
  bombTowerSample,
  bombTowerSoundCues,
  bombTowerEffectPoses,
  bombTowerTrailPoses,
  bombTowerHitEffect,
  bombTowerDestroyedEffect,
  bombTowerHandlingCues,
  bombTowerHandlingPoses,
  type BombTowerHandling,
  type BombTowerEffectPose,
} from './bomb-tower-effects';
import Phaser from 'phaser';
import type { Battle, Building } from './model';
import { NativeSceneView } from './native-scene-view';
import { preloadNativeMeshes } from './native-mesh-scene';
import { BOMB_TOWER_ART_LEVELS, bombTowerAsset, bombTowerTexture } from './bomb-tower-art';
import {
  BOMB_TOWER_GRAPH,
  BOMBER_GRAPH,
  bomberPose,
  bomberPoses,
  bombTowerPoses,
  bombProjectilePose,
  bombTowerDeathPoses,
  type BombTowerVisualState,
} from './bomb-tower-poses';

export function preloadBombTowers(scene: Phaser.Scene) {
  preloadNativeMeshes(scene, BOMB_TOWER_GRAPH, 'bombtower');
  preloadNativeMeshes(scene, BOMBER_GRAPH, 'bomber');
  preloadNativeMeshes(scene, BOMB_TOWER_PARTICLES, 'bombtower-effects');
  for (const [path, sound] of Object.entries(BOMB_TOWER_SOUNDS))
    scene.load.binary(bombTowerSample(path), '/' + sound.path);
  // Level one is loaded by the common building catalog.
  for (const level of BOMB_TOWER_ART_LEVELS)
    if (level > 1) scene.load.image(bombTowerTexture(level), bombTowerAsset(level));
}

export class BombTowerPresentation {
  readonly towers = new Map<number, NativeSceneView>();
  readonly defenders = new Map<number, NativeSceneView>();
  readonly bombs = new Map<number, NativeSceneView>();
  readonly projectiles = new Map<string, NativeSceneView>();
  readonly shadows = new Map<string, NativeSceneView>();
  readonly effects = new Map<string, NativeSceneView>();
  private signatures = new Map<string, string>();
  private homeSequence = 0;
  private homeEffects: {
    id: number;
    index: number;
    kind: BombTowerHandling;
    at: number;
    x: number;
    y: number;
  }[] = [];
  constructor(
    private scene: Phaser.Scene,
    audio: AudioManager,
  ) {
    for (const path of Object.keys(BOMB_TOWER_SOUNDS))
      audio.samples.register(bombTowerSample(path), scene.cache.binary.get(bombTowerSample(path)));
  }
  handling(id: number, kind: BombTowerHandling | 'cancel', at: number, x: number, y: number) {
    if (kind === 'cancel') this.homeEffects = this.homeEffects.filter((v) => v.id !== id);
    else {
      this.homeEffects.push({ id, index: ++this.homeSequence, kind, at, x, y });
      if (this.homeEffects.length > 16) this.homeEffects.shift();
    }
  }
  clear() {
    for (const map of [
      this.towers,
      this.defenders,
      this.bombs,
      this.projectiles,
      this.shadows,
      this.effects,
    ]) {
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
      defending = new Set<number>(),
      bombing = new Set<number>(),
      flying = new Set<string>(),
      showing = new Set<string>();
    const cues: SampleCue[] = [];
    const drawEffects = (poses: BombTowerEffectPose[]) => {
      for (const fx of poses) {
        showing.add(fx.key);
        let view = this.effects.get(fx.key);
        if (!view)
          this.effects.set(fx.key, (view = new NativeSceneView(this.scene, 'bombtower-effects')));
        view.render(fx.poses, fx.x, fx.y, fx.depth);
        for (const object of view.objects)
          object.setData('nativeBombTowerEffect', { key: fx.key, emitter: fx.emitter });
      }
    };
    const zoom = `${this.scene.cameras.main.zoomX}:${this.scene.cameras.main.zoomY}`;
    for (const tower of buildings) {
      if (tower.kind !== 'bombtower') continue;
      wanted.add(tower.id);
      const p = iso(tower.x + 1.5, tower.y + 1.5);
      const state: BombTowerVisualState =
        tower.hp <= 0
          ? 'ruin'
          : tower.constructing
            ? 'constructing'
            : tower.upgradeEnd
              ? 'upgrading'
              : 'setup';
      let view = this.towers.get(tower.id);
      if (!view) this.towers.set(tower.id, (view = new NativeSceneView(this.scene, 'bombtower')));
      const key = `tower:${tower.id}`,
        signature = `${tower.level}:${state}:${p.x}:${p.y}:${zoom}`;
      if (this.signatures.get(key) !== signature) {
        view.render(
          bombTowerPoses(tower.level, state),
          p.x,
          p.y,
          p.y + (state === 'ruin' ? -2 : 0),
        );
        for (const object of view.objects)
          object.setData('nativeBombTower', { id: tower.id, state, level: tower.level });
        this.signatures.set(key, signature);
      }
      if (state === 'setup' || state === 'upgrading') {
        defending.add(tower.id);
        const pose = bomberPose(tower, battle, elapsed, reduced);
        let actor = this.defenders.get(tower.id);
        if (!actor)
          this.defenders.set(tower.id, (actor = new NativeSceneView(this.scene, 'bomber')));
        const key = `defender:${tower.id}`,
          signature = `${tower.level}:${pose.action}:${pose.direction}:${pose.flip}:${Math.floor(pose.time * 24 + 1e-9)}:${p.x}:${p.y}:${reduced}:${zoom}`;
        if (this.signatures.get(key) !== signature) {
          actor.render(bomberPoses(tower.level, pose, reduced), p.x, p.y, p.y + 0.1);
          for (const object of actor.objects)
            object.setData('nativeBomber', { id: tower.id, ...pose });
          this.signatures.set(key, signature);
        }
      }
      const bomb = battle?.deathBombs?.[tower.id];
      if (bomb && !bomb.resolved && !bomb.cancelled && !battle!.finished) {
        bombing.add(tower.id);
        let charge = this.bombs.get(tower.id);
        if (!charge)
          this.bombs.set(tower.id, (charge = new NativeSceneView(this.scene, 'bombtower')));
        const age = Math.max(0, elapsed - bomb.armedAt);
        const key = `bomb:${tower.id}`,
          signature = `${tower.level}:${Math.floor((reduced ? 0 : age) * 30 + 1e-9)}:${p.x}:${p.y}:${zoom}`;
        if (this.signatures.get(key) !== signature) {
          charge.render(bombTowerDeathPoses(tower.level, age, reduced), p.x, p.y, p.y + 0.5);
          for (const object of charge.objects) object.setData('nativeDeathBomb', { id: tower.id });
          this.signatures.set(key, signature);
        }
      }
      if (battle && !battle.finished) {
        const state = battle.bombTowers?.[tower.id];
        for (const shot of state?.shots ?? []) {
          cues.push(
            ...bombTowerSoundCues(tower.id, 'throw', shot.index, 'Bomb Tower Throw Start', shot.at),
          );
          if (!reduced) drawEffects(bombTowerTrailPoses(tower.id, tower.level, shot, elapsed, iso));
        }
        for (const hit of state?.hits ?? []) {
          const effect = bombTowerHitEffect(tower.level);
          cues.push(...bombTowerSoundCues(tower.id, 'hit', hit.index, effect, hit.at));
          drawEffects(
            bombTowerEffectPoses(
              tower.id,
              'hit',
              hit.index,
              effect,
              hit.at,
              elapsed,
              iso(hit.x, hit.y),
              reduced,
            ),
          );
        }
        if (state?.destroyedAt !== undefined) {
          const effect = bombTowerDestroyedEffect(tower.level, !!bomb);
          cues.push(...bombTowerSoundCues(tower.id, 'destroy', 0, effect, state.destroyedAt));
          drawEffects(
            bombTowerEffectPoses(
              tower.id,
              'destroy',
              0,
              effect,
              state.destroyedAt,
              elapsed,
              p,
              reduced,
            ),
          );
        }
        if (bomb?.resolved && !bomb.cancelled) {
          cues.push(
            ...bombTowerSoundCues(tower.id, 'explode', 0, 'Bomb Tower Explode', bomb.impact),
          );
          drawEffects(
            bombTowerEffectPoses(
              tower.id,
              'explode',
              0,
              'Bomb Tower Explode',
              bomb.impact,
              elapsed,
              iso(bomb.x, bomb.y),
              reduced,
            ),
          );
        }
      }
    }
    if (battle) this.homeEffects = [];
    else {
      this.homeEffects = this.homeEffects.filter((v) => elapsed - v.at < 1 && wanted.has(v.id));
      for (const event of this.homeEffects) {
        cues.push(...bombTowerHandlingCues(event.id, event.index, event.kind, event.at));
        drawEffects(
          bombTowerHandlingPoses(
            event.id,
            event.index,
            event.kind,
            event.at,
            elapsed,
            iso(event.x, event.y),
            reduced,
          ),
        );
      }
    }
    if (battle && !battle.finished && !reduced)
      for (const shot of battle.projectiles ?? []) {
        if (shot.weapon !== 'towerbomb') continue;
        const tower = battle.buildings.find((v) => v.id === shot.sourceId);
        if (!tower) continue;
        flying.add(shot.id);
        const pose = bombProjectilePose(tower.level, shot, elapsed, iso);
        let view = this.projectiles.get(shot.id),
          shadow = this.shadows.get(shot.id);
        if (!view)
          this.projectiles.set(shot.id, (view = new NativeSceneView(this.scene, 'bombtower')));
        if (!shadow)
          this.shadows.set(shot.id, (shadow = new NativeSceneView(this.scene, 'bombtower')));
        view.render(pose.poses, pose.x, pose.y, 8000);
        shadow.render(pose.shadow, pose.ground.x, pose.ground.y, pose.ground.y - 0.1);
        for (const object of view.objects)
          object.setData('nativeBombProjectile', { id: shot.id, progress: pose.t });
      }
    for (const [map, ids, prefix] of [
      [this.towers, wanted, 'tower'],
      [this.defenders, defending, 'defender'],
      [this.bombs, bombing, 'bomb'],
    ] as const)
      for (const [id, view] of map)
        if (!ids.has(id)) {
          view.destroy();
          map.delete(id);
          this.signatures.delete(`${prefix}:${id}`);
        }
    for (const [key, view] of this.effects)
      if (!showing.has(key)) {
        view.destroy();
        this.effects.delete(key);
      }
    for (const map of [this.projectiles, this.shadows])
      for (const [id, view] of map)
        if (!flying.has(id)) {
          view.destroy();
          map.delete(id);
        }
    return cues;
  }
}
