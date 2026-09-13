import type { AudioManager } from './audio';
import type { SampleCue } from './sample-audio';
import {
  WIZARD_TOWER_SOUNDS,
  wizardTowerSample,
  wizardTowerSoundCues,
  wizardTowerEffectPoses,
  wizardTowerTrailPoses,
  wizardTowerHitEffect,
  wizardTowerAttackEffect,
  wizardTowerHandlingCues,
  wizardTowerHandlingPoses,
  type WizardTowerHandling,
  type WizardTowerEffectPose,
} from './wizard-tower-effects';
import Phaser from 'phaser';
import type { Battle, Building } from './model';
import { NativeSceneView } from './native-scene-view';
import { preloadNativeMeshes } from './native-mesh-scene';
import { WIZARD_TOWER_ART_LEVELS, wizardTowerAsset, wizardTowerTexture } from './wizard-tower-art';
import {
  WIZARD_TOWER_GRAPH,
  TOWER_WIZARD_GRAPH,
  WIZARD_EFFECT_GRAPH,
  towerWizardPose,
  towerWizardPoses,
  wizardTowerPoses,
  wizardProjectilePose,
  type WizardTowerVisualState,
} from './wizard-tower-poses';

export function preloadWizardTowers(scene: Phaser.Scene) {
  preloadNativeMeshes(scene, WIZARD_TOWER_GRAPH, 'wizardtower');
  preloadNativeMeshes(scene, TOWER_WIZARD_GRAPH, 'tower-wizard');
  preloadNativeMeshes(scene, WIZARD_EFFECT_GRAPH, 'wizardtower-effects');
  for (const [path, sound] of Object.entries(WIZARD_TOWER_SOUNDS))
    scene.load.binary(wizardTowerSample(path), '/' + sound.path);
  for (const level of WIZARD_TOWER_ART_LEVELS)
    if (level > 1) scene.load.image(wizardTowerTexture(level), wizardTowerAsset(level));
}
export class WizardTowerPresentation {
  readonly towers = new Map<number, NativeSceneView>();
  readonly defenders = new Map<number, NativeSceneView>();
  readonly projectiles = new Map<string, NativeSceneView>();
  readonly effects = new Map<string, NativeSceneView>();
  private signatures = new Map<string, string>();
  private homeSequence = 0;
  private homeEffects: {
    id: number;
    index: number;
    kind: WizardTowerHandling;
    at: number;
    x: number;
    y: number;
  }[] = [];
  constructor(
    private scene: Phaser.Scene,
    audio: AudioManager,
  ) {
    for (const path of Object.keys(WIZARD_TOWER_SOUNDS))
      audio.samples.register(
        wizardTowerSample(path),
        scene.cache.binary.get(wizardTowerSample(path)),
      );
  }
  handling(id: number, kind: WizardTowerHandling | 'cancel', at: number, x: number, y: number) {
    if (kind === 'cancel') this.homeEffects = this.homeEffects.filter((v) => v.id !== id);
    else {
      this.homeEffects.push({ id, index: ++this.homeSequence, kind, at, x, y });
      if (this.homeEffects.length > 16) this.homeEffects.shift();
    }
  }
  clear() {
    for (const map of [this.towers, this.defenders, this.projectiles, this.effects]) {
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
    airLift: number,
  ) {
    const wanted = new Set<number>(),
      defending = new Set<number>(),
      flying = new Set<string>(),
      showing = new Set<string>();
    const cues: SampleCue[] = [];
    const drawEffects = (poses: WizardTowerEffectPose[]) => {
      for (const fx of poses) {
        showing.add(fx.key);
        let view = this.effects.get(fx.key);
        if (!view) this.effects.set(fx.key, (view = new NativeSceneView(this.scene, fx.graph)));
        view.render(fx.poses, fx.x, fx.y, fx.depth);
        for (const object of view.objects)
          object.setData('nativeWizardTowerEffect', { key: fx.key, emitter: fx.emitter });
      }
    };
    const zoom = `${this.scene.cameras.main.zoomX}:${this.scene.cameras.main.zoomY}`;
    for (const tower of buildings) {
      if (tower.kind !== 'wizardtower') continue;
      wanted.add(tower.id);
      const p = iso(tower.x + 1.5, tower.y + 1.5);
      const state: WizardTowerVisualState =
        tower.hp <= 0
          ? 'ruin'
          : tower.constructing
            ? 'constructing'
            : tower.upgradeEnd
              ? 'upgrading'
              : 'setup';
      let view = this.towers.get(tower.id);
      if (!view) this.towers.set(tower.id, (view = new NativeSceneView(this.scene, 'wizardtower')));
      const key = `tower:${tower.id}`,
        signature = `${tower.level}:${state}:${p.x}:${p.y}:${zoom}`;
      if (this.signatures.get(key) !== signature) {
        view.render(
          wizardTowerPoses(tower.level, state),
          p.x,
          p.y,
          p.y + (state === 'ruin' ? -2 : 0),
        );
        for (const object of view.objects)
          object.setData('nativeWizardTower', { id: tower.id, state, level: tower.level });
        this.signatures.set(key, signature);
      }
      if (state === 'setup' || state === 'upgrading') {
        defending.add(tower.id);
        const pose = towerWizardPose(tower, battle, elapsed, reduced);
        let actor = this.defenders.get(tower.id);
        if (!actor)
          this.defenders.set(tower.id, (actor = new NativeSceneView(this.scene, 'tower-wizard')));
        const key = `defender:${tower.id}`,
          signature = `${tower.level}:${pose.action}:${pose.direction}:${pose.flip}:${Math.floor(pose.time * 24 + 1e-9)}:${p.x}:${p.y}:${reduced}:${zoom}`;
        if (this.signatures.get(key) !== signature) {
          actor.render(towerWizardPoses(tower.level, pose, reduced), p.x, p.y, p.y + 0.1);
          for (const object of actor.objects)
            object.setData('nativeTowerWizard', { id: tower.id, ...pose });
          this.signatures.set(key, signature);
        }
      }
      if (battle && !battle.finished) {
        const history = battle.wizardTowers?.[tower.id];
        for (const shot of history?.shots ?? []) {
          const effect = wizardTowerAttackEffect(tower.level);
          cues.push(...wizardTowerSoundCues(tower.id, 'attack', shot.index, effect, shot.at));
          const poses = wizardTowerEffectPoses(
            tower.id,
            'attack',
            shot.index,
            effect,
            shot.at,
            elapsed,
            iso(shot.fromX, shot.fromY),
            reduced,
          );
          drawEffects(poses);
          if (!reduced)
            drawEffects(wizardTowerTrailPoses(tower.id, tower.level, shot, elapsed, iso, airLift));
        }
        for (const hit of history?.hits ?? []) {
          const effect = wizardTowerHitEffect(tower.level),
            ground = iso(hit.x, hit.y);
          cues.push(...wizardTowerSoundCues(tower.id, 'hit', hit.index, effect, hit.at));
          const poses = wizardTowerEffectPoses(
            tower.id,
            'hit',
            hit.index,
            effect,
            hit.at,
            elapsed,
            { x: ground.x, y: ground.y - (hit.toAir ? airLift : 0) - 16 },
            reduced,
          );
          for (const pose of poses) pose.depth = hit.toAir ? 8000 : pose.depth + 16;
          drawEffects(poses);
        }
        if (history?.destroyedAt !== undefined) {
          cues.push(
            ...wizardTowerSoundCues(
              tower.id,
              'destroy',
              0,
              'Building Destroyed',
              history.destroyedAt,
            ),
          );
          drawEffects(
            wizardTowerEffectPoses(
              tower.id,
              'destroy',
              0,
              'Building Destroyed',
              history.destroyedAt,
              elapsed,
              p,
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
        cues.push(...wizardTowerHandlingCues(event.id, event.index, event.kind, event.at));
        drawEffects(
          wizardTowerHandlingPoses(
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
        if (shot.weapon !== 'arcane') continue;
        const tower = battle.buildings.find((v) => v.id === shot.sourceId);
        if (!tower) continue;
        flying.add(shot.id);
        const pose = wizardProjectilePose(tower.level, shot, elapsed, iso, airLift);
        let view = this.projectiles.get(shot.id);
        if (!view)
          this.projectiles.set(
            shot.id,
            (view = new NativeSceneView(this.scene, 'wizardtower-effects')),
          );
        view.render(pose.poses, pose.x, pose.y, 8000);
        for (const object of view.objects)
          object.setData('nativeWizardProjectile', {
            id: shot.id,
            progress: pose.t,
            export: pose.export,
          });
      }
    for (const [map, ids, prefix] of [
      [this.towers, wanted, 'tower'],
      [this.defenders, defending, 'defender'],
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
    for (const [id, view] of this.projectiles)
      if (!flying.has(id)) {
        view.destroy();
        this.projectiles.delete(id);
      }
    return cues;
  }
}
