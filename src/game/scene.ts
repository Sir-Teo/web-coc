import Phaser from 'phaser';
import { BUILDINGS, TROOPS, TROOP_KEYS, asset, type BuildingKind } from './data';
import { GameModel, type Building, type FX } from './model';
import { AudioManager } from './audio';
export const WORLD = { width: 1792, height: 1195, ox: 896, oy: 112, tw: 64, th: 32 };
export const iso = (x: number, y: number) =>
  new Phaser.Math.Vector2(WORLD.ox + (x - y) * 32, WORLD.oy + (x + y) * 16);
export const uniso = (x: number, y: number) => ({
  x: ((x - WORLD.ox) / 32 + (y - WORLD.oy) / 16) / 2,
  y: ((y - WORLD.oy) / 16 - (x - WORLD.ox) / 32) / 2,
});
export class VillageScene extends Phaser.Scene {
  model: GameModel;
  audio: AudioManager;
  sprites = new Map<number, Phaser.GameObjects.Image>();
  unitSprites = new Map<number, Phaser.GameObjects.Image>();
  bubbles = new Map<number, Phaser.GameObjects.Container>();
  private ground!: Phaser.GameObjects.Graphics;
  private overlay!: Phaser.GameObjects.Graphics;
  private detail!: Phaser.GameObjects.Graphics;
  private ghost?: Phaser.GameObjects.Image;
  private mode = '';
  private lastRevision = -1;
  private down?: { x: number; y: number; cx: number; cy: number };
  private dragged = false;
  private pinchDistance = 0;
  private tick = 0;
  private renderClock = 0;
  private focusKeys!: Record<string, Phaser.Input.Keyboard.Key>;
  private paused = false;
  uiBlocked = false;
  ready = false;
  onReady = () => {};
  onSelect = () => {};
  baseZoom = 1;
  private wallSignature = '';
  private wallViews: Phaser.GameObjects.Graphics[] = [];
  private ambientUnits: Phaser.GameObjects.Image[] = [];
  constructor(model: GameModel, audio: AudioManager) {
    super('village');
    this.model = model;
    this.audio = audio;
  }
  preload() {
    this.load.image('terrain', '/assets/environment/terrain.webp');
    for (const k of Object.keys(BUILDINGS)) {
      this.load.image(k, asset(k));
      if (k !== 'wall') this.load.image(`${k}-tier3`, asset(k, 3));
    }
    for (const k of TROOP_KEYS)
      this.load.spritesheet(`${k}-walk`, `/assets/characters/walk/${k}.webp`, {
        frameWidth: 128,
        frameHeight: 128,
      });
    for (const k of [...TROOP_KEYS, 'trees', 'rocks', 'flag']) this.load.image(k, asset(k));
    this.load.on('progress', (p: number) => {
      const bar = document.querySelector<HTMLElement>('#load-progress');
      if (bar) bar.style.width = `${Math.round(p * 100)}%`;
    });
    this.load.on('loaderror', () => {
      const label = document.querySelector('#load-label');
      if (label) label.textContent = 'An asset could not load. Please refresh to retry.';
    });
  }
  create() {
    this.add
      .image(WORLD.width / 2, WORLD.height / 2, 'terrain')
      .setDisplaySize(WORLD.width, WORLD.height)
      .setDepth(-1000);
    this.ground = this.add.graphics().setDepth(-900);
    this.detail = this.add.graphics().setDepth(5000);
    this.overlay = this.add.graphics().setDepth(6000);
    this.drawPaths();
    this.decorate();
    this.cameras.main.setBackgroundColor('#50683d');
    this.resetCamera();
    this.scale.on('resize', () => this.resetCamera());
    this.input.addPointer(2);
    this.focusKeys = this.input.keyboard!.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT') as Record<
      string,
      Phaser.Input.Keyboard.Key
    >;
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.uiBlocked) return;
      this.audio.unlock();
      this.down = { x: p.x, y: p.y, cx: this.cameras.main.scrollX, cy: this.cameras.main.scrollY };
      this.dragged = false;
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.uiBlocked) return;
      const pointers = this.input.manager.pointers.filter((v) => v.isDown);
      if (pointers.length >= 2) {
        const dist = Phaser.Math.Distance.Between(
          pointers[0].x,
          pointers[0].y,
          pointers[1].x,
          pointers[1].y,
        );
        if (this.pinchDistance) this.setZoom((this.cameras.main.zoom * dist) / this.pinchDistance);
        this.pinchDistance = dist;
        this.dragged = true;
        return;
      }
      this.pinchDistance = 0;
      if (p.isDown && this.down) {
        const dx = p.x - this.down.x,
          dy = p.y - this.down.y;
        if (Math.hypot(dx, dy) > 7) {
          this.dragged = true;
          this.cameras.main.scrollX = this.down.cx - dx / this.cameras.main.zoom;
          this.cameras.main.scrollY = this.down.cy - dy / this.cameras.main.zoom;
          this.clampCamera();
        }
      }
      this.updateGhost(p);
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      this.pinchDistance = 0;
      if (this.uiBlocked || !this.down) return;
      this.down = undefined;
      if (this.dragged) return;
      const world = this.cameras.main.getWorldPoint(p.x, p.y),
        grid = uniso(world.x, world.y);
      if (this.model.placement) {
        if (this.model.place(Math.floor(grid.x), Math.floor(grid.y))) this.audio.play('build');
        return;
      }
      if (this.model.battle) {
        if (this.model.deploy(grid.x, grid.y)) this.audio.play('deploy');
        return;
      }
      const hit = this.pickBuilding(world.x, world.y, grid);
      this.model.selected = hit?.id ?? null;
      this.model.changed();
      this.onSelect();
      if (hit) this.audio.play('click');
    });
    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => {
      if (!this.uiBlocked) this.setZoom(this.cameras.main.zoom * (dy > 0 ? 0.92 : 1.08));
    });
    this.input.keyboard!.on('keydown-ESC', () => this.model.cancel());
    this.model.onEffect = (fx) => this.effect(fx);
    this.sync();
    for (let i = 0; i < 8; i++) {
      const k = TROOP_KEYS[i % 4];
      const im = this.add
        .image(0, 0, `${k}-walk`, 0)
        .setOrigin(0.5, 0.953)
        .setDisplaySize(i % 4 === 2 ? 32 : 25, i % 4 === 2 ? 32 : 25);
      this.ambientUnits.push(im);
    }
    this.ready = true;
    this.onReady();
    document.querySelector('#loading')?.classList.add('loaded');
    setTimeout(() => document.querySelector('#loading')?.remove(), 500);
    this.game.canvas.addEventListener('webglcontextlost', () => {
      this.paused = true;
      this.model.notify('Graphics paused. Restoring your village…');
    });
    this.game.canvas.addEventListener('webglcontextrestored', () => {
      this.paused = false;
    });
  }
  drawPaths() {
    const g = this.ground;
    g.clear();
    const path = (x: number, y: number, w: number, h: number) => {
      const pts = [iso(x, y), iso(x + w, y), iso(x + w, y + h), iso(x, y + h)];
      g.fillStyle(0xcdb780, 0.26);
      g.fillPoints(pts, true);
      g.lineStyle(1, 0xe5c798, 0.18);
      g.strokePoints(pts, true);
    };
    path(9, 5, 1, 16);
    path(5, 9, 16, 1);
    path(5, 18, 16, 1);
    path(18, 6, 1, 15);
    path(11, 19, 3, 3);
    for (let i = 0; i < 60; i++) {
      const x = 5 + ((i * 7.31) % 17),
        y = 5 + ((i * 11.13) % 17),
        p = iso(x, y);
      g.fillStyle(i % 3 === 0 ? 0xe8daa6 : 0x607e3f, 0.25);
      g.fillEllipse(p.x, p.y, 3 + (i % 4), 2);
    }
  }
  decorate() {
    const dec: [string, number, number, number][] = [
      ['trees', 3, 3, 135],
      ['trees', 1, 13, 150],
      ['trees', 23, 4, 120],
      ['trees', 25, 24, 155],
      ['trees', 3, 25, 140],
      ['rocks', 2, 18, 82],
      ['rocks', 23, 2, 94],
      ['rocks', 24, 20, 68],
      ['flag', 9, 24, 34],
      ['flag', 14, 24, 34],
    ];
    for (const [k, x, y, w] of dec) {
      const p = iso(x, y),
        im = this.add.image(p.x, p.y, k).setOrigin(0.5, 0.88);
      im.setDisplaySize(w, (w * im.height) / im.width).setDepth(p.y);
    }
  }
  resetCamera() {
    if (!this.cameras) return;
    const { width, height } = this.scale;
    this.baseZoom = Math.max(width / WORLD.width, height / WORLD.height) * 1.04;
    if (width < 700) this.baseZoom = Math.max(width / 1250, height / 1400);
    this.cameras.main.setZoom(this.baseZoom);
    this.cameras.main.centerOn(896, 570);
    this.clampCamera();
  }
  setZoom(value: number) {
    this.cameras.main.setZoom(Phaser.Math.Clamp(value, this.baseZoom * 0.78, this.baseZoom * 2));
    this.clampCamera();
  }
  zoomBy(delta: number) {
    this.setZoom(this.cameras.main.zoom * delta);
  }
  clampCamera() {
    const c = this.cameras.main,
      vw = c.width / c.zoom,
      vh = c.height / c.zoom;
    const centerX = Phaser.Math.Clamp(
        c.scrollX + c.width / 2,
        Math.min(vw / 2, 896),
        Math.max(WORLD.width - vw / 2, 896),
      ),
      centerY = Phaser.Math.Clamp(
        c.scrollY + c.height / 2,
        Math.min(vh / 2, 597),
        Math.max(WORLD.height - vh / 2, 597),
      );
    c.centerOn(centerX, centerY);
  }
  pickBuilding(wx: number, wy: number, grid: { x: number; y: number }) {
    const sorted = [...this.model.buildings]
      .filter((b) => b.kind !== 'wall')
      .sort((a, b) => b.x + b.y - (a.x + a.y));
    for (const b of sorted) {
      const im = this.sprites.get(b.id);
      if (
        im &&
        wx > im.x - im.displayWidth * 0.42 &&
        wx < im.x + im.displayWidth * 0.42 &&
        wy > im.y - im.displayHeight * 0.83 &&
        wy < im.y + im.displayHeight * 0.06
      )
        return b;
    }
    return this.model.buildings.find(
      (b) =>
        grid.x >= b.x &&
        grid.y >= b.y &&
        grid.x < b.x + BUILDINGS[b.kind].size &&
        grid.y < b.y + BUILDINGS[b.kind].size,
    );
  }
  sync() {
    const mode = this.model.battle ? 'battle' : 'home';
    if (mode !== this.mode) {
      for (const s of this.sprites.values()) s.destroy();
      for (const s of this.unitSprites.values()) s.destroy();
      for (const s of this.bubbles.values()) s.destroy();
      this.sprites.clear();
      this.unitSprites.clear();
      this.bubbles.clear();
      this.mode = mode;
      this.resetCamera();
    }
    const ids = new Set(this.model.buildings.map((b) => b.id));
    for (const [id, s] of this.sprites) {
      if (!ids.has(id)) {
        s.destroy();
        this.sprites.delete(id);
      }
    }
    for (const b of this.model.buildings) {
      const d = BUILDINGS[b.kind],
        p = iso(b.x + d.size / 2, b.y + d.size / 2);
      let im = this.sprites.get(b.id);
      if (!im) {
        im = this.add.image(p.x, p.y, b.kind).setOrigin(0.5, 0.88);
        this.sprites.set(b.id, im);
      }
      const texture = b.level >= 3 && b.kind !== 'wall' ? `${b.kind}-tier3` : b.kind;
      if (im.texture.key !== texture) im.setTexture(texture);
      const levelScale = b.kind === 'wall' ? 1 : 1 + (b.level - 1) * 0.045;
      im.setPosition(p.x, p.y)
        .setDisplaySize(
          d.width * levelScale,
          b.kind === 'wall' ? 39 : (d.width * levelScale * im.height) / im.width,
        )
        .setDepth(p.y);
      im.setAlpha(b.constructing ? 0.58 : 1);
      if (b.level === 3) im.setTint(0xffecc7);
      else im.clearTint();
      if (b.hp <= 0) {
        im.setTint(0x514940)
          .setAlpha(0.5)
          .setDisplaySize(d.width * 0.82, d.width * 0.2)
          .setDepth(p.y - 1);
      }
      const shouldBubble =
        !this.model.battle &&
        (b.kind === 'goldmine' || b.kind === 'collector') &&
        b.stored >= 100 &&
        !b.upgradeEnd;
      if (shouldBubble && !this.bubbles.has(b.id)) {
        const c = this.add.container(p.x, p.y - im.displayHeight * 0.86 - 13).setDepth(p.y + 300);
        const bg = this.add.graphics();
        bg.fillStyle(0xfff6d7, 1);
        bg.lineStyle(2, 0x846743, 1);
        bg.fillRoundedRect(-17, -15, 34, 28, 8);
        bg.strokeRoundedRect(-17, -15, 34, 28, 8);
        bg.fillTriangle(-5, 12, 5, 12, 0, 19);
        const icon = this.add
          .text(0, -2, b.kind === 'goldmine' ? '●' : '♦', {
            fontFamily: 'Arial',
            fontSize: '24px',
            color: b.kind === 'goldmine' ? '#efaa10' : '#c449e2',
            stroke: b.kind === 'goldmine' ? '#b87516' : '#823b9c',
            strokeThickness: 1,
          })
          .setOrigin(0.5);
        c.add([bg, icon]);
        c.setSize(38, 40).setInteractive();
        c.on('pointerup', () => {
          if (this.dragged || this.uiBlocked || this.model.placement) return;
          this.model.collect(b.id);
          this.audio.play('collect');
        });
        this.bubbles.set(b.id, c);
        if (!this.model.state.settings.reducedMotion)
          this.tweens.add({
            targets: c,
            y: c.y - 5,
            duration: 1100,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
          });
      }
      if (!shouldBubble && this.bubbles.has(b.id)) {
        this.bubbles.get(b.id)!.destroy();
        this.bubbles.delete(b.id);
      }
    }
    if (this.model.placement) {
      if (this.ghost?.texture.key !== this.model.placement) {
        this.ghost?.destroy();
        this.ghost = this.add
          .image(0, 0, this.model.placement)
          .setOrigin(0.5, 0.88)
          .setAlpha(0.72)
          .setDepth(6001);
        const d = BUILDINGS[this.model.placement];
        this.ghost.setDisplaySize(d.width, (d.width * this.ghost.height) / this.ghost.width);
      }
      this.updateGhost(this.input.activePointer);
    } else {
      this.ghost?.destroy();
      this.ghost = undefined;
    }
    this.syncWalls();
    this.lastRevision = this.model.revision;
  }
  syncWalls() {
    const walls = this.model.buildings.filter((b) => b.kind === 'wall' && b.hp > 0);
    const signature = this.mode + walls.map((b) => `${b.id},${b.x},${b.y}`).join(';');
    if (signature === this.wallSignature) return;
    this.wallSignature = signature;
    for (const g of this.wallViews) g.destroy();
    this.wallViews = [];
    for (const b of walls) {
      for (const [dx, dy] of [
        [1, 0],
        [0, 1],
      ]) {
        if (!walls.some((w) => w.x === b.x + dx && w.y === b.y + dy)) continue;
        const p = iso(b.x + 0.5, b.y + 0.5),
          q = iso(b.x + dx + 0.5, b.y + dy + 0.5);
        const g = this.add.graphics().setDepth((p.y + q.y) / 2 - 0.5);
        const pts = [
          new Phaser.Math.Vector2(p.x, p.y - 3),
          new Phaser.Math.Vector2(q.x, q.y - 3),
          new Phaser.Math.Vector2(q.x, q.y - 24),
          new Phaser.Math.Vector2(p.x, p.y - 24),
        ];
        g.fillStyle(dx ? 0x9e9885 : 0x797967);
        g.fillPoints(pts, true);
        g.lineStyle(1, 0x5c5e51, 0.7);
        g.strokePoints(pts, true);
        g.lineStyle(2, 0xd3c5a0, 0.9);
        g.lineBetween(p.x, p.y - 24, q.x, q.y - 24);
        g.lineStyle(1, 0x605f50, 0.6);
        g.lineBetween(p.x, p.y - 12, q.x, q.y - 12);
        const mx = (p.x + q.x) / 2,
          my = (p.y + q.y) / 2;
        g.lineBetween(mx, my - 3, mx, my - 13);
        this.wallViews.push(g);
      }
    }
  }
  updateGhost(p: Phaser.Input.Pointer) {
    if (!this.ghost || !this.model.placement) return;
    const point = this.cameras.main.getWorldPoint(p.x, p.y),
      grid = uniso(point.x, point.y),
      x = Math.floor(grid.x),
      y = Math.floor(grid.y),
      s = BUILDINGS[this.model.placement].size,
      screen = iso(x + s / 2, y + s / 2);
    this.ghost.setPosition(screen.x, screen.y);
    this.ghost.setTint(
      this.model.canPlace(this.model.placement, x, y, this.model.moving ?? undefined)
        ? 0xd9ffb0
        : 0xff7272,
    );
  }
  drawOverlay(time: number) {
    const g = this.overlay;
    g.clear();
    const b = this.model.buildings.find((b) => b.id === this.model.selected);
    const diamond = (x: number, y: number, s: number, color: number, alpha = 0.14) => {
      const pts = [iso(x, y), iso(x + s, y), iso(x + s, y + s), iso(x, y + s)];
      g.fillStyle(color, alpha);
      g.fillPoints(pts, true);
      g.lineStyle(2, color, 0.85);
      g.strokePoints(pts, true);
    };
    if (b && !this.model.battle) {
      const d = BUILDINGS[b.kind];
      diamond(b.x, b.y, d.size, 0xffe8a0);
      if (d.range) {
        const p = iso(b.x + d.size / 2, b.y + d.size / 2);
        g.lineStyle(1, 0xffffff, 0.35);
        g.strokeEllipse(p.x, p.y, d.range * 64, d.range * 32);
      }
    }
    if (this.model.placement) {
      for (let x = 2; x <= 26; x++) {
        g.lineStyle(1, 0xffffff, 0.15);
        const p = iso(x, 2),
          q = iso(x, 26);
        g.lineBetween(p.x, p.y, q.x, q.y);
        const r = iso(2, x),
          s = iso(26, x);
        g.lineBetween(r.x, r.y, s.x, s.y);
      }
      const point = this.cameras.main.getWorldPoint(
          this.input.activePointer.x,
          this.input.activePointer.y,
        ),
        grid = uniso(point.x, point.y),
        x = Math.floor(grid.x),
        y = Math.floor(grid.y);
      diamond(
        x,
        y,
        BUILDINGS[this.model.placement].size,
        this.model.canPlace(this.model.placement, x, y, this.model.moving ?? undefined)
          ? 0x8fff73
          : 0xff6464,
        0.28,
      );
    }
    if (this.model.battle && !this.model.battle.started) {
      for (const v of this.model.buildings.filter((v) => v.kind !== 'wall')) {
        const s = BUILDINGS[v.kind].size;
        const pts = [
          iso(v.x - 1.5, v.y - 1.5),
          iso(v.x + s + 1.5, v.y - 1.5),
          iso(v.x + s + 1.5, v.y + s + 1.5),
          iso(v.x - 1.5, v.y + s + 1.5),
        ];
        g.lineStyle(1.5, 0xff665c, 0.4);
        g.strokePoints(pts, true);
      }
    }
    this.detail.clear();
    for (const v of this.model.buildings) {
      if (v.hp <= 0) continue;
      const im = this.sprites.get(v.id)!;
      if (v.upgradeEnd) {
        const duration = v.constructing ? 15000 : (20 + v.level * 10) * 1000,
          progress = 1 - (v.upgradeEnd - this.model.clock) / duration;
        this.bar(im.x, im.y - im.displayHeight * 0.87, 54, progress, 0x82d745);
        const p = iso(v.x, v.y);
        this.detail.lineStyle(3, 0xe6b356, 0.7);
        this.detail.lineBetween(p.x - 12, p.y - 10, p.x - 12, p.y - 60);
        this.detail.lineBetween(p.x - 12, p.y - 50, p.x + 22, p.y - 65);
      } else if (this.model.battle && v.hp < v.maxHp)
        this.bar(im.x, im.y - im.displayHeight * 0.88, 42, v.hp / v.maxHp, 0xea654d);
    }
    const battle = this.model.battle;
    if (battle) {
      for (const u of battle.units) {
        let im = this.unitSprites.get(u.id);
        if (!im) {
          im = this.add.image(0, 0, `${u.kind}-walk`, 0).setOrigin(0.5, 0.953);
          const d = TROOPS[u.kind];
          im.setDisplaySize(d.width * 1.48, d.width * 1.48);
          this.unitSprites.set(u.id, im);
        }
        if (u.hp <= 0) {
          if (!im.getData('dying')) {
            im.setData('dying', true);
            im.setTint(0xa09482);
            this.tweens.add({
              targets: im,
              alpha: 0,
              angle: 70,
              duration: this.model.state.settings.reducedMotion ? 0 : 320,
              onComplete: () => im.setVisible(false),
            });
          }
          continue;
        }
        im.setFrame(
          u.attacking || this.model.state.settings.reducedMotion
            ? 0
            : Math.floor(time / 140 + u.id) % 4,
        );
        const p = iso(u.x, u.y),
          motion = this.model.state.settings.reducedMotion ? 0 : Math.sin(time / 80 + u.id) * 1.6;
        im.setPosition(p.x, p.y + motion).setDepth(p.y + 1);
        const target = battle.buildings.find((b) => b.id === u.target);
        if (target) im.setFlipX(iso(target.x, target.y).x > p.x);
        const phase = 1 - Math.max(0, u.cooldown) / TROOPS[u.kind].rate;
        const impulse =
          u.attacking && phase < 0.28 && !this.model.state.settings.reducedMotion
            ? Math.sin((phase / 0.28) * Math.PI)
            : 0;
        const facing = target && iso(target.x, target.y).x > p.x ? 1 : -1;
        im.setX(p.x + facing * impulse * 4).setAngle(facing * impulse * 9);
        if (u.hp < u.maxHp) this.bar(p.x, p.y - im.displayHeight, 22, u.hp / u.maxHp, 0x8dea68);
      }
    }
  }
  bar(x: number, y: number, w: number, p: number, color: number) {
    this.detail.fillStyle(0x292920, 0.8);
    this.detail.fillRoundedRect(x - w / 2 - 2, y - 2, w + 4, 7, 3);
    this.detail.fillStyle(color);
    this.detail.fillRoundedRect(x - w / 2, y, Math.max(0, w * p), 3, 1);
  }
  effect(fx: FX) {
    if (!this.ready) return;
    const p = iso(fx.x, fx.y);
    if (fx.type === 'upgrade') {
      this.sparks(p.x, p.y - 55, 0xd4f480, 18);
      const ring = this.add
        .ellipse(p.x, p.y, 110, 55)
        .setStrokeStyle(3, 0xe9ffb1, 0.8)
        .setDepth(7000);
      this.tweens.add({
        targets: ring,
        scale: 1.8,
        alpha: 0,
        duration: 750,
        onComplete: () => ring.destroy(),
      });
      this.audio.play('build');
      return;
    }
    if (fx.type === 'collect') {
      const text = this.add
        .text(p.x, p.y - 70, fx.text!, {
          fontFamily: 'Trebuchet MS',
          fontStyle: 'bold',
          fontSize: '23px',
          color: fx.color === 0xffd34b ? '#ffdc5c' : '#f7adff',
          stroke: '#3b3524',
          strokeThickness: 4,
        })
        .setOrigin(0.5)
        .setDepth(9000);
      this.tweens.add({
        targets: text,
        y: p.y - 145,
        alpha: 0,
        duration: 1200,
        onComplete: () => text.destroy(),
      });
      return;
    }
    if (fx.type === 'projectile' && fx.toX !== undefined) {
      const q = iso(fx.toX, fx.toY!);
      const orb = this.add
        .circle(p.x, p.y - 22, fx.color === 0xff9c37 ? 5 : 3, fx.color ?? 0xffc65b)
        .setDepth(8000);
      this.tweens.add({
        targets: orb,
        x: q.x,
        y: q.y - 15,
        duration: 200,
        ease: 'Quad.easeIn',
        onComplete: () => {
          orb.destroy();
          this.sparks(q.x, q.y - 12, fx.color ?? 0xffdd89, 4);
        },
      });
      if (Math.random() < 0.2) this.audio.play('hit');
      return;
    }
    if (fx.type === 'destroy') {
      this.sparks(p.x, p.y - 15, 0xd9be8a, 16);
      this.audio.play('destroy');
      if (!this.model.state.settings.reducedMotion) this.cameras.main.shake(80, 0.001);
      const smoke = this.add.circle(p.x, p.y - 20, 18, 0xe4d3a8, 0.6).setDepth(8000);
      this.tweens.add({
        targets: smoke,
        scale: 2.4,
        y: p.y - 65,
        alpha: 0,
        duration: 650,
        onComplete: () => smoke.destroy(),
      });
      this.lastRevision = -1;
    } else this.sparks(p.x, p.y - 8, fx.type === 'spawn' ? 0xefffc5 : 0xffe1a0, 5);
  }
  sparks(x: number, y: number, color: number, count: number) {
    for (let i = 0; i < count; i++) {
      const dot = this.add.circle(x, y, 2 + Math.random() * 3, color, 0.9).setDepth(8100);
      this.tweens.add({
        targets: dot,
        x: x + (Math.random() - 0.5) * 75,
        y: y - 10 - Math.random() * 55,
        alpha: 0,
        duration: 300 + Math.random() * 400,
        onComplete: () => dot.destroy(),
      });
    }
  }
  update(time: number, delta: number) {
    if (this.paused) return;
    this.renderClock = time;
    const dt = Math.min(delta / 1000, 0.1);
    if (!this.uiBlocked) {
      let x = 0,
        y = 0;
      const k = this.focusKeys;
      if (k.A.isDown || k.LEFT.isDown) x--;
      if (k.D.isDown || k.RIGHT.isDown) x++;
      if (k.W.isDown || k.UP.isDown) y--;
      if (k.S.isDown || k.DOWN.isDown) y++;
      if (x || y) {
        this.cameras.main.scrollX += x * 500 * dt;
        this.cameras.main.scrollY += y * 500 * dt;
        this.clampCamera();
      }
    }
    this.tick += dt;
    while (this.tick >= 0.05) {
      this.model.step(0.05);
      this.tick -= 0.05;
    }
    if (this.lastRevision !== this.model.revision) this.sync();
    if (this.model.battle)
      for (const b of this.model.battle.buildings) {
        const im = this.sprites.get(b.id);
        if (im && b.hp <= 0 && im.alpha !== 0.5) {
          im.setTint(0x514940)
            .setAlpha(0.5)
            .setDisplaySize(BUILDINGS[b.kind].width * 0.82, BUILDINGS[b.kind].width * 0.2);
        }
      }
    for (let i = 0; i < this.ambientUnits.length; i++) {
      const im = this.ambientUnits[i];
      im.setVisible(!this.model.battle && this.model.armySize > i);
      if (this.model.battle) continue;
      const camp = this.model.state.buildings.filter((b) => b.kind === 'camp')[i % 2];
      if (!camp) continue;
      const t = this.model.state.settings.reducedMotion ? i : time / 3500 + i * 1.8;
      const x = camp.x + 1.5 + Math.cos(t) * 2.1,
        y = camp.y + 1.5 + Math.sin(t) * 2.1,
        p = iso(x, y);
      im.setPosition(p.x, p.y)
        .setDepth(p.y + 1)
        .setFrame(this.model.state.settings.reducedMotion ? 0 : Math.floor(time / 160 + i) % 4)
        .setFlipX(Math.cos(t) < 0);
    }
    this.drawOverlay(time);
  }
  screenFor(x: number, y: number) {
    const p = iso(x, y),
      c = this.cameras.main;
    return {
      x: (p.x - (c.scrollX + c.width / 2)) * c.zoom + c.width / 2,
      y: (p.y - (c.scrollY + c.height / 2)) * c.zoom + c.height / 2,
    };
  }
}
