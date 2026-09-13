import type { AudioManager } from './audio';
import {
  ARCHER_TOWER_SOUNDS,
  archerTowerSample,
  archerTowerHandlingCues,
  type ArcherTowerHandlingEvent,
} from './archer-tower-sounds';
import { archerTowerHandlingPoses } from './archer-tower-effects';
import type Phaser from 'phaser';
import type { Building } from './model';
import { ARCHER_TOWER_GRAPH, TOWER_ARCHER_GRAPH, archerTowerComposition } from './archer-tower-art';
import { NativeSceneView } from './native-scene-view';
import { preloadNativeMeshes } from './native-mesh-scene';
import {
  nativeMatrix,
  nativeVertices,
  type NativeScenePose,
  type NativeMatrix,
} from './native-mesh';
const ROOT: NativeMatrix = [1.2, 0, 0, 0, 1.2, -96];
const transform = (poses: NativeScenePose[]): NativeScenePose[] =>
  poses.map((p) =>
    'group' in p
      ? { ...p, group: transform(p.group) }
      : { ...p, matrix: nativeMatrix(ROOT, p.matrix) },
  );
export function villageArcherTowerPoses(b: Building, seconds: number) {
  const state =
    b.hp <= 0 ? 'ruin' : b.constructing ? 'constructing' : b.upgradeEnd ? 'upgrading' : 'ready';
  const poses = archerTowerComposition(b.level, state, seconds);
  return { body: transform(poses.body), residents: transform(poses.residents) };
}
export function villageArcherTowerBounds(b: Building, seconds: number) {
  const poses = villageArcherTowerPoses(b, seconds),
    bounds = [Infinity, Infinity, -Infinity, -Infinity];
  const pending = [...poses.body, ...poses.residents];
  while (pending.length) {
    const p = pending.pop()!;
    if ('group' in p) {
      pending.push(...p.group);
      continue;
    }
    const v = nativeVertices(p);
    for (let i = 0; i < v.length; i += 4) {
      bounds[0] = Math.min(bounds[0], v[i]);
      bounds[1] = Math.min(bounds[1], v[i + 1]);
      bounds[2] = Math.max(bounds[2], v[i]);
      bounds[3] = Math.max(bounds[3], v[i + 1]);
    }
  }
  return bounds;
}
export function preloadVillageArcherTowers(scene: Phaser.Scene) {
  preloadNativeMeshes(scene, ARCHER_TOWER_GRAPH, 'archer-tower-body');
  preloadNativeMeshes(scene, TOWER_ARCHER_GRAPH, 'archer-tower-resident');
  for (const [path, sound] of Object.entries(ARCHER_TOWER_SOUNDS))
    scene.load.binary(archerTowerSample(path), '/' + sound.path);
}
export class VillageArcherTowers {
  ghost?: { body: NativeSceneView; resident: NativeSceneView };
  preview(building: Building | undefined, x = 0, y = 0, valid = true) {
    if (!building) {
      this.ghost?.body.destroy();
      this.ghost?.resident.destroy();
      this.ghost = undefined;
      return;
    }
    this.ghost ??= {
      body: new NativeSceneView(this.scene, 'archer-tower-body'),
      resident: new NativeSceneView(this.scene, 'archer-tower-resident'),
    };
    const poses = villageArcherTowerPoses(building, 0);
    const tint = (items: NativeScenePose[]) =>
      valid
        ? items
        : items.map((p) => ({
            ...p,
            multiply: p.multiply.map((value, i) => value * (i === 1 || i === 2 ? 0x72 / 255 : 1)),
            add: p.add.map((value, i) => value * (i === 1 || i === 2 ? 0x72 / 255 : 1)),
          }));
    this.ghost.body.render(tint(poses.body), x, y, 6001, 0.72);
    this.ghost.resident.render(tint(poses.residents), x, y, 6001.01, 0.72);
  }
  readonly views = new Map<number, { body: NativeSceneView; resident: NativeSceneView }>();
  readonly effects = new Map<string, NativeSceneView>();
  private homeSequence = 0;
  private homeEvents: ArcherTowerHandlingEvent[] = [];
  constructor(
    private scene: Phaser.Scene,
    audio: AudioManager,
  ) {
    for (const path of Object.keys(ARCHER_TOWER_SOUNDS))
      audio.samples.register(
        archerTowerSample(path),
        scene.cache.binary.get(archerTowerSample(path)),
      );
  }
  handling(id: number, kind: 'pickup' | 'place' | 'cancel', at: number, x: number, y: number) {
    if (kind === 'cancel') this.homeEvents = this.homeEvents.filter((event) => event.id !== id);
    else {
      this.homeEvents.push({ id, index: ++this.homeSequence, kind, at, x, y });
      if (this.homeEvents.length > 16) this.homeEvents.shift();
    }
  }
  clear() {
    this.preview(undefined);
    this.homeEvents = [];
    for (const view of this.effects.values()) view.destroy();
    this.effects.clear();
    for (const pair of this.views.values()) {
      pair.body.destroy();
      pair.resident.destroy();
    }
    this.views.clear();
  }
  render(
    buildings: Building[],
    seconds: number,
    iso: (x: number, y: number) => { x: number; y: number },
    soundTime = seconds,
    reduced = false,
  ) {
    const wanted = new Set<number>();
    for (const b of buildings) {
      if (b.kind !== 'archertower') continue;
      wanted.add(b.id);
      let pair = this.views.get(b.id);
      if (!pair)
        this.views.set(
          b.id,
          (pair = {
            body: new NativeSceneView(this.scene, 'archer-tower-body'),
            resident: new NativeSceneView(this.scene, 'archer-tower-resident'),
          }),
        );
      const p = iso(b.x + 1.5, b.y + 1.5),
        poses = villageArcherTowerPoses(b, seconds);
      pair.body.render(poses.body, p.x, p.y, p.y);
      pair.resident.render(poses.residents, p.x, p.y, p.y + 0.01);
    }
    for (const [id, pair] of this.views)
      if (!wanted.has(id)) {
        pair.body.destroy();
        pair.resident.destroy();
        this.views.delete(id);
      }
    this.homeEvents = this.homeEvents.filter((event) => soundTime - event.at < 5);
    const wantedEffects = new Set<string>();
    for (const pose of archerTowerHandlingPoses(this.homeEvents, soundTime, reduced, iso)) {
      wantedEffects.add(pose.key);
      let view = this.effects.get(pose.key);
      if (!view)
        this.effects.set(pose.key, (view = new NativeSceneView(this.scene, 'archer-tower-body')));
      view.render(pose.poses, pose.x, pose.y, pose.depth);
    }
    for (const [key, view] of this.effects)
      if (!wantedEffects.has(key)) {
        view.destroy();
        this.effects.delete(key);
      }
    return archerTowerHandlingCues(this.homeEvents);
  }
}
