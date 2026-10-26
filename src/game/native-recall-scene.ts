import type Phaser from 'phaser';
import type { Battle } from './model';
import type { NativeArtPack, NativeArtPacks } from './native-art-pack';
import { NativeEffectLayer } from './native-effect-layer';
import { needsRecallPresentation, recallEffectEvents } from './native-recall';
export class NativeRecallPresentation {
  private layer: NativeEffectLayer;
  constructor(scene: Phaser.Scene, packs: NativeArtPacks<NativeArtPack>) {
    this.layer = new NativeEffectLayer(scene, packs, 'recall-unit');
  }
  prefetch(battle: Battle | null | undefined) {
    if (needsRecallPresentation(battle)) this.layer.duration('Recall Disappear', Infinity);
  }
  hasArt(battle: Battle | null | undefined, reduced: boolean) {
    return (
      !!battle?.nativeRecallPresentation &&
      !reduced &&
      this.layer.status('Recall Disappear') === 'ready'
    );
  }
  render(
    battle: Battle | null,
    reduced: boolean,
    iso: (x: number, y: number) => { x: number; y: number },
  ) {
    this.layer.begin();
    this.prefetch(battle);
    if (battle && !battle.finished && this.hasArt(battle, reduced))
      for (const event of recallEffectEvents(battle, false, iso, (name) =>
        this.layer.duration(name, Infinity),
      ))
        this.layer.play(event, event.sampleAt, false);
    this.layer.end();
  }
  clear() {
    this.layer.clear();
  }
  destroy() {
    this.clear();
  }
}
