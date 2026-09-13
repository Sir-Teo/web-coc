import type Phaser from 'phaser';
import type { AudioManager } from './audio';
import type { LatePresentation, LateRenderContext } from './late-campaign-scene';
import type { Building } from './model';
import type { SampleCue } from './sample-audio';
import { freezeTrapAsset, freezeTrapTexture } from './freeze-trap-art';

export function preloadFreezeTrap(scene: Phaser.Scene) {
  scene.load.image(freezeTrapTexture(1), freezeTrapAsset(1));
}

/** State-driven presentation; rendering reads battle histories so replay seeks stay exact. */
export class FreezeTrapPresentation implements LatePresentation {
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
