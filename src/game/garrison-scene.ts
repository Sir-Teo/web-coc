import type Phaser from 'phaser';
import type { Battle } from './model';
import { NativeSceneView } from './native-scene-view';
import { preloadNativeMeshes } from './native-mesh-scene';
import { GARRISON_GRAPHS } from './garrison-poses';
import { garrisonLayers } from './garrison-layers';
import { GARRISON_SOUNDS, garrisonSample } from './garrison-sounds';
import type { AudioManager } from './audio';
import { GARRISON_EFFECT_GRAPH, garrisonImpactPoses } from './garrison-effects';

export function preloadGarrisonTroops(scene: Phaser.Scene) {
  preloadNativeMeshes(scene, GARRISON_EFFECT_GRAPH, 'garrison-effects');
  for (const [path, sound] of Object.entries(GARRISON_SOUNDS))
    scene.load.binary(garrisonSample(path), '/' + sound.path);
  for (const [kind, graph] of Object.entries(GARRISON_GRAPHS))
    preloadNativeMeshes(scene, graph, `garrison-${kind}`);
}
export class GarrisonPresentation {
  readonly defenders = new Map<number, NativeSceneView>();
  readonly shadows = new Map<number, NativeSceneView>();
  readonly effects = new Map<string, NativeSceneView>();
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
    const wanted = new Set<number>();
    for (const defender of battle?.defenders ?? []) {
      if (
        defender.kind === 'skeleton' ||
        defender.kind === 'guardian' ||
        defender.kind === 'repairer'
      )
        continue;
      wanted.add(defender.id);
      const family = defender.kind === 'dragon' && defender.hp <= 0 ? 'dragonDeath' : defender.kind;
      if (this.families.get(defender.id) !== family) {
        this.defenders.get(defender.id)?.destroy();
        this.defenders.delete(defender.id);
        this.shadows.get(defender.id)?.destroy();
        this.shadows.delete(defender.id);
        this.families.set(defender.id, family);
      }
      let view = this.defenders.get(defender.id);
      if (!view)
        this.defenders.set(
          defender.id,
          (view = new NativeSceneView(this.scene, `garrison-${family}`)),
        );
      const point = iso(defender.x, defender.y);
      const layers = garrisonLayers(defender, battle!, reduced);
      let shadow = this.shadows.get(defender.id);
      if (!shadow)
        this.shadows.set(
          defender.id,
          (shadow = new NativeSceneView(this.scene, `garrison-${family}`)),
        );
      // Original shadow stays on the ground while the body receives the local air lift.
      shadow.render(layers.shadow, point.x, point.y, -839);
      for (const object of shadow.objects) object.setData('nativeGarrisonShadow', defender.id);
      view.render(layers.body, point.x, point.y - lift, 7500 + point.y / 10000);
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
}
