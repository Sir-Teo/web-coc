import { OVERGROWTH_CAST_EFFECTS, overgrowthCastEffects } from './overgrowth-cast-effects';
import type Phaser from 'phaser';
import type { Battle } from './model';
import { NativeEffectLayer } from './native-effect-layer';
import type { NativeArtPacks, NativeArtPack } from './native-art-pack';
import { OVERGROWTH_EFFECTS, overgrowthEffectEvents } from './overgrowth-effects';
/** Original roots share the effect loader and retained meshes with other native battle art. */
export class OvergrowthPresentation {
  private layer: NativeEffectLayer;
  private covered = new Set<number>();
  constructor(scene: Phaser.Scene, packs: NativeArtPacks<NativeArtPack>) {
    this.layer = new NativeEffectLayer(scene, packs, 'overgrowth');
  }
  prefetch(battle: Battle | null | undefined) {
    if (
      battle?.nativeOvergrowthPresentation &&
      (battle.spells.overgrowth > 0 ||
        battle.nativeOvergrowthRoots?.length ||
        battle.nativeSpells?.some((s) => s.name === 'Overgrowth'))
    )
      for (const name of OVERGROWTH_EFFECTS) this.layer.duration(name);
    if (
      battle?.nativeOvergrowthCastPresentation &&
      (battle.spells.overgrowth > 0 || battle.nativeOvergrowthCasts?.length)
    )
      for (const name of OVERGROWTH_CAST_EFFECTS) this.layer.duration(name);
  }
  hasCastArt(battle: Battle | null | undefined, reduced: boolean) {
    return (
      !!battle?.nativeOvergrowthCastPresentation &&
      !reduced &&
      this.layer.status(OVERGROWTH_CAST_EFFECTS[0]) === 'ready'
    );
  }
  covers(id: number) {
    return this.covered.has(id);
  }
  render(
    battle: Battle | null,
    reduced: boolean,
    iso: (x: number, y: number) => { x: number; y: number },
  ) {
    this.layer.begin();
    this.covered.clear();
    this.prefetch(battle);
    if (battle && !battle.finished) {
      for (const event of overgrowthCastEffects(battle, iso, reduced, (name) =>
        this.layer.duration(name),
      ))
        this.layer.play(event, event.sampleAt, false);
      for (const event of overgrowthEffectEvents(battle, iso, reduced, (name) =>
        this.layer.duration(name),
      )) {
        if (this.layer.play(event, event.sampleAt, reduced) && event.active)
          this.covered.add(event.buildingId);
      }
    }
    this.layer.end();
  }
  clear() {
    this.covered.clear();
    this.layer.clear();
  }
  destroy() {
    this.clear();
  }
}
