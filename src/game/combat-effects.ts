import Phaser from 'phaser';
import type { FX } from './model';
import type { EffectTween } from './effect-timeline';

type Point = { x: number; y: number };
type Weapon = NonNullable<FX['weapon']>;
const COLORS: Record<Weapon, number> = {
  arrow: 0xffe3a3,
  cannonball: 0xffc16a,
  rocket: 0xffa94a,
  fireball: 0xff8c32,
  bomb: 0xffb54f,
  towerbomb: 0xffb54f,
  arcane: 0xcf8dff,
  healing: 0xffed8a,
  xbowbolt: 0xffe3a3,
};

/** Short-lived weapon graphics. They never apply damage or mutate the battle. */
export class CombatEffects {
  private objects = new Set<Phaser.GameObjects.Graphics>();
  private flights = new Map<string, Phaser.GameObjects.Graphics>();
  constructor(
    private scene: Phaser.Scene,
    private animate: (config: EffectTween) => void = (config) => {
      scene.tweens.add(config);
    },
  ) {}

  private graphic() {
    const graphic = this.scene.add.graphics().setDepth(8000);
    this.objects.add(graphic);
    return graphic;
  }
  private remove(graphic: Phaser.GameObjects.Graphics) {
    this.scene.tweens.killTweensOf(graphic);
    this.objects.delete(graphic);
    graphic.destroy();
  }
  clear() {
    for (const graphic of [...this.objects]) this.remove(graphic);
    this.flights.clear();
  }

  quake(point: Point, radius: number, reduced: boolean) {
    const g = this.graphic().setPosition(point.x, point.y).setDepth(24).setData('kingQuake', true);
    const rx = radius * 32 * Math.SQRT2,
      ry = rx / 2;
    g.lineStyle(7, 0x80623c, 0.22).strokeEllipse(0, 0, rx * 2, ry * 2);
    g.lineStyle(2, 0xffe5a2, 0.7).strokeEllipse(0, 0, rx * 2, ry * 2);
    for (let i = 0; i < 13; i++) {
      const angle = (i * Math.PI * 2) / 13,
        inner = 0.15 + (i % 3) * 0.1;
      g.lineStyle(2, 0x62482c, 0.65).beginPath();
      g.moveTo(Math.cos(angle) * rx * inner, Math.sin(angle) * ry * inner);
      g.lineTo(Math.cos(angle + 0.025) * rx * 0.52, Math.sin(angle + 0.025) * ry * 0.52);
      g.lineTo(Math.cos(angle - 0.06) * rx * 0.8, Math.sin(angle - 0.06) * ry * 0.8);
      g.strokePath();
    }
    g.setScale(reduced ? 1 : 0.76);
    this.animate({
      targets: g,
      scale: 1,
      alpha: 0,
      duration: 380,
      onComplete: () => this.remove(g),
    });
  }

  private weaponGraphic(weapon: Weapon, from: Point) {
    const g = this.graphic().setPosition(from.x, from.y).setData('weapon', weapon);
    const color = COLORS[weapon];
    if (weapon === 'healing') {
      g.fillStyle(color, 0.2).fillEllipse(-5, 0, 22, 12);
      g.fillStyle(color, 0.85).fillCircle(0, 0, 4);
      g.fillStyle(0xfffff0).fillCircle(0, 0, 2);
    } else if (weapon === 'arrow') {
      g.lineStyle(2, 0x67442a).lineBetween(-12, 0, 8, 0);
      g.fillStyle(0xdce2d4).fillTriangle(7, -3, 14, 0, 7, 3);
      g.fillStyle(0xffecc3).fillTriangle(-13, -4, -6, 0, -13, 4);
    } else if (weapon === 'rocket') {
      g.fillStyle(0xff742d, 0.6).fillTriangle(-22, 0, -8, -5, -8, 5);
      g.fillStyle(0xffdd7b).fillTriangle(-16, 0, -7, -2, -7, 2);
      g.fillStyle(0x38373a).fillRoundedRect(-9, -4, 18, 8, 2);
      g.fillStyle(0xd7a956).fillRect(-5, -4, 3, 8);
      g.fillStyle(0xce4840).fillTriangle(8, -4, 15, 0, 8, 4);
    } else if (weapon === 'fireball' || weapon === 'arcane') {
      g.fillStyle(color, 0.2).fillEllipse(-8, 0, 32, 15);
      g.fillStyle(color, 0.6).fillTriangle(-23, 0, 0, -7, 0, 7);
      g.fillStyle(color).fillCircle(0, 0, 7);
      g.fillStyle(0xfff4cf).fillCircle(2, -1, 3);
    } else {
      const radius = weapon === 'bomb' || weapon === 'towerbomb' ? 6 : 4;
      g.fillStyle(0x272a2d).fillCircle(0, 0, radius);
      g.lineStyle(1, 0x141619).strokeCircle(0, 0, radius);
      g.fillStyle(0x90918b).fillCircle(-2, -2, 1.5);
      if (weapon === 'bomb' || weapon === 'towerbomb') {
        g.lineStyle(2, 0xcda867).lineBetween(0, -6, 3, -9);
        g.fillStyle(0xffd56b).fillCircle(3, -9, 2);
      }
    }
    return g;
  }

