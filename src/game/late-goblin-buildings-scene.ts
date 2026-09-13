import type Phaser from 'phaser';
import type { AudioManager } from './audio';
import type { LatePresentation, LateRenderContext } from './late-campaign-scene';
import type { Building } from './model';
import type { SampleCue } from './sample-audio';
import { LATE_GOBLIN_BUILDING_ART } from './late-goblin-buildings-art';

export function preloadLateGoblinBuildings(scene: Phaser.Scene) {
  for (const art of Object.values(LATE_GOBLIN_BUILDING_ART))
    scene.load.image(art.texture, art.asset);
}

/** State-driven presentation; rendering reads battle histories so replay seeks stay exact. */
export class LateGoblinBuildingsPresentation implements LatePresentation {
  constructor(
    private scene: Phaser.Scene,
    audio: AudioManager,
  ) {
    void audio;
  }
  /** True once this family renders the building itself (the fallback sprite is hidden). */
  handles(b: Building) {
    void b;
    return false;
  }
  bounds(b: Building): readonly [number, number, number, number] | undefined {
    void b;
    return undefined;
  }
  render(context: LateRenderContext): SampleCue[] {
    void context;
    void this.scene;
    return [];
  }
  clear() {}
  destroy() {
    this.clear();
  }
}
