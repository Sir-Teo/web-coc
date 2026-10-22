import type Phaser from 'phaser';
import type { NativeArtPack, NativeArtPacks } from './native-art-pack';
import { NativeEffectLayer } from './native-effect-layer';
import type { Battle } from './model';
import { presentationLive, presentationTime } from './presentation-clock';
import {
  garrisonChainEffects,
  garrisonLateEffectShapes,
  type LateEffectShape,
} from './garrison-late-effects';
type Iso = (x: number, y: number) => { x: number; y: number };

/** Everything a shape's Graphics draws, relative to its position. */
function shapeSignature(shape: LateEffectShape) {
  if (shape.kind === 'bolt') {
    let points = '';
    for (const point of shape.points) points += `${point.x},${point.y};`;
    return `bolt:${shape.color}:${shape.width}:${shape.alpha}:${points}`;
  }
  return `ring:${shape.color}:${shape.width}:${shape.alpha}:${shape.fill}:${shape.rx}:${shape.ry}`;
}

/** One Graphics object per shape key; destroyed when the shape expires or the battle ends. */
export class GarrisonLateEffects {
  private graphics = new Map<string, Phaser.GameObjects.Graphics>();
  /** Last drawn signature per key: unchanged shapes (a resting aura) are not redrawn. */
  private drawn = new Map<string, string>();
  private native: NativeEffectLayer;
  constructor(
    private scene: Phaser.Scene,
    packs: NativeArtPacks<NativeArtPack>,
  ) {
    this.native = new NativeEffectLayer(scene, packs, 'garrison-chain');
  }
  render(battle: Battle | null, reduced: boolean, iso: Iso, lift: number) {
    const wanted = new Set<string>();
    const covered = new Set<string>();
    const elapsed = battle && presentationLive(battle) ? presentationTime(battle) : Infinity;
    this.native.begin();
    if (battle) {
      // Probe only recent recorded segments, so idle villages never fetch this pack.
      const events = garrisonChainEffects(battle, iso, lift, elapsed, 1);
      if (events.length) {
        const duration = this.native.duration('Electro Dragon Attack Chain');
        if (duration !== undefined)
          for (const event of events)
            if (elapsed - event.at < duration && this.native.play(event, elapsed, reduced))
              covered.add(event.key);
      }
    }
    this.native.end();
    const shapes = battle
      ? garrisonLateEffectShapes(
          battle,
          reduced,
          iso,
          lift,
          // After the grace window every transient shape has expired (all last under 1 s).
          presentationLive(battle) ? presentationTime(battle) : Infinity,
        )
      : [];
    for (const shape of shapes) {
      if (covered.has(shape.key)) continue;
      wanted.add(shape.key);
      let g = this.graphics.get(shape.key);
      if (!g) {
        g = this.scene.add.graphics();
        g.setData('nativeGarrisonLateEffect', shape.key);
        this.graphics.set(shape.key, g);
      }
      if (g.depth !== shape.depth) g.setDepth(shape.depth);
      const x = shape.kind === 'bolt' ? 0 : shape.x,
        y = shape.kind === 'bolt' ? 0 : shape.y;
      if (g.x !== x || g.y !== y) g.setPosition(x, y);
      const signature = shapeSignature(shape);
      if (this.drawn.get(shape.key) === signature) continue;
      this.drawn.set(shape.key, signature);
      g.clear();
      if (shape.kind === 'bolt') {
        const stroke = (width: number, color: number, alpha: number) => {
          g.lineStyle(width, color, alpha).beginPath();
          g.moveTo(shape.points[0].x, shape.points[0].y);
          for (let i = 1; i < shape.points.length; i++)
            g.lineTo(shape.points[i].x, shape.points[i].y);
          g.strokePath();
        };
        stroke(shape.width + 3, shape.color, shape.alpha * 0.35);
        stroke(shape.width, 0xffffff, shape.alpha);
      } else {
        g.fillStyle(shape.color, shape.fill).fillEllipse(0, 0, shape.rx * 2, shape.ry * 2);
        g.lineStyle(shape.width, shape.color, shape.alpha).strokeEllipse(
          0,
          0,
          shape.rx * 2,
          shape.ry * 2,
        );
      }
    }
    for (const [key, g] of this.graphics)
      if (!wanted.has(key)) {
        g.destroy();
        this.graphics.delete(key);
        this.drawn.delete(key);
      }
  }
  clear() {
    this.native.clear();
    for (const g of this.graphics.values()) g.destroy();
    this.graphics.clear();
    this.drawn.clear();
  }
}