  poseProjectile(id: string, weapon: Weapon, from: Point, to: Point, progress: number) {
    let g = this.flights.get(id);
    if (!g) {
      g = this.weaponGraphic(weapon, from).setData('projectileId', id);
      this.flights.set(id, g);
    }
    const t = weapon === 'bomb' ? progress ** 3 : progress;
    g.setPosition(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t);
    if (weapon !== 'bomb') g.setRotation(Math.atan2(to.y - from.y, to.x - from.x));
  }

  /** A shell and its ground shadow share a battle-time pose, never a wall-clock tween. */
  poseMortar(id: string, from: Point, to: Point, muzzle: Point, progress: number) {
    let g = this.flights.get(id);
    if (!g) {
      g = this.graphic().setData('projectileId', id).setData('mortarShell', true);
      this.flights.set(id, g);
    }
    const x = muzzle.x + (to.x - muzzle.x) * progress;
    const groundY = from.y + (to.y - from.y) * progress;
    const y = muzzle.y + (to.y - muzzle.y) * progress - Math.sin(progress * Math.PI) * 115;
    const lift = groundY - y;
    g.clear().setPosition(x, y).setData('flightProgress', progress);
    g.fillStyle(0x342b22, 0.14 + 0.2 * (1 - Math.min(1, lift / 160)));
    g.fillEllipse(0, lift, 14, 7);
    g.fillStyle(0xffb14a, 0.45).fillCircle(0, 0, 7);
    g.fillStyle(0x302b26).fillCircle(0, 0, 5);
    g.lineStyle(1, 0xc59b55).strokeCircle(0, 0, 5);
    g.fillStyle(0xb8b2a3).fillCircle(-1.5, -2, 1.5);
  }

  retainProjectiles(ids: Set<string>) {
    for (const [id, g] of this.flights)
      if (!ids.has(id)) {
        this.remove(g);
        this.flights.delete(id);
      }
  }

  projectile(weapon: Weapon, from: Point, to: Point, reduced: boolean) {
    if (reduced) {
      this.impact(weapon, to, true);
      return;
    }
    const g = this.weaponGraphic(weapon, from);
    if (weapon !== 'bomb') g.setRotation(Math.atan2(to.y - from.y, to.x - from.x));
    const distance = Math.hypot(to.x - from.x, to.y - from.y);
    const duration = weapon === 'bomb' ? 330 : Phaser.Math.Clamp(distance * 1.05, 120, 300);
    this.scene.tweens.add({
      targets: g,
      x: to.x,
      y: to.y,
      duration,
      ease: weapon === 'bomb' ? 'Cubic.easeIn' : 'Linear',
      onComplete: () => {
        this.remove(g);
        this.impact(weapon, to, false);
      },
    });
    this.muzzle(weapon, from);
  }

  muzzle(weapon: Weapon, from: Point) {
    if (weapon === 'cannonball' || weapon === 'rocket') {
      const flash = this.graphic().setPosition(from.x, from.y).setData('muzzle', weapon);
      flash.fillStyle(0xffd28b, 0.9).fillCircle(0, 0, 8);
      flash.fillStyle(0xfff4d2).fillCircle(0, 0, 3);
      this.animate({
        targets: flash,
        alpha: 0,
        scale: 1.6,
        duration: 100,
        onComplete: () => this.remove(flash),
      });
    }
  }

