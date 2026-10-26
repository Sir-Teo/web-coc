import type Phaser from 'phaser';
import type { Battle } from './model';
import type { HeroKind } from './native-hero-data';
import type { NativeArtPack, NativeArtPacks } from './native-art-pack';
import source from '../../reference/revive/effects.json' with { type: 'json' };
import { NativeEffectLayer } from './native-effect-layer';
import {
  REVIVE_INDICATOR,
  reviveIndicatorEvents,
  reviveIndicatorBounds,
} from './revive-target-effects';
export class ReviveTargetPresentation {
  private layer: NativeEffectLayer;
  private targets: ({ hero: HeroKind; unitId: number } & {
    left: number;
    top: number;
    right: number;
    bottom: number;
  })[] = [];
  constructor(
    scene: Phaser.Scene,
    private packs: NativeArtPacks<NativeArtPack>,
  ) {
    this.layer = new NativeEffectLayer(scene, packs, 'revive-target');
  }
  prefetch(battle: Battle | null | undefined) {
    if (
      battle?.nativeReviveTargets &&
      !battle.finished &&
      battle.spells.revive > 0 &&
      (battle.nativeHeroes?.length || battle.hero)
    )
      this.layer.duration(REVIVE_INDICATOR, Infinity);
  }
  hasArt(battle: Battle | null | undefined) {
    return (
      !!battle?.nativeReviveTargets &&
      !battle.finished &&
      battle.spells.revive > 0 &&
      this.layer.status(REVIVE_INDICATOR) === 'ready'
    );
  }
  render(
    battle: Battle | null,
    reduced: boolean,
    iso: (x: number, y: number) => { x: number; y: number },
  ) {
    this.layer.begin();
    this.prefetch(battle);
    this.targets.length = 0;
    const events = reviveIndicatorEvents(battle, iso, reduced);
    if (events.length && this.hasArt(battle)) {
      const pack = this.packs.get(source.packs.target.path)!;
      for (const event of events) {
        // Essential targeting remains a full-opacity, stationary source pose in reduced motion.
        this.layer.play(event, event.sampleAt, false);
        const bounds = reviveIndicatorBounds(pack, event);
        if (bounds) this.targets.push({ ...bounds, hero: event.hero, unitId: event.unitId });
      }
    }
    this.layer.end();
  }
  pick(x: number, y: number, zoom: number) {
    const minimum = 44 / Math.max(0.1, zoom);
    return this.targets
      .slice()
      .reverse()
      .find((box) => {
        const px = Math.max(0, (minimum - (box.right - box.left)) / 2),
          py = Math.max(0, (minimum - (box.bottom - box.top)) / 2);
        return (
          x >= box.left - px && x <= box.right + px && y >= box.top - py && y <= box.bottom + py
        );
      })?.hero;
  }
  clear() {
    this.layer.clear();
    this.targets.length = 0;
  }
  destroy() {
    this.clear();
  }
}
