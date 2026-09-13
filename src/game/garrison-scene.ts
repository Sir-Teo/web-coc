import type Phaser from 'phaser';
import type { Battle } from './model';
import { NativeSceneView } from './native-scene-view';
import { preloadNativeMeshes } from './native-mesh-scene';
import { CHARACTER_ART, COMMON_DEATH_ART, PROJECTILE_ART } from './character-art';
import { characterLayers } from './garrison-layers';
import { GARRISON_SOUNDS, garrisonSample } from './garrison-sounds';
import type { AudioManager } from './audio';
import { GARRISON_EFFECT_GRAPH, garrisonImpactPoses } from './garrison-effects';
import { garrisonShotPoses } from './garrison-projectiles';
import { garrisonStats } from './garrison-kinds';

export function preloadGarrisonTroops(scene: Phaser.Scene) {
  preloadNativeMeshes(scene, GARRISON_EFFECT_GRAPH, 'garrison-effects');
  for (const [path, sound] of Object.entries(GARRISON_SOUNDS))
    scene.load.binary(garrisonSample(path), '/' + sound.path);
  // Original character graphs (No Flight Zone foundation keys first) and projectile files.
  for (const art of [...Object.values(CHARACTER_ART), COMMON_DEATH_ART, ...Object.values(PROJECTILE_ART)])
    preloadNativeMeshes(scene, art.graph, art.prefix);
}
export class GarrisonPresentation {
  readonly defenders = new Map<number, NativeSceneView>();
  readonly shadows = new Map<number, NativeSceneView>();
  readonly effects = new Map<string, NativeSceneView>();
  readonly shots = new Map<string, NativeSceneView>();
  private families = new Map<number, string>();
  constructor(
    private scene: Phaser.Scene,
    audio: AudioManager,
  ) {
    for (const path of Object.keys(GARRISON_SOUNDS))
      audio.samples.register(garrisonSample(path), scene.cache.binary.get(garrisonSample(path)));
  }
  clear() {
    for (const view of this.defenders.values()) view.destroy();
    this.defenders.clear();
    for (const view of this.shadows.values()) view.destroy();
    this.shadows.clear();
    this.families.clear();
    for (const view of this.effects.values()) view.destroy();
    this.effects.clear();
    for (const view of this.shots.values()) view.destroy();
    this.shots.clear();
  }
  render(
    battle: Battle | null,
    reduced: boolean,
    iso: (x: number, y: number) => { x: number; y: number },
    lift: number,
  ) {
    const particles = garrisonImpactPoses(battle, reduced, iso, lift);
    const effectKeys = new Set(particles.map((p) => p.key));
    for (const p of particles) {
      let view = this.effects.get(p.key);
      if (!view)
        this.effects.set(p.key, (view = new NativeSceneView(this.scene, 'garrison-effects')));
      view.render(p.poses, p.x, p.y, p.depth);
      for (const object of view.objects) object.setData('nativeGarrisonEffect', p.key);
    }
    for (const [key, view] of this.effects)
      if (!effectKeys.has(key)) {
        view.destroy();
        this.effects.delete(key);
      }
    this.renderShots(battle, reduced, iso, lift);
    const wanted = new Set<number>();
    for (const defender of battle?.defenders ?? []) {
      if (defender.kind === 'skeleton') continue;
      wanted.add(defender.id);
      const layers = characterLayers(defender, battle!, reduced);
      const family =
        layers?.prefix ??
        this.families.get(defender.id) ??
        (defender.kind === 'dragon' && defender.hp <= 0 ? COMMON_DEATH_ART.prefix : `unborn`);
      if (this.families.get(defender.id) !== family) {
        this.defenders.get(defender.id)?.destroy();
        this.defenders.delete(defender.id);
        this.shadows.get(defender.id)?.destroy();
        this.shadows.delete(defender.id);
        this.families.set(defender.id, family);
      }
      let view = this.defenders.get(defender.id);
      if (!view) this.defenders.set(defender.id, (view = new NativeSceneView(this.scene, family)));
      const point = iso(defender.x, defender.y);
      let shadow = this.shadows.get(defender.id);
      if (!shadow)
        this.shadows.set(defender.id, (shadow = new NativeSceneView(this.scene, family)));
      const flying = garrisonStats(defender.kind, defender.level).flying;
      // Original shadows stay on the ground; flyers receive the local air lift and draw above
      // rooftops, while ground troops sort with buildings by their projected ground point.
      shadow.render(layers?.shadow ?? [], point.x, point.y, flying ? -839 : point.y + 1.05);
      for (const object of shadow.objects) object.setData('nativeGarrisonShadow', defender.id);
      view.render(
        layers?.body ?? [],
        point.x,
        point.y - (flying ? lift : 0),
        flying ? 7500 + point.y / 10000 : point.y + 1.1,
      );
      for (const object of view.objects) object.setData('nativeGarrisonDefender', defender.id);
    }
    for (const [id, view] of this.defenders)
      if (!wanted.has(id)) {
        view.destroy();
        this.defenders.delete(id);
        this.families.delete(id);
        this.shadows.get(id)?.destroy();
        this.shadows.delete(id);
      }
  }
  private renderShots(
    battle: Battle | null,
    reduced: boolean,
    iso: (x: number, y: number) => { x: number; y: number },
    lift: number,
  ) {
    const wanted = new Set<string>();
    for (const shot of garrisonShotPoses(battle, reduced, iso, lift)) {
      const layers = [{ ...shot }];
      if (shot.shadow)
        layers.push({ ...shot, ...shot.shadow, key: `${shot.key}:shadow`, depth: -838 });
      for (const { key, prefix, poses, x, y, depth } of layers) {
        wanted.add(key);
        let view = this.shots.get(key);
        if (!view) this.shots.set(key, (view = new NativeSceneView(this.scene, prefix)));
        view.render(poses, x, y, depth);
        for (const object of view.objects) object.setData('nativeGarrisonShot', key);
      }
    }
    for (const [key, view] of this.shots)
      if (!wanted.has(key)) {
        view.destroy();
        this.shots.delete(key);
      }
  }
}
