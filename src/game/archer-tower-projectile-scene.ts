import type Phaser from 'phaser';
import type { Battle } from './model';
import type { CombatProjectile } from './projectiles';
import {
  ARCHER_TOWER_PROJECTILE_GRAPH,
  archerTowerProjectilePose,
} from './archer-tower-projectile';
import { preloadNativeMeshes } from './native-mesh-scene';
import { NativeSceneView } from './native-scene-view';
const PREFIX = 'archer-tower-projectile';
export function preloadArcherTowerProjectiles(scene: Phaser.Scene) {
  preloadNativeMeshes(scene, ARCHER_TOWER_PROJECTILE_GRAPH, PREFIX);
}
export class ArcherTowerProjectiles {
  readonly views = new Map<string, NativeSceneView>();
  constructor(private scene: Phaser.Scene) {}
  clear() {
    for (const view of this.views.values()) view.destroy();
    this.views.clear();
  }
  render(
    battle: Battle | null,
    reduced: boolean,
    iso: (x: number, y: number) => { x: number; y: number },
    targetHeight: (p: CombatProjectile) => number,
  ) {
    const wanted = new Set<string>();
    if (battle && !battle.finished && !reduced)
      for (const p of battle.projectiles ?? []) {
        if (p.weapon !== 'arrow' || p.variant === undefined || !p.flight) continue;
        const pose = archerTowerProjectilePose(p, battle.elapsed, iso, targetHeight(p));
        wanted.add(p.id);
        let view = this.views.get(p.id);
        if (!view) this.views.set(p.id, (view = new NativeSceneView(this.scene, PREFIX)));
        view.render(pose.poses, pose.x, pose.y, 8000);
        for (const object of view.objects)
          object.setData('nativeTowerArrow', {
            id: p.id,
            level: p.variant,
            export: pose.export,
            x: pose.x,
            y: pose.y,
          });
      }
    for (const [id, view] of this.views)
      if (!wanted.has(id)) {
        view.destroy();
        this.views.delete(id);
      }
  }
}
