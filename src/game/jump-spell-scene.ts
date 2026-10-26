import type Phaser from 'phaser';
import source from '../../reference/jump-spell/effects.json' with { type: 'json' };
import type { NativeArtPack, NativeArtPacks } from './native-art-pack';
import { NativeSpellCastPresentation } from './native-spell-cast-scene';
/** Preserve Jump's existing source profiles and finite 20–100-second fields. */
export class JumpSpellPresentation extends NativeSpellCastPresentation {
  constructor(scene: Phaser.Scene, packs: NativeArtPacks<NativeArtPack>) {
    super(scene, packs, 'Jump', 'jump', source.spellLevels);
  }
}
