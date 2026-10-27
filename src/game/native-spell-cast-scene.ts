import type Phaser from 'phaser';
import type { Battle } from './model';
import type { SpellKind } from './data';
import type { NativeArtPack, NativeArtPacks } from './native-art-pack';
import { NativeEffectLayer, nativeEffectPack } from './native-effect-layer';
import { capturedSpellEffectEvents, type SpellEffectProfile } from './native-spell-effects';
import { presentationLive, presentationTime } from './presentation-clock';
/** Finite source fields share a loader; all their phase packs must be ready before handoff. */
export class NativeSpellCastPresentation {
  protected layer: NativeEffectLayer;
  private warmEffects: string[];
  constructor(
    scene: Phaser.Scene,
    packs: NativeArtPacks<NativeArtPack>,
    private name: string,
    private kind: SpellKind | undefined,
    private profiles: readonly SpellEffectProfile[],
    private carried?: { hero: string; slug: string },
  ) {
    this.layer = new NativeEffectLayer(scene, packs, `${kind ?? name}-spell`);
    // Several phases and levels share one pack. Reused phases may live in a separate existing pack.
    this.warmEffects = [
      ...new Map(
        profiles
          .flatMap((row) => [
            row.PreDeployEffect,
            row.ActivationEffect,
            row.SpawnEffect,
            row.DeployEffect,
            row.DeployEffect2,
            row.ChargingEffect,
            row.EndEffect,
            ...(row.HitEffect ? [row.HitEffect] : []),
          ])
          .filter((effect): effect is string => !!effect)
          .map((effect) => [nativeEffectPack(effect) ?? effect, effect]),
      ).values(),
    ];
  }
  prefetch(battle: Battle | null | undefined) {
    const carried = this.carried;
    if (
      battle?.nativeSpellArt?.includes(this.name) &&
      ((this.kind !== undefined && battle.spells[this.kind] > 0) ||
        (carried &&
          battle.nativeHeroes?.some(
            (hero) =>
              hero.kind === carried.hero && hero.items.some((item) => item.slug === carried.slug),
          )) ||
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
    airLift = 0,
    ownerIso = iso,
  ) {
    this.layer.begin();
    this.prefetch(battle);
    const elapsed = battle && presentationLive(battle) ? presentationTime(battle) : Infinity;
    if (
      battle &&
      Number.isFinite(elapsed) &&
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
        elapsed,
        airLift,
        ownerIso,
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
