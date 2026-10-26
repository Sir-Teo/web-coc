import type Phaser from 'phaser';
import type { Battle } from './model';
import type { NativeArtPack, NativeArtPacks } from './native-art-pack';
import { NativeEffectLayer } from './native-effect-layer';
import { JUMP_SPELL_EFFECTS, jumpSpellEffectEvents } from './jump-spell-effects';
/** Original Jump bottle and level-specific field share the retained native mesh loader. */
export class JumpSpellPresentation {
  private layer: NativeEffectLayer;
  constructor(scene: Phaser.Scene, packs: NativeArtPacks<NativeArtPack>) {
    this.layer = new NativeEffectLayer(scene, packs, 'jump-spell');
  }
  prefetch(battle: Battle | null | undefined) {
    if (
      battle?.nativeSpellArt?.includes('Jump') &&
      (battle.spells.jump > 0 ||
        battle.nativeSpellCastHistory?.some((cast) => cast.name === 'Jump'))
    )
      for (const name of JUMP_SPELL_EFFECTS) this.layer.duration(name, Infinity);
  }
  hasArt(battle: Battle | null | undefined, reduced: boolean) {
    return (
      !!battle?.nativeSpellArt?.includes('Jump') &&
      !reduced &&
      this.layer.status(JUMP_SPELL_EFFECTS[0]) === 'ready'
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
      for (const event of jumpSpellEffectEvents(battle, iso, reduced, (name) =>
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
