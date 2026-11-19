import type Phaser from 'phaser';
import type { Battle } from './model';
import type { CombatProjectile } from './projectiles';
import {
  ARCHER_TOWER_PROJECTILE_GRAPH,
  archerTowerProjectilePose,
} from './archer-tower-projectile';
import { nativeMeshTexture } from './native-mesh';
import type { LazyTextures } from './lazy-textures';
import { NativeSceneView } from './native-scene-view';
import { presentationLive, presentationProjectiles, presentationTime } from './presentation-clock';
const PREFIX = 'archer-tower-projectile';
const PAGES = Object.entries(ARCHER_TOWER_PROJECTILE_GRAPH.textures).map(([id, page]) => ({
  key: nativeMeshTexture(PREFIX, id),
  url: '/' + page.path,
}));

export class ArcherTowerProjectiles {
  readonly views = new Map<string, NativeSceneView>();
  constructor(
    private scene: Phaser.Scene,
    private textures: LazyTextures,
  ) {}
  /** Fetch without putting the projectile page on the village's boot loader. */
  prefetch() {
    for (const { key, url } of PAGES) void this.textures.request(key, url);
  }
  get artReady() {
    return PAGES.every(({ key }) => this.scene.textures.exists(key));
  }
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
    // Arrows in flight when the battle ends keep flying on the presentation clock.
    if (battle && presentationLive(battle) && !reduced && this.artReady) {
      const elapsed = presentationTime(battle);
      for (const p of presentationProjectiles(battle)) {
        if (p.weapon !== 'arrow' || p.variant === undefined || !p.flight) continue;
        const pose = archerTowerProjectilePose(p, elapsed, iso, targetHeight(p));
        wanted.add(p.id);
        let view = this.views.get(p.id);
        if (!view) {
          view = new NativeSceneView(this.scene, PREFIX);
          // Every arrow is a new view: its trail colors (within 0..1) ride on the drawn buffer
          // as a GPU tint. The float filter pass resized a pooled drawing context per arrow,
          // and each resize created a framebuffer whose completeness check stalls the GPU.
          view.gpuGroupColor = true;
          this.views.set(p.id, view);
        }
        view.render(pose.poses, pose.x, pose.y, 8000);
        for (const object of view.objects) {
          const data = object.getData('nativeTowerArrow');
          if (data?.id === p.id) Object.assign(data, { export: pose.export, x: pose.x, y: pose.y });
          else
            object.setData('nativeTowerArrow', {
              id: p.id,
              level: p.variant,
              export: pose.export,
              x: pose.x,
              y: pose.y,
            });
        }
      }
    }
    for (const [id, view] of this.views)
      if (!wanted.has(id)) {
        view.destroy();
        this.views.delete(id);
      }
  }
}
