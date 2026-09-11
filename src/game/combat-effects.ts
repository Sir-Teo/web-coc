import Phaser from 'phaser';
import type { FX } from './model';

type Point = { x: number; y: number };
type Weapon = NonNullable<FX['weapon']>;
const COLORS: Record<Weapon, number> = {
  arrow: 0xffe3a3,
  cannonball: 0xffc16a,
  rocket: 0xffa94a,
  fireball: 0xff8c32,
  bomb: 0xffb54f,
  arcane: 0xcf8dff,
};

/** Short-lived weapon graphics. They never apply damage or mutate the battle. */
export class CombatEffects {
  private objects = new Set<Phaser.GameObjects.Graphics>();
  constructor(private scene: Phaser.Scene) {}

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
  }

  projectile(weapon: Weapon, from: Point, to: Point, reduced: boolean) {
    if (reduced) {
      this.impact(weapon, to, true);
      return;
    }
    const g = this.graphic().setPosition(from.x, from.y).setData('weapon', weapon);
    const color = COLORS[weapon];
    if (weapon === 'arrow') {
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
      const radius = weapon === 'bomb' ? 6 : 4;
      g.fillStyle(0x272a2d).fillCircle(0, 0, radius);
      g.lineStyle(1, 0x141619).strokeCircle(0, 0, radius);
      g.fillStyle(0x90918b).fillCircle(-2, -2, 1.5);
      if (weapon === 'bomb') {
        g.lineStyle(2, 0xcda867).lineBetween(0, -6, 3, -9);
        g.fillStyle(0xffd56b).fillCircle(3, -9, 2);
      }
    }
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
    if (weapon === 'cannonball' || weapon === 'rocket') {
      const flash = this.graphic().setPosition(from.x, from.y);
      flash.fillStyle(0xffd28b, 0.9).fillCircle(0, 0, 8);
      flash.fillStyle(0xfff4d2).fillCircle(0, 0, 3);
      this.scene.tweens.add({
        targets: flash,
        alpha: 0,
        scale: 1.6,
        duration: 100,
        onComplete: () => this.remove(flash),
      });
    }
  }

  impact(weapon: Weapon | 'melee', at: Point, reduced: boolean) {
    const color = weapon === 'melee' ? 0xffe5b7 : COLORS[weapon];
    const explosive =
      weapon === 'bomb' || weapon === 'rocket' || weapon === 'fireball' || weapon === 'arcane';
    const g = this.graphic().setPosition(at.x, at.y).setData('impact', weapon);
    if (explosive) {
      g.fillStyle(color, 0.3).fillCircle(0, 0, 13);
      g.lineStyle(2, color, 0.9).strokeCircle(0, 0, 9);
      g.fillStyle(0xfff1c4).fillCircle(0, 0, 4);
    } else {
      g.lineStyle(2, color, 0.9);
      g.lineBetween(-7, -5, 7, 5);
      g.lineBetween(-4, 7, 4, -7);
    }
    this.scene.tweens.add({
      targets: g,
      alpha: 0,
      scale: reduced ? 1 : explosive ? 1.8 : 1.3,
      duration: reduced ? 100 : 180,
      onComplete: () => this.remove(g),
    });
  }
}
