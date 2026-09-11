import Phaser from 'phaser';
import {
  BUILDINGS,
  isTrap,
  SPELLS,
  SPELL_KEYS,
  TROOPS,
  TROOP_KEYS,
  TIER3_LEVEL,
  asset,
  walkAsset,
  type BuildingKind,
} from './data';
import { GameModel, type Building, type FX } from './model';
import { AudioManager } from './audio';
import { ResourceFlights } from '../ui/resource-flight';
import { CombatEffects } from './combat-effects';
import { projectileEffect } from './projectiles';
/** Screen height a flying troop floats above its ground position. */
const AIR_LIFT = 46;
const WOOD_RUINS = new Set<BuildingKind>(['barracks', 'builder', 'camp', 'archertower', 'cannon']);
const SPELL_COLOR: Record<string, number> = {
  rage: 0xff6a3d,
  heal: 0x8de35c,
  lightning: 0x6fd4ff,
};
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
  private ruinGround!: Phaser.GameObjects.Graphics;
  /** Ground-level markings that buildings must sit on top of. */
  private groundMarks!: Phaser.GameObjects.Graphics;
  private overlay!: Phaser.GameObjects.Graphics;
  private detail!: Phaser.GameObjects.Graphics;
  private ghost?: Phaser.GameObjects.Image;
  private mode = '';
  private renderedBattle: GameModel['battle'] = null;
  private lastRevision = -1;
  private down?: { x: number; y: number; cx: number; cy: number; t: number; id: number | null };
  private dragged = false;
  /** Which role the current pointer gesture has committed to. */
  private gesture: 'none' | 'pan' | 'deploy' | 'drag-building' = 'none';
  private lastDeploy = { x: -99, y: -99 };
  private lastTap = { x: -99, y: -99, t: 0 };
  private boundary: { signature: string; edges: number[][] } = { signature: '', edges: [] };
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
  private resourceFlights = new ResourceFlights();
  private combatEffects!: CombatEffects;
  private reducedCombatMotion = false;
  constructor(model: GameModel, audio: AudioManager) {
    super('village');
    this.model = model;
    this.audio = audio;
  }
  preload() {
    this.load.image('king', asset('king'));
    this.load.image('terrain', '/assets/environment/terrain.webp');
    for (const material of ['stone', 'wood'])
      this.load.image(`ruins-${material}`, `/assets/environment/ruins-${material}.webp`);
    for (const k of Object.keys(BUILDINGS)) {
      this.load.image(k, asset(k));
      if (k !== 'wall' && !BUILDINGS[k as keyof typeof BUILDINGS].singleArtwork)
        this.load.image(`${k}-tier3`, asset(k, TIER3_LEVEL));
    }
    for (const k of SPELL_KEYS) this.load.image(k, asset(k));
    for (const k of TROOP_KEYS.filter((kind) => !TROOPS[kind].staticSprite))
      this.load.spritesheet(`${k}-walk`, walkAsset(k), {
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
    this.ruinGround = this.add.graphics().setDepth(-875);
    this.groundMarks = this.add.graphics().setDepth(-850);
    this.detail = this.add.graphics().setDepth(5000);
    this.overlay = this.add.graphics().setDepth(6000);
    this.combatEffects = new CombatEffects(this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.combatEffects.clear());
    this.drawPaths();
    this.decorate();
    this.cameras.main.setBackgroundColor('#50683d');
    this.resetCamera();
    this.scale.on('resize', () => {
      this.resourceFlights.clear();
      this.resetCamera();
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.resourceFlights.clear());
    this.input.addPointer(2);
    this.focusKeys = this.input.keyboard!.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT') as Record<
      string,
      Phaser.Input.Keyboard.Key
    >;
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.uiBlocked) return;
      this.audio.unlock();
      const world = this.cameras.main.getWorldPoint(p.x, p.y),
        grid = uniso(world.x, world.y);
      const held =
        this.model.editing && !this.model.placement
          ? this.pickBuilding(world.x, world.y, grid)
          : undefined;
      this.down = {
        x: p.x,
        y: p.y,
        cx: this.cameras.main.scrollX,
        cy: this.cameras.main.scrollY,
        t: performance.now(),
        id: held?.id ?? null,
      };
      this.dragged = false;
      this.gesture = 'none';
      this.lastDeploy = { x: -99, y: -99 };
      if (held) {
        this.model.beginDrag();
        this.model.selected = held.id;
        this.model.changed();
      }
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
        this.gesture = 'pan';
        return;
      }
      this.pinchDistance = 0;
      this.ghostPoint = undefined;
      if (p.isDown && this.down) {
        const dx = p.x - this.down.x,
          dy = p.y - this.down.y,
          travel = Math.hypot(dx, dy);
        if (this.gesture === 'none' && travel > 7) this.gesture = this.classifyDrag(p);
        if (this.gesture !== 'none') this.dragged = true;
        if (this.gesture === 'pan') {
          this.cameras.main.scrollX = this.down.cx - dx / this.cameras.main.zoom;
          this.cameras.main.scrollY = this.down.cy - dy / this.cameras.main.zoom;
          this.clampCamera();
        } else if (this.gesture === 'deploy') this.dragDeploy(p);
        else if (this.gesture === 'drag-building') this.dragBuilding(p);
      }
      this.updateGhost(p);
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      this.pinchDistance = 0;
      const gesture = this.gesture;
      this.gesture = 'none';
      if (this.uiBlocked || !this.down) return;
      this.down = undefined;
      if (this.dragged || gesture !== 'none') return;
      this.tap(p);
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
  /** Decides once per gesture whether a drag pans, deploys, or moves a building. */
  private classifyDrag(p: Phaser.Input.Pointer): 'pan' | 'deploy' | 'drag-building' {
    if (this.model.editing && this.down?.id != null) return 'drag-building';
    const b = this.model.battle;
    if (b && !b.finished && !this.model.placement && !this.model.activeSpell) {
      // A deliberate press then drag paints troops; a quick flick still pans.
      const deliberate = performance.now() - (this.down?.t ?? 0) >= 160;
      const grid = this.gridAtPointer(p);
      if (
        deliberate &&
        b.remaining[this.model.activeTroop] > 0 &&
        !this.model.deployBlocked(grid.x, grid.y)
      )
        return 'deploy';
    }
    return 'pan';
  }
  private dragDeploy(p: Phaser.Input.Pointer) {
    const grid = this.gridAtPointer(p);
    if (Math.hypot(grid.x - this.lastDeploy.x, grid.y - this.lastDeploy.y) < 0.75) return;
    if (this.model.deployBlocked(grid.x, grid.y)) return;
    if (this.model.deploy(grid.x, grid.y)) {
      this.lastDeploy = { x: grid.x, y: grid.y };
      this.audio.play('deploy');
    }
  }
  private dragBuilding(p: Phaser.Input.Pointer) {
    const id = this.down?.id;
    if (id == null) return;
    const b = this.model.state.buildings.find((v) => v.id === id);
    if (!b) return;
    const grid = this.gridAtPointer(p),
      size = BUILDINGS[b.kind].size;
    this.model.dragTo(id, Math.round(grid.x - size / 2), Math.round(grid.y - size / 2));
  }
  private tap(p: Phaser.Input.Pointer) {
    const world = this.cameras.main.getWorldPoint(p.x, p.y),
      grid = uniso(world.x, world.y);
    if (this.model.placement) {
      if (this.model.place(Math.floor(grid.x), Math.floor(grid.y))) this.audio.play('build');
      return;
    }
    if (this.model.battle) {
      if (this.model.activeSpell) {
        if (this.model.castSpell(grid.x, grid.y)) this.audio.play('deploy');
        return;
      }
      const hit = this.pickBuilding(world.x, world.y, grid);
      if (
        hit &&
        hit.hp > 0 &&
        BUILDINGS[hit.kind].damage &&
        this.model.deployBlocked(grid.x, grid.y)
      ) {
        const d = BUILDINGS[hit.kind];
        this.model.selected = hit.id;
        this.model.changed();
        this.model.notify(
          `${d.name} · Level ${hit.level} · Range ${d.minRange ? `${d.minRange}–` : ''}${d.range} tiles${d.minRange ? ' · Orange ring = blind spot' : ''}`,
        );
        return;
      }
      // A second tap on the same spot commits a full squad, the way rapid taps do in Clash.
      const now = performance.now();
      const repeat =
        now - this.lastTap.t < 380 &&
        Math.hypot(grid.x - this.lastTap.x, grid.y - this.lastTap.y) < 1.4;
      const placed = repeat
        ? this.model.deployMany(grid.x, grid.y, 4)
        : Number(this.model.deploy(grid.x, grid.y));
      if (placed) {
        this.model.selected = null;
        this.lastTap = { x: grid.x, y: grid.y, t: now };
        this.audio.play('deploy');
      }
      return;
    }
    const hit = this.pickBuilding(world.x, world.y, grid);
    this.model.selected = hit?.id ?? null;
    this.model.changed();
    this.onSelect();
    if (hit) this.audio.play('click');
  }
  gridAtPointer(p: { x: number; y: number }) {
    const world = this.cameras.main.getWorldPoint(p.x, p.y);
    return uniso(world.x, world.y);
  }
  /** Converts a DOM pointer position, so the shop drawer can drag onto the map. */
  canvasPoint(clientX: number, clientY: number) {
    const rect = this.game.canvas.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }
  gridAtScreen(clientX: number, clientY: number) {
    return this.gridAtPointer(this.canvasPoint(clientX, clientY));
  }
  /** Drives the placement ghost from a DOM drag that Phaser never sees. */
  trackGhost(clientX: number, clientY: number) {
    this.ghostPoint = this.canvasPoint(clientX, clientY);
    this.updateGhost(this.ghostPoint);
  }
  releaseGhost() {
    this.ghostPoint = undefined;
  }
  private ghostPoint?: { x: number; y: number };
  private pointerScreen(): { x: number; y: number } {
    return this.ghostPoint ?? this.input.activePointer;
  }
  /**
   * The outline of every tile a troop may not be dropped on. Cached against the
   * set of surviving structures, because it only changes when one falls.
   */
  private battleBoundary() {
    const b = this.model.battle;
    if (!b) return [];
    // Stage index included: two stages can share building ids and building counts.
    const signature =
      b.index +
      ':' +
      b.buildings
        .filter((v) => v.hp > 0 && v.kind !== 'wall' && !isTrap(v.kind))
        .map((v) => v.id)
        .join(',');
    if (signature === this.boundary.signature) return this.boundary.edges;
    const blocked = (x: number, y: number) =>
      x < 1 || y < 1 || x > 26 || y > 26 ? true : this.model.deployBlocked(x + 0.5, y + 0.5);
    const edges: number[][] = [];
    for (let x = 1; x <= 26; x++)
      for (let y = 1; y <= 26; y++) {
        if (!blocked(x, y)) continue;
        if (!blocked(x - 1, y)) edges.push([x, y, x, y + 1]);
        if (!blocked(x + 1, y)) edges.push([x + 1, y, x + 1, y + 1]);
        if (!blocked(x, y - 1)) edges.push([x, y, x + 1, y]);
        if (!blocked(x, y + 1)) edges.push([x, y + 1, x + 1, y + 1]);
      }
    this.boundary = { signature, edges };
    return edges;
  }
  pickBuilding(wx: number, wy: number, grid: { x: number; y: number }) {
    // A small ground trap must remain selectable beneath a neighbouring roof.
    const groundTrap = this.model.buildings.find(
      (b) =>
        isTrap(b.kind) &&
        this.model.visibleBuilding(b) &&
        grid.x >= b.x &&
        grid.y >= b.y &&
        grid.x < b.x + BUILDINGS[b.kind].size &&
        grid.y < b.y + BUILDINGS[b.kind].size,
    );
    if (groundTrap) return groundTrap;
    const sorted = [...this.model.buildings]
      .filter((b) => b.kind !== 'wall' && this.model.visibleBuilding(b))
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
        this.model.visibleBuilding(b) &&
        grid.x >= b.x &&
        grid.y >= b.y &&
        grid.x < b.x + BUILDINGS[b.kind].size &&
        grid.y < b.y + BUILDINGS[b.kind].size,
    );
  }
  sync() {
    const reduced = this.model.state.settings.reducedMotion;
    if (reduced && !this.reducedCombatMotion) this.combatEffects.clear();
    this.reducedCombatMotion = reduced;
    if (this.model.state.settings.reducedMotion) this.resourceFlights.clear();
    const mode = this.model.battle ? 'battle' : 'home';
    if (mode !== this.mode || this.renderedBattle !== this.model.battle) {
      this.combatEffects.clear();
      this.resourceFlights.clear();
      this.renderedBattle = this.model.battle;
      this.boundary.signature = '';
      for (const s of this.sprites.values()) s.destroy();
      for (const s of this.unitSprites.values()) s.destroy();
      for (const id of this.bubbles.keys()) this.removeBubble(id);
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
        this.removeBubble(id);
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
      const texture =
        b.level >= TIER3_LEVEL && b.kind !== 'wall' && !d.singleArtwork
          ? `${b.kind}-tier3`
          : b.kind;
      if (im.texture.key !== texture) im.setTexture(texture);
      const levelScale = b.kind === 'wall' ? 1 : 1 + Math.min(4, b.level - 1) * 0.035;
      im.setPosition(p.x, p.y)
        .setOrigin(0.5, 0.88)
        .setFlipX(false)
        .setDisplaySize(
          d.width * levelScale,
          b.kind === 'wall' ? 39 : (d.width * levelScale * im.height) / im.width,
        )
        .setDepth(p.y);
      im.setVisible(this.model.visibleBuilding(b));
      im.setData('intactHeight', im.displayHeight);
      const trap = this.model.battle?.traps[b.id];
      im.setAlpha(trap?.resolved ? 0.35 : b.constructing ? 0.58 : 1);
      if (b.level >= TIER3_LEVEL) im.setTint(0xffecc7);
      else im.clearTint();
      if (b.hp <= 0) {
        this.renderRuin(b, im);
      }
      const shouldBubble =
        !this.model.battle &&
        (b.kind === 'goldmine' || b.kind === 'collector' || b.kind === 'darkdrill') &&
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
            color: b.kind === 'goldmine' ? '#efaa10' : b.kind === 'darkdrill' ? '#514076' : '#c449e2',
            stroke: b.kind === 'goldmine' ? '#b87516' : b.kind === 'darkdrill' ? '#291d3e' : '#823b9c',
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
      }
      if (shouldBubble) {
        const c = this.bubbles.get(b.id)!;
        const y = p.y - im.displayHeight * 0.86 - 13;
        const reduced = this.model.state.settings.reducedMotion;
        const anchor = `${p.x},${y},${reduced}`;
        if (c.getData('anchor') !== anchor) {
          this.tweens.killTweensOf(c);
          c.setPosition(p.x, y).setDepth(p.y + 300).setData('anchor', anchor);
          if (!reduced)
            this.tweens.add({
              targets: c,
              y: y - 5,
              duration: 1100,
              yoyo: true,
              repeat: -1,
              ease: 'Sine.easeInOut',
            });
        }
      } else {
        this.removeBubble(b.id);
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
    this.drawRuinGround();
    this.lastRevision = this.model.revision;
  }
  private renderRuin(b: Building, im: Phaser.GameObjects.Image) {
    const width = BUILDINGS[b.kind].width * (b.kind === 'wall' ? 0.9 : 0.98);
    im.setTexture(WOOD_RUINS.has(b.kind) ? 'ruins-wood' : 'ruins-stone')
      .setOrigin(0.5, 0.58)
      .setFlipX(b.id % 2 === 0)
      .clearTint()
      .setAlpha(1)
      .setDisplaySize(width, width * im.height / im.width)
      .setDepth(im.y - 2);
  }
  private drawRuinGround() {
    this.ruinGround.clear();
    for (const b of this.model.buildings) {
      if (b.hp > 0 || isTrap(b.kind)) continue;
      const d = BUILDINGS[b.kind];
      const p = iso(b.x + d.size / 2, b.y + d.size / 2);
      const width = d.width * 1.12;
      this.ruinGround.fillStyle(0x40331e, 0.3);
      this.ruinGround.fillEllipse(p.x, p.y + 4, width, width * 0.46);
      this.ruinGround.fillStyle(0x302719, 0.24);
      this.ruinGround.fillEllipse(p.x, p.y, width * 0.76, width * 0.33);
    }
  }
  private removeBubble(id: number) {
    const bubble = this.bubbles.get(id);
    if (!bubble) return;
    this.tweens.killTweensOf(bubble);
    bubble.destroy();
    this.bubbles.delete(id);
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
  updateGhost(p: { x: number; y: number }) {
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
    this.drawProjectiles();
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
    if (b && b.hp > 0 && this.model.visibleBuilding(b)) {
      const d = BUILDINGS[b.kind];
      diamond(b.x, b.y, d.size, 0xffe8a0);
      if (d.range || d.trap) {
        const range = d.trap?.trigger ?? d.range!;
        const p = iso(b.x + d.size / 2, b.y + d.size / 2);
        g.lineStyle(1, 0xffffff, 0.35);
        g.strokeEllipse(p.x, p.y, range * 64 * Math.SQRT2, range * 32 * Math.SQRT2);
        if (d.minRange) {
          g.lineStyle(2, 0xffc56b, 0.75);
          g.strokeEllipse(p.x, p.y, d.minRange * 64 * Math.SQRT2, d.minRange * 32 * Math.SQRT2);
        }
      }
    }
    if (this.model.editing && !this.model.placement) this.drawGrid(g);
    if (this.model.placement) {
      this.drawGrid(g);
      const screen = this.pointerScreen();
      const point = this.cameras.main.getWorldPoint(screen.x, screen.y),
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
    this.groundMarks.clear();
    const active = this.model.battle;
    if (active && !active.finished) {
      // One continuous red line around everything the base denies you, painted on
      // the grass so the base itself stays in front of it.
      const edges = this.battleBoundary();
      this.groundMarks.lineStyle(2.5, 0xff4d42, 0.92);
      for (const [x0, y0, x1, y1] of edges) {
        const a = iso(x0, y0),
          b = iso(x1, y1);
        this.groundMarks.lineBetween(a.x, a.y, b.x, b.y);
      }
      for (const aura of active.auras) {
        const p = iso(aura.x, aura.y),
          radius = SPELLS[aura.kind].radius,
          color = SPELL_COLOR[aura.kind],
          pulse = 1 + Math.sin(time / 220) * 0.03;
        g.fillStyle(color, 0.17);
        g.fillEllipse(p.x, p.y, radius * 128 * pulse, radius * 64 * pulse);
        g.lineStyle(2, color, 0.75);
        g.strokeEllipse(p.x, p.y, radius * 128 * pulse, radius * 64 * pulse);
      }
    }
    this.detail.clear();
    for (const v of this.model.buildings) {
      if (v.hp <= 0 || !this.model.visibleBuilding(v)) continue;
      const im = this.sprites.get(v.id)!;
      if (v.upgradeEnd) {
        const start = v.upgradeStart ?? v.upgradeEnd - 15000,
          duration = Math.max(1, v.upgradeEnd - start),
          progress = (this.model.clock - start) / duration;
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
      for (const trap of battle.finished ? [] : battle.buildings) {
        const state = battle.traps[trap.id];
        const def = BUILDINGS[trap.kind].trap;
        if (!def || !state || state.resolved) continue;
        const p = iso(state.x, state.y);
        const progress = Math.min(
          1,
          (battle.elapsed - state.activatedAt) / Math.max(0.01, def.delay),
        );
        const lift = def.targets === 'air' ? AIR_LIFT * progress : 0;
        this.detail.lineStyle(2, def.targets === 'air' ? 0xff746c : 0xffd175, 0.9);
        this.detail.strokeEllipse(p.x, p.y - lift, 20, 10);
        this.detail.fillStyle(0xffdc85, 1);
        this.detail.fillCircle(p.x, p.y - lift - 5, 3 + progress * 3);
      }
      for (const shell of battle.finished ? [] : battle.shells) {
        const from = iso(shell.fromX, shell.fromY),
          to = iso(shell.x, shell.y);
        const progress = Phaser.Math.Clamp(
          (battle.elapsed - shell.launched) / (shell.impact - shell.launched),
          0,
          1,
        );
        const sx = from.x + (to.x - from.x) * progress;
        const sy =
          from.y +
          (to.y - from.y) * progress -
          28 * (1 - progress) -
          Math.sin(progress * Math.PI) * 115;
        this.detail.lineStyle(1.5, 0xffc17a, 0.55);
        this.detail.strokeEllipse(to.x, to.y, shell.radius * 90, shell.radius * 45);
        this.detail.fillStyle(0x342b22, 0.2 + progress * 0.2);
        this.detail.fillEllipse(to.x, to.y, 14, 7);
        this.detail.fillStyle(0xffac43, 0.9);
        this.detail.fillCircle(sx, sy, 6);
        this.detail.fillStyle(0x42352c, 1);
        this.detail.fillCircle(sx, sy, 4);
      }
      for (const u of battle.units) {
        let im = this.unitSprites.get(u.id);
        if (!im) {
          const d = TROOPS[u.kind];
          im = this.add
            .image(0, 0, u.hero ? 'king' : d.staticSprite ? u.kind : `${u.kind}-walk`, 0)
            .setOrigin(0.5, u.hero || d.staticSprite ? 1 : 0.953);
          if (u.hero) im.setDisplaySize(52, (52 * im.height) / im.width);
          else if (d.staticSprite) im.setDisplaySize(d.width, (d.width * im.height) / im.width);
          else im.setDisplaySize(d.width * 1.48, d.width * 1.48);
          this.unitSprites.set(u.id, im);
          const spawn = iso(u.x, u.y);
          im.setPosition(spawn.x, spawn.y - (TROOPS[u.kind].flying ? AIR_LIFT : 0));
        }
        if (u.hp <= 0) {
          if (!im.getData('dying')) {
            im.setData('dying', true);
            im.setTint(u.ejected ? 0xffe9ae : 0xa09482);
            this.tweens.add({
              targets: im,
              alpha: 0,
              angle: u.ejected ? 360 : 70,
              y: im.y - (u.ejected ? 180 : 0),
              x: im.x + (u.ejected ? 70 : 0),
              duration: this.model.state.settings.reducedMotion ? 0 : 320,
              onComplete: () => im.setVisible(false),
            });
          }
          continue;
        }
        const flying = !!TROOPS[u.kind].flying;
        if (!u.hero && !TROOPS[u.kind].staticSprite)
          im.setFrame(
            (u.attacking && !flying) || this.model.state.settings.reducedMotion
              ? 0
              : Math.floor(time / (flying ? 360 : 140) + u.id) % 4,
          );
        if (u.hero) {
          const enraged = (battle.hero?.rageUntil ?? 0) > battle.elapsed;
          if (enraged) im.setTint(0xffbd76);
          else im.clearTint();
        }
        const p = iso(u.x, u.y),
          motion = this.model.state.settings.reducedMotion
            ? 0
            : flying
              ? Math.sin(time / 600 + u.id) * 2.2
              : Math.sin(time / 80 + u.id) * 1.6;
        const lift = flying ? AIR_LIFT : 0;
        // Air troops draw above every rooftop, with a shadow left on the ground.
        im.setPosition(p.x, p.y + motion - lift).setDepth(flying ? 7500 : p.y + 1);
        if (flying) {
          this.detail.fillStyle(0x1f2a16, 0.28);
          this.detail.fillEllipse(p.x, p.y, 26, 13);
        }
        const target = battle.buildings.find((b) => b.id === u.target);
        if (target) {
          const targetOnRight = iso(target.x, target.y).x > p.x;
          im.setFlipX(u.hero || TROOPS[u.kind].staticSprite ? !targetOnRight : targetOnRight);
        }
        const phase = 1 - Math.max(0, u.cooldown) / TROOPS[u.kind].rate;
        const impulse =
          u.attacking && phase < 0.28 && !this.model.state.settings.reducedMotion
            ? Math.sin((phase / 0.28) * Math.PI)
            : 0;
        const facing = target && iso(target.x, target.y).x > p.x ? 1 : -1;
        im.setX(p.x + facing * impulse * 4).setAngle(flying ? impulse * 4 : facing * impulse * 9);
        if (u.hp < u.maxHp)
          this.bar(p.x, p.y - lift - im.displayHeight, 22, u.hp / u.maxHp, 0x8dea68);
      }
    }
  }
  private drawGrid(g: Phaser.GameObjects.Graphics) {
    for (let x = 2; x <= 26; x++) {
      g.lineStyle(1, 0xffffff, 0.15);
      const p = iso(x, 2),
        q = iso(x, 26);
      g.lineBetween(p.x, p.y, q.x, q.y);
      const r = iso(2, x),
        s = iso(26, x);
      g.lineBetween(r.x, r.y, s.x, s.y);
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
    if (fx.type === 'trap' || fx.type === 'spring') {
      const reduced = this.model.state.settings.reducedMotion;
      const label = this.add
        .text(p.x, p.y - 38, fx.text ?? 'SPRUNG!', {
          fontFamily: 'Trebuchet MS',
          fontSize: '17px',
          fontStyle: 'bold',
          color: '#ffe4a2',
          stroke: '#453521',
          strokeThickness: 4,
        })
        .setOrigin(0.5)
        .setDepth(8500);
      this.tweens.add({
        targets: label,
        y: p.y - (reduced ? 38 : 80),
        alpha: 0,
        duration: 950,
        onComplete: () => label.destroy(),
      });
      this.audio.play('hit');
      if (!reduced) this.sparks(p.x, p.y - 10, fx.color ?? 0xffd175, 8);
      return;
    }
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
      this.flyToHud(
        p.x,
        p.y - 40,
        fx.color === 0xffd34b ? 'gold' : fx.color === 0x514076 ? 'dark' : 'elixir',
      );
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
    if (fx.type === 'spell') {
      const color = SPELL_COLOR[fx.spell ?? 'rage'];
      const radius = (fx.radius ?? 3) * 64;
      const ring = this.add
        .ellipse(p.x, p.y, radius * 0.4, radius * 0.2)
        .setStrokeStyle(4, color, 0.95)
        .setDepth(7200);
      this.tweens.add({
        targets: ring,
        scaleX: 5,
        scaleY: 5,
        alpha: 0,
        duration: 520,
        onComplete: () => ring.destroy(),
      });
      if (fx.spell === 'lightning')
        for (let i = 0; i < 3; i++) {
          const ox = (i - 1) * 26;
          const bolt = this.add.rectangle(p.x + ox, p.y - 150, 6, 300, color, 0.9).setDepth(7300);
          this.tweens.add({
            targets: bolt,
            alpha: 0,
            scaleX: 0.2,
            duration: 260,
            delay: i * 55,
            onComplete: () => bolt.destroy(),
          });
        }
      this.sparks(p.x, p.y - 20, color, 16);
      this.audio.play(fx.spell === 'lightning' ? 'destroy' : 'collect');
      if (fx.spell === 'lightning' && !this.model.state.settings.reducedMotion)
        this.cameras.main.shake(140, 0.0022);
      return;
    }
    if (fx.type === 'blast') {
      const radius = (fx.radius ?? 1.5) * 64;
      const lift = fx.toAir ? AIR_LIFT : 0;
      const color = fx.color ?? 0xff9a3c;
      const ring = this.add
        .ellipse(p.x, p.y - 26 - lift, radius * 0.55, radius * 0.28)
        .setStrokeStyle(4, color, 0.95)
        .setDepth(7400);
      this.tweens.add({
        targets: ring,
        scaleX: 2.8,
        scaleY: 2.8,
        alpha: 0,
        duration: 380,
        onComplete: () => ring.destroy(),
      });
      this.sparks(p.x, p.y - 26 - lift, color, 14);
      this.audio.play('destroy');
      if (!this.model.state.settings.reducedMotion) this.cameras.main.shake(80, 0.0016);
      return;
    }
    if (fx.type === 'projectile' && fx.projectileId) {
      this.drawProjectiles();
      if (!this.model.state.settings.reducedMotion)
        this.combatEffects.muzzle(fx.weapon!, this.projectileAnchors(fx).from);
      return;
    }
    if ((fx.type === 'projectile' || fx.type === 'impact' || fx.type === 'hit') && fx.toX !== undefined) {
      const { from, to } = this.projectileAnchors(fx);
      const reduced = this.model.state.settings.reducedMotion;
      if (fx.type === 'impact') this.combatEffects.impact(fx.weapon!, to, reduced);
      else if (fx.type === 'hit') this.combatEffects.impact('melee', to, reduced);
      else this.combatEffects.projectile(
        fx.weapon ?? (fx.color === 0xff9c37 ? 'fireball' : 'cannonball'),
        from, to, reduced,
      );
      if (Math.random() < 0.2) this.audio.play('hit');
      return;
    }
    if (fx.type === 'destroy') {
      this.sparks(p.x, p.y - 15, 0xd9be8a, fx.major ? 34 : 16);
      this.audio.play('destroy');
      if (!this.model.state.settings.reducedMotion)
        this.cameras.main.shake(fx.major ? 340 : 80, fx.major ? 0.006 : 0.001);
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
  /**
   * Sends collected resources into the HUD counter that receives them. The dots
   * are pinned to the screen, so panning mid-flight cannot pull them off course.
   */
  flyToHud(sx: number, sy: number, resource: 'gold' | 'elixir' | 'dark') {
    if (this.model.state.settings.reducedMotion) return;
    const target = document.querySelector<HTMLElement>(`[data-resource="${resource}"]`);
    if (!target) return;
    const box = target.getBoundingClientRect(),
      canvas = this.game.canvas.getBoundingClientRect();
    const c = this.cameras.main;
    this.resourceFlights.emit(
      {
        x: canvas.left +
          ((sx - c.scrollX - c.width / 2) * c.zoom + c.width / 2) * canvas.width / this.scale.width,
        y: canvas.top +
          ((sy - c.scrollY - c.height / 2) * c.zoom + c.height / 2) * canvas.height / this.scale.height,
      },
      { x: box.left + box.width / 2, y: box.top + box.height / 2 },
      resource,
    );
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
  private projectileAnchors(fx: FX) {
    const p = iso(fx.x, fx.y),
      q = iso(fx.toX!, fx.toY!);
    const source =
      fx.sourceId == null
        ? undefined
        : fx.targetBuilding
          ? this.unitSprites.get(fx.sourceId)
          : this.sprites.get(fx.sourceId);
    const target =
      fx.targetId == null
        ? undefined
        : fx.targetBuilding
          ? this.sprites.get(fx.targetId)
          : this.unitSprites.get(fx.targetId);
    const fromY =
      p.y -
      (fx.fromAir
        ? AIR_LIFT + 6
        : source && !fx.targetBuilding
          ? (source.getData('intactHeight') ?? source.displayHeight) * 0.7
          : 22);
    const toY =
      q.y -
      (fx.toAir ? AIR_LIFT : 0) -
      (target
        ? fx.targetBuilding
          ? (target.getData('intactHeight') ?? target.displayHeight) * 0.38
          : target.displayHeight * 0.48
        : 15);
    return { from: { x: p.x, y: fromY }, to: { x: q.x, y: toY } };
  }

  private drawProjectiles() {
    const b = this.model.battle;
    const shots =
      !b || b.finished || this.model.state.settings.reducedMotion ? [] : (b.projectiles ?? []);
    this.combatEffects.retainProjectiles(new Set(shots.map((p) => p.id)));
    for (const p of shots) {
      const { from, to } = this.projectileAnchors(projectileEffect(p, 'projectile'));
      const progress = Phaser.Math.Clamp((b!.elapsed - p.launched) / (p.impact - p.launched), 0, 1);
      this.combatEffects.poseProjectile(p.id, p.weapon, from, to, progress);
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
        if (im && b.hp <= 0 && !im.texture.key.startsWith('ruins-')) {
          this.renderRuin(b, im);
          this.drawRuinGround();
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
