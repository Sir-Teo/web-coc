import type Phaser from 'phaser';
import type { AudioManager } from './audio';
import type { LatePresentation, LateRenderContext } from './late-campaign-scene';
import type { Building } from './model';
import type { SampleCue } from './sample-audio';

export function preloadTornadoTrap(scene: Phaser.Scene) {
  void scene;
}

/** State-driven presentation; rendering reads battle histories so replay seeks stay exact. */
export class TornadoTrapPresentation implements LatePresentation {
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
