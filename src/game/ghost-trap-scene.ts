import type Phaser from 'phaser';
import type { AudioManager } from './audio';
import type { LatePresentation, LateRenderContext } from './late-campaign-scene';
import type { Building } from './model';
import type { SampleCue } from './sample-audio';
import { ghostTrapFrame } from './ghost-trap-art';

/** The original coffin atlases are preloaded with the Skeleton Trap; nothing else is needed. */
export function preloadGhostTrap(scene: Phaser.Scene) {
  void scene;
}

/**
 * State-driven presentation: the armed tier-3 coffin at home, the tier-1 trigger clip from the
 * recorded activation, then its held final frame (reduced motion: the broken coffin). Concealed
 * traps are absent from `context.buildings`, so an untriggered Ghost Trap stays hidden in battle.
 */
export class GhostTrapPresentation implements LatePresentation {
  readonly bodies = new Map<number, Phaser.GameObjects.Image>();
  constructor(
    private scene: Phaser.Scene,
    audio: AudioManager,
  ) {
    void audio;
  }
  handles(b: Building) {
    return b.npc === 'ghost-trap';
  }
  bounds(b: Building): readonly [number, number, number, number] | undefined {
    if (!this.handles(b)) return undefined;
    const { art } = ghostTrapFrame(undefined, 0, false);
    const height = (art.width * art.frameHeight) / art.frameWidth;
    return [-art.originX * art.width, -art.originY * height, (1 - art.originX) * art.width, (1 - art.originY) * height];
  }
  render({ buildings, battle, elapsed, reduced, iso }: LateRenderContext): SampleCue[] {
    const wanted = new Set<number>();
    for (const trap of buildings) {
      if (!this.handles(trap)) continue;
      wanted.add(trap.id);
      const state = battle?.late?.ghostTrap?.traps[trap.id];
      const { art, frame } = ghostTrapFrame(state?.activatedAt, elapsed, reduced);
      const point = iso(trap.x + 0.5, trap.y + 0.5);
      let image = this.bodies.get(trap.id);
      if (!image) {
        image = this.scene.add.image(point.x, point.y, art.texture, frame);
        this.bodies.set(trap.id, image);
      }
      image
        .setTexture(art.texture, frame)
        .setOrigin(art.originX, art.originY)
        .setDisplaySize(art.width, (art.width * art.frameHeight) / art.frameWidth)
        .setPosition(point.x, point.y)
        .setDepth(point.y)
        .setData('ghostTrap', { id: trap.id, activated: !!state, frame });
    }
    for (const [id, image] of this.bodies)
      if (!wanted.has(id)) {
        image.destroy();
        this.bodies.delete(id);
      }
    return [];
  }
  clear() {
    for (const image of this.bodies.values()) image.destroy();
    this.bodies.clear();
  }
  destroy() {
    this.clear();
  }
}
