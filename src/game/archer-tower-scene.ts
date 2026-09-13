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
}
export class VillageArcherTowers {
  readonly views = new Map<number, { body: NativeSceneView; resident: NativeSceneView }>();
  constructor(private scene: Phaser.Scene) {}
  clear() {
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
  }
}
