import type Phaser from 'phaser';
import type { Battle } from './model';
import type { NativeArtPack, NativeArtPacks } from './native-art-pack';
import { NativeEffectLayer } from './native-effect-layer';
import { FREEZE_SPELL_EFFECTS, freezeSpellEffectEvents } from './freeze-spell-effects';
/** Original Freeze bottle and level-specific frost share the retained native mesh loader. */
export class FreezeSpellPresentation {
  private layer: NativeEffectLayer;
  constructor(scene: Phaser.Scene, packs: NativeArtPacks<NativeArtPack>) {
    this.layer = new NativeEffectLayer(scene, packs, 'freeze-spell');
  }
  prefetch(battle: Battle | null | undefined) {
    if (
      battle?.nativeFreezeCastPresentation &&
      (battle.spells.freeze > 0 || battle.nativeFreezeCasts?.length)
    )
      for (const name of FREEZE_SPELL_EFFECTS) this.layer.duration(name);
  }
  hasArt(battle: Battle | null | undefined, reduced: boolean) {
    return (
      !!battle?.nativeFreezeCastPresentation &&
      !reduced &&
      this.layer.status(FREEZE_SPELL_EFFECTS[0]) === 'ready'
    );
  }
  render(
    battle: Battle | null,
    reduced: boolean,
    iso: (x: number, y: number) => { x: number; y: number },
  ) {
    this.layer.begin();
    this.prefetch(battle);
    if (battle && !battle.finished)
      for (const event of freezeSpellEffectEvents(battle, iso, reduced, (name) =>
        this.layer.duration(name),
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
