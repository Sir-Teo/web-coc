import { darkDrillHandlingPoses, darkDrillDestructionPoses } from './dark-drill-effects';
import type { AudioManager } from './audio';
import {
  DARK_DRILL_SOUNDS,
  darkDrillSample,
  darkDrillHandlingCues,
  darkDrillDestructionCues,
  type DrillHandlingEvent,
} from './dark-drill-sounds';
import type Phaser from 'phaser';
import type { Building, Battle } from './model';
import { NativeSceneView } from './native-scene-view';
import { preloadNativeMeshes } from './native-mesh-scene';
import { DARK_DRILL_GRAPH, darkDrillBuildingPoses } from './dark-drill-art';

export function preloadDarkDrills(scene: Phaser.Scene) {
  preloadNativeMeshes(scene, DARK_DRILL_GRAPH, 'darkdrill');
  for (const [path, sound] of Object.entries(DARK_DRILL_SOUNDS))
    scene.load.binary(darkDrillSample(path), '/' + sound.path);
}
export class DarkDrillPresentation {
  readonly effects = new Map<string, NativeSceneView>();
  readonly drills = new Map<number, NativeSceneView>();
  private homeSequence = 0;
  private homeEvents: DrillHandlingEvent[] = [];
  constructor(
    private scene: Phaser.Scene,
    audio: AudioManager,
  ) {
    for (const path of Object.keys(DARK_DRILL_SOUNDS))
      audio.samples.register(darkDrillSample(path), scene.cache.binary.get(darkDrillSample(path)));
  }
  handling(id: number, kind: 'pickup' | 'place' | 'cancel', at: number, x: number, y: number) {
    if (kind === 'cancel') this.homeEvents = this.homeEvents.filter((event) => event.id !== id);
    else {
      this.homeEvents.push({ id, index: ++this.homeSequence, kind, at, x, y });
      if (this.homeEvents.length > 16) this.homeEvents.shift();
    }
  }
  clear() {
    this.homeEvents = [];
    for (const view of this.effects.values()) view.destroy();
    this.effects.clear();
    for (const view of this.drills.values()) view.destroy();
    this.drills.clear();
  }
  render(
    buildings: Building[],
    seconds: number,
    iso: (x: number, y: number) => { x: number; y: number },
    soundTime = seconds,
    reduced = false,
    destructionHistory?: Battle['drillDestructions'],
  ) {
    const wanted = new Set<number>();
    for (const building of buildings) {
      if (building.kind !== 'darkdrill') continue;
      wanted.add(building.id);
      let view = this.drills.get(building.id);
      if (!view)
        this.drills.set(building.id, (view = new NativeSceneView(this.scene, 'darkdrill')));
      const point = iso(building.x + 1.5, building.y + 1.5);
      view.render(darkDrillBuildingPoses(building, seconds), point.x, point.y, point.y);
      for (const object of view.objects) object.setData('nativeDrill', building.id);
    }
    for (const [id, view] of this.drills)
      if (!wanted.has(id)) {
        view.destroy();
        this.drills.delete(id);
      }
    this.homeEvents = this.homeEvents.filter((event) => soundTime - event.at < 5);
    const wantedEffects = new Set<string>();
    for (const pose of [
      ...darkDrillHandlingPoses(this.homeEvents, soundTime, reduced, iso),
      ...darkDrillDestructionPoses(destructionHistory, soundTime, reduced, iso),
    ]) {
      wantedEffects.add(pose.key);
      let view = this.effects.get(pose.key);
      if (!view) this.effects.set(pose.key, (view = new NativeSceneView(this.scene, 'darkdrill')));
      view.render(pose.poses, pose.x, pose.y, pose.depth);
    }
    for (const [key, view] of this.effects)
      if (!wantedEffects.has(key)) {
        view.destroy();
        this.effects.delete(key);
      }
    return [
      ...darkDrillHandlingCues(this.homeEvents),
      ...darkDrillDestructionCues(destructionHistory),
    ];
  }
}
