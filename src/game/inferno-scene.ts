import { INFERNO_SOUNDS, infernoSample } from './inferno-sounds';
import type { AudioManager } from './audio';
import { infernoImpactPoses } from './inferno-effects';
import { TROOPS } from './data';
import { infernoBeamPoses, infernoBeamProfile } from './inferno-beam';
import { infernoDamageStage } from './inferno-weapon';
import type Phaser from 'phaser';
import type { Battle, Building } from './model';
import { NativeSceneView } from './native-scene-view';
import { preloadNativeMeshes } from './native-mesh-scene';
import {
  INFERNO_ROOT,
  INFERNO_GRAPH,
  infernoAsset,
  infernoTexture,
  infernoPoses,
} from './inferno-art';

export function preloadInfernos(scene: Phaser.Scene) {
  for (const [path, sound] of Object.entries(INFERNO_SOUNDS))
    scene.load.binary(infernoSample(path), '/' + sound.path);
  preloadNativeMeshes(scene, INFERNO_GRAPH, 'inferno');
  for (let level = 1; level <= 12; level++)
    for (const mode of ['single', 'multi'] as const)
      scene.load.image(infernoTexture(level, mode), infernoAsset(level, mode));
}
export class InfernoPresentation {
  readonly impacts = new Map<string, NativeSceneView>();
  readonly beams = new Map<string, NativeSceneView>();
  readonly views = new Map<number, NativeSceneView>();
  constructor(
    private scene: Phaser.Scene,
    audio: AudioManager,
  ) {
    for (const path of Object.keys(INFERNO_SOUNDS))
      audio.samples.register(infernoSample(path), scene.cache.binary.get(infernoSample(path)));
  }
  clear() {
    for (const view of this.impacts.values()) view.destroy();
    this.impacts.clear();
    for (const view of this.beams.values()) view.destroy();
    this.beams.clear();
    for (const view of this.views.values()) view.destroy();
    this.views.clear();
  }
  render(
    buildings: Building[],
    seconds: number,
    battle: Battle | null,
    reduced: boolean,
    iso: (x: number, y: number) => { x: number; y: number },
  ) {
    const wantedImpacts = new Set<string>();
    for (const pose of infernoImpactPoses(battle, reduced, iso)) {
      wantedImpacts.add(pose.key);
      let view = this.impacts.get(pose.key);
      if (!view) this.impacts.set(pose.key, (view = new NativeSceneView(this.scene, 'inferno')));
      view.render(pose.poses, pose.x, pose.y, pose.depth);
    }
    for (const [key, view] of this.impacts)
      if (!wantedImpacts.has(key)) {
        view.destroy();
        this.impacts.delete(key);
      }
    const wanted = new Set<number>();
    const wantedBeams = new Set<string>();
    for (const building of buildings) {
      if (building.kind !== 'inferno') continue;
      wanted.add(building.id);
      let view = this.views.get(building.id);
      if (!view) this.views.set(building.id, (view = new NativeSceneView(this.scene, 'inferno')));
      const point = iso(building.x + 1, building.y + 1);
      const state =
        building.hp <= 0
          ? 'ruin'
          : building.constructing
            ? 'constructing'
            : building.upgradeEnd
              ? 'upgrading'
              : 'active';
      view.render(
        infernoPoses(
          building.level,
          building.infernoMode ?? 'single',
          state,
          seconds,
          INFERNO_ROOT,
        ),
        point.x,
        point.y,
        point.y,
      );
      for (const object of view.objects) object.setData('nativeInferno', building.id);
      const combat = battle?.infernos?.[building.id];
      if (
        state !== 'active' ||
        battle?.finished ||
        !combat ||
        (battle!.defenseStuns[building.id] ?? 0) >= battle!.elapsed
      )
        continue;
      combat.scheduler.slots.forEach((slot, index) => {
        const target = battle!.units.find(
          (unit) => unit.id === slot.targetId && unit.hp > 0 && !unit.ejected,
        );
        if (!target) return;
        const stage = infernoDamageStage(combat.scheduler.mode, slot.lockedMs, building.level);
        const profile = infernoBeamProfile(building.level, stage);
        const end = iso(target.x, target.y);
        const from = { x: point.x, y: point.y - profile.startZ * 1.2 };
        const to = { x: end.x, y: end.y - (TROOPS[target.kind].flying ? 46 : 0) };
        const key = `${building.id}:${index}`;
        wantedBeams.add(key);
        let beam = this.beams.get(key);
        if (!beam) this.beams.set(key, (beam = new NativeSceneView(this.scene, 'inferno')));
        beam.render(infernoBeamPoses(building.level, stage, seconds, from, to), 0, 0, 100000);
      });
    }
    for (const [key, view] of this.beams)
      if (!wantedBeams.has(key)) {
        view.destroy();
        this.beams.delete(key);
      }
    for (const [id, view] of this.views)
      if (!wanted.has(id)) {
        view.destroy();
        this.views.delete(id);
      }
  }
}