  groundBlast(
    at: Point,
    radius: number,
    reduced: boolean,
    kind: 'bomb' | 'mortar' | 'towerbomb' = 'bomb',
  ) {
    const g = this.graphic().setDepth(7000).setPosition(at.x, at.y).setData('impact', kind);
    const width = radius * 64 * Math.SQRT2,
      height = width / 2;
    g.setData('blastRadius', radius);
    g.fillStyle(0xffa244, 0.17).fillEllipse(0, 0, width, height);
    g.lineStyle(2, 0xffd18b, 0.9).strokeEllipse(0, 0, width, height);
    g.fillStyle(0x493020, 0.45).fillEllipse(0, 0, 26, 13);
    g.fillStyle(0xffac38, 0.95);
    g.fillTriangle(-22, -3, -4, -8, 0, 3);
    g.fillTriangle(22, -3, 4, -8, 0, 3);
    g.fillTriangle(-6, -24, -10, 1, 4, 2);
    g.fillTriangle(8, 13, -6, -1, 8, -4);
    g.fillStyle(0xffe4a5, 0.85).fillEllipse(0, -3, 13, 8);
    g.setScale(reduced ? 1 : 0.6);
    this.animate({
      targets: g,
      scale: 1,
      alpha: 0,
      duration: reduced ? 100 : 240,
      onComplete: () => this.remove(g),
    });
  }

  breath(from: Point, to: Point, reduced: boolean) {
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    const g = this.graphic().setPosition(from.x, from.y).setData('dragonBreath', true);
    g.setRotation(Math.atan2(to.y - from.y, to.x - from.x));
    for (const [color, alpha, width, reach] of [
      [0xf75a24, 0.4, 14, 1],
      [0xff9d29, 0.95, 9, 0.97],
      [0xffedbe, 0.95, 4, 0.82],
    ]) {
      const plume = [{ x: 0, y: -1 }];
      for (let i = 1; i <= 9; i++) {
        const t = i / 10;
        plume.push({
          x: length * reach * t,
          y: -width * (0.15 + t * 0.85) * (0.8 + 0.2 * Math.sin(i * 2.7)),
        });
      }
      plume.push({ x: length * reach + width * 0.5, y: 0 });
      for (let i = 9; i >= 1; i--) {
        const t = i / 10;
        plume.push({
          x: length * reach * t,
          y: width * (0.15 + t * 0.85) * (0.8 + 0.2 * Math.cos(i * 2.3)),
        });
      }
      g.fillStyle(color, alpha).fillPoints(
        plume.map((p) => new Phaser.Math.Vector2(p.x, p.y)),
        true,
      );
    }
    g.fillStyle(0xffc657, 0.75)
      .fillCircle(length, -4, 5)
      .fillCircle(length + 3, 4, 4);
    this.animate({
      targets: g,
      alpha: 0,
      duration: reduced ? 100 : 280,
      onComplete: () => this.remove(g),
    });
  }

  impact(weapon: Weapon | 'melee', at: Point, reduced: boolean) {
    const color = weapon === 'melee' ? 0xffe5b7 : COLORS[weapon];
    const explosive =
      weapon === 'bomb' || weapon === 'rocket' || weapon === 'fireball' || weapon === 'arcane';
    const g = this.graphic().setPosition(at.x, at.y).setData('impact', weapon);
    if (weapon === 'healing') {
      g.fillStyle(color, 0.18).fillCircle(0, 0, 13);
      g.lineStyle(1.5, color, 0.8).strokeEllipse(0, 3, 24, 12);
      g.fillStyle(0xffffdd, 0.95).fillRoundedRect(-2, -8, 4, 14, 1);
      g.fillRoundedRect(-7, -3, 14, 4, 1);
    } else if (explosive) {
      g.fillStyle(color, 0.3).fillCircle(0, 0, 13);
      g.lineStyle(2, color, 0.9).strokeCircle(0, 0, 9);
      g.fillStyle(0xfff1c4).fillCircle(0, 0, 4);
    } else {
      g.lineStyle(2, color, 0.9);
      g.lineBetween(-7, -5, 7, 5);
      g.lineBetween(-4, 7, 4, -7);
    }
    this.animate({
      targets: g,
      alpha: 0,
      scale: reduced ? 1 : explosive ? 1.8 : 1.3,
      duration: reduced ? 100 : 180,
      onComplete: () => this.remove(g),
    });
  }
}
