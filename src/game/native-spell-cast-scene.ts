import type Phaser from 'phaser';
import type { Battle } from './model';
import type { SpellKind } from './data';
import type { NativeArtPack, NativeArtPacks } from './native-art-pack';
import { NativeEffectLayer, nativeEffectPack } from './native-effect-layer';
import { capturedSpellEffectEvents, type SpellEffectProfile } from './native-spell-effects';
/** Finite source fields share a loader; all their phase packs must be ready before handoff. */
export class NativeSpellCastPresentation {
  protected layer: NativeEffectLayer;
  private warmEffects: string[];
  constructor(
    scene: Phaser.Scene,
    packs: NativeArtPacks<NativeArtPack>,
    private name: string,
    private kind: SpellKind,
    private profiles: readonly SpellEffectProfile[],
  ) {
    this.layer = new NativeEffectLayer(scene, packs, `${kind}-spell`);
    // Several phases and levels share one pack. Reused phases may live in a separate existing pack.
    this.warmEffects = [
      ...new Map(
        profiles
          .flatMap((row) => [
            row.PreDeployEffect,
            row.DeployEffect,
            row.DeployEffect2,
            row.ChargingEffect,
            ...(row.HitEffect ? [row.HitEffect] : []),
          ])
          .filter((effect): effect is string => !!effect)
          .map((effect) => [nativeEffectPack(effect) ?? effect, effect]),
      ).values(),
    ];
  }
  prefetch(battle: Battle | null | undefined) {
    if (
      battle?.nativeSpellArt?.includes(this.name) &&
      (battle.spells[this.kind] > 0 ||
        battle.nativeSpellCastHistory?.some((cast) => cast.name === this.name))
    )
      for (const effect of this.warmEffects) this.layer.duration(effect, Infinity);
  }
  hasArt(battle: Battle | null | undefined, reduced: boolean) {
    return (
      !!battle?.nativeSpellArt?.includes(this.name) &&
      !reduced &&
      this.warmEffects.length > 0 &&
      this.warmEffects.every((effect) => this.layer.status(effect) === 'ready')
    );
  }
  render(
    battle: Battle | null,
    reduced: boolean,
    iso: (x: number, y: number) => { x: number; y: number },
  ) {
    this.layer.begin();
    this.prefetch(battle);
    if (
      battle &&
      !battle.finished &&
      battle.nativeSpellCastHistory?.some((cast) => cast.name === this.name) &&
      this.hasArt(battle, reduced)
    )
      for (const event of capturedSpellEffectEvents(
        battle,
        this.name,
        this.profiles,
        iso,
        false,
        (name) => this.layer.duration(name, Infinity),
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
