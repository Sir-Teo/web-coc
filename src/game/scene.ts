import { CAMP_ART_LEVELS, campTexture, campArt } from './camp-art';
import { MAP_SIZE, BUILD_MIN, BUILD_MAX } from './grid';
import { MORTAR_ART_LEVELS, mortarTexture, mortarMuzzle } from './mortar-art';
import { SPRING_AIRTIME } from './trap-stats';
import { WALL_ART_LEVELS, wallArt, wallTexture } from './wall-art';
import { OBSTACLES } from './obstacles';
import Phaser from 'phaser';
import {
  BUILDINGS,
  isTrap,
  SPELLS,
  SPELL_KEYS,
  TROOPS,
  TROOP_KEYS,
  TIER3_LEVEL,
  buildingTexture,
  asset,
  walkAsset,
  type BuildingKind,
} from './data';
import { GameModel, type Building, type FX } from './model';
import { AudioManager } from './audio';
import { ResourceFlights } from '../ui/resource-flight';
import { CombatEffects } from './combat-effects';
import { projectileEffect } from './projectiles';
import { unitPose } from './unit-pose';
import { troopArt } from './troop-art';
import { campPlan, campPose, type CampActor } from './camp-presentation';
import { configureQuadRendering } from './quad-renderer';
import { defeatPose } from './unit-defeat';
import { EffectTimeline, type EffectTween } from './effect-timeline';
import { heroStats } from './heroes';
/** Screen height a flying troop floats above its ground position. */
const AIR_LIFT = 46;
const WOOD_RUINS = new Set<BuildingKind>(['barracks', 'builder', 'camp', 'archertower', 'cannon']);
const SPELL_COLOR: Record<string, number> = {
  rage: 0xff6a3d,
  heal: 0x8de35c,
  lightning: 0x6fd4ff,
};
// The painted surround covers the full supported zoom-out view beyond the playable grid.
const TERRAIN_SCALE = 1.35;
const CAMERA_MARGIN = 224;
export const WORLD = {
  left: 896 - MAP_SIZE * 32,
  width: MAP_SIZE * 64,
  height: MAP_SIZE * 32 + 299,
  ox: 896,
  oy: 112,
  tw: 64,
  th: 32,
};
export const iso = (x: number, y: number) =>
  new Phaser.Math.Vector2(WORLD.ox + (x - y) * 32, WORLD.oy + (x + y) * 16);
export const uniso = (x: number, y: number) => ({
  x: ((x - WORLD.ox) / 32 + (y - WORLD.oy) / 16) / 2,
  y: ((y - WORLD.oy) / 16 - (x - WORLD.ox) / 32) / 2,
});
export class VillageScene extends Phaser.Scene {
  model: GameModel;
  audio: AudioManager;
  obstacleSprites = new Map<number, Phaser.GameObjects.Image>();
  sprites = new Map<number, Phaser.GameObjects.Image>();
  unitSprites = new Map<number, Phaser.GameObjects.Image>();
  bubbles = new Map<number, Phaser.GameObjects.Container>();
  private ground!: Phaser.GameObjects.Container;
  private ruinGround!: Phaser.GameObjects.Graphics;
  /** Ground-level markings that buildings must sit on top of. */
  private groundMarks!: Phaser.GameObjects.Graphics;
  private overlay!: Phaser.GameObjects.Graphics;
  private detail!: Phaser.GameObjects.Graphics;
  private ghost?: Phaser.GameObjects.Image;
  wallGhosts = new Map<number, Phaser.GameObjects.Image>();
  private wallGhostLinks?: Phaser.GameObjects.Graphics;
  private wallDragOffset?: { x: number; y: number };
  private mode = '';
  private renderedBattle: GameModel['battle'] = null;
  private renderedReplay: GameModel['replay'] = null;
  private lastRevision = -1;
  private down?: { x: number; y: number; cx: number; cy: number; t: number; id: number | null };
  private dragged = false;
  /** Which role the current pointer gesture has committed to. */
  private gesture: 'none' | 'pan' | 'deploy' | 'drag-building' | 'drag-wall' = 'none';
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
  private cameraViewport = { width: 0, height: 0 };
  private wallSignature = '';
  private wallViews: Phaser.GameObjects.Graphics[] = [];
  private ambientUnits: Phaser.GameObjects.Image[] = [];
  private campActors: CampActor[] = [];
  private campViews = new Map<string, Phaser.GameObjects.Image>();
  private campShadows!: Phaser.GameObjects.Graphics;
  private campSignature = '';
  private campTime = 0;
  private resourceFlights = new ResourceFlights();
  private combatEffects!: CombatEffects;
  private effectTimeline = new EffectTimeline();
  private reducedCombatMotion = false;
  constructor(model: GameModel, audio: AudioManager) {
    super('village');
    this.model = model;
    this.audio = audio;
  }
  preload() {
    for (const level of WALL_ART_LEVELS) this.load.image(wallTexture(level), asset('wall', level));
    for (const level of MORTAR_ART_LEVELS)
      if (level > 1) this.load.image(mortarTexture(level), asset('mortar', level));
    for (const level of CAMP_ART_LEVELS)
      if (level > 1) this.load.image(campTexture(level), asset('camp', level));
    this.load.image('king', asset('king'));
    this.load.image('terrain', '/assets/environment/terrain-field-v4.webp');
    for (const material of ['stone', 'wood'])
      this.load.image(`ruins-${material}`, `/assets/environment/ruins-${material}.webp`);
    for (const k of Object.keys(BUILDINGS)) {
      this.load.image(k, asset(k));
      if (k !== 'wall' && k !== 'mortar' && k !== 'camp' && !BUILDINGS[k as keyof typeof BUILDINGS].singleArtwork)
        this.load.image(`${k}-tier3`, asset(k, TIER3_LEVEL));
    }
    for (const k of SPELL_KEYS) this.load.image(k, asset(k));
    for (const k of TROOP_KEYS)
      this.load.spritesheet(`${k}-walk`, walkAsset(k).replace('.webp', `${troopArt(k).version}.webp`), {
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
    configureQuadRendering(this.game.renderer as Phaser.Renderer.WebGL.WebGLRenderer);
    this.add
      .image(WORLD.ox, WORLD.height / 2, 'terrain')
      .setDisplaySize(WORLD.width * TERRAIN_SCALE, WORLD.height * TERRAIN_SCALE)
      .setDepth(-1000);
    this.ruinGround = this.add.graphics().setDepth(-875);
    this.groundMarks = this.add.graphics().setDepth(-850);
    this.campShadows = this.add.graphics().setDepth(-840);
    this.detail = this.add.graphics().setDepth(5000);
    this.overlay = this.add.graphics().setDepth(6000);
    this.combatEffects = new CombatEffects(this, (config) => this.animateEffect(config));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.combatEffects.clear();
      this.effectTimeline.clear();
    });
    this.drawField();
    this.decorate();
    this.cameras.main.setBackgroundColor('#50683d');
    this.resetCamera();
    this.scale.on('resize', () => {
      this.resourceFlights.clear();
      this.resizeCamera();
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
      this.wallDragOffset = undefined;
      const move = this.model.wallMove;
      if (move && this.model.wallPreview.some((w) =>
        (Math.floor(grid.x) === w.x && Math.floor(grid.y) === w.y) ||
        this.wallGhosts.get(w.id)?.getBounds().contains(world.x, world.y)))
        this.wallDragOffset = { x: move.x - Math.floor(grid.x), y: move.y - Math.floor(grid.y) };
      const held =
        this.model.editing && !this.model.placement && !move
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
        else if (this.gesture === 'drag-wall' && this.wallDragOffset) {
          const grid = this.gridAtPointer(p);
          this.model.previewWallMove(Math.floor(grid.x) + this.wallDragOffset.x, Math.floor(grid.y) + this.wallDragOffset.y);
        }
      }
      this.updateGhost(p);
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      this.pinchDistance = 0;
      const gesture = this.gesture;
      this.gesture = 'none';
      const down = this.down;
      this.down = undefined;
      if (
        this.uiBlocked || !down || p.downElement !== this.game.canvas ||
        p.event.type.includes('cancel')
      ) return;
      if (this.dragged || gesture !== 'none') return;
      this.tap(p);
    });
    // Phaser sends DOM releases through a separate event. A control can move
    // under a held pointer when a drawer opens or rerenders.
    const cancelGesture = () => {
      this.down = undefined;
      this.gesture = 'none';
      this.dragged = false;
      this.pinchDistance = 0;
    };
    this.input.on('pointerdownoutside', cancelGesture);
    this.input.on('pointerupoutside', cancelGesture);
    this.game.canvas.addEventListener('pointercancel', cancelGesture);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () =>
      this.game.canvas.removeEventListener('pointercancel', cancelGesture),
    );
    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => {
      if (!this.uiBlocked) this.setZoom(this.cameras.main.zoom * (dy > 0 ? 0.92 : 1.08));
    });
    this.model.onEffect = (fx) => this.effect(fx);
    this.sync();
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
  private drawField() {
    // One tiny repeating texture avoids tessellating 968 static diamonds every frame.
    if (!this.textures.exists('field-checks')) {
      const tile = this.add.graphics().fillStyle(0xffffff);
      tile.fillTriangle(0, 0, 64, 0, 32, 16);
      tile.fillTriangle(0, 32, 32, 16, 64, 32);
      tile.generateTexture('field-checks', 64, 32);
      tile.destroy();
    }
    const side = BUILD_MAX - BUILD_MIN;
    const center = iso((BUILD_MIN + BUILD_MAX) / 2, (BUILD_MIN + BUILD_MAX) / 2);
    const turf = this.add
      .tileSprite(center.x, center.y, side * 64, side * 32, 'field-checks')
      .setTint(0x23491d)
      .setAlpha(0.065);
    // Stencil only the four corners of the TileSprite's rectangle. Inverting
    // the diamond instead would fill the whole viewport when applying AND
    // removing the mask, even when the camera sees only the field interior.
    const outline = this.add.graphics().fillStyle(0xffffff);
    const left = center.x - side * 32, right = center.x + side * 32;
    const top = center.y - side * 16, bottom = center.y + side * 16;
    outline.fillTriangle(left, top, center.x, top, left, center.y);
    outline.fillTriangle(center.x, top, right, top, right, center.y);
    outline.fillTriangle(left, center.y, left, bottom, center.x, bottom);
    outline.fillTriangle(right, center.y, right, bottom, center.x, bottom);
    const stencil = this.add.stencil(0, 0, [outline], {
      stencilInvert: false,
      stencilLayerMode: 'addLayer',
      stencilCompositeCheck: false,
    });
    const release = this.add.stencilreference(stencil, {
      stencilInvert: false,
      stencilLayerMode: 'subtractLayer',
      stencilCompositeCheck: false,
    });
    // Keep stencil application and removal together so later village objects stay unclipped.
    this.ground = this.add.container(0, 0, [stencil, turf, release]).setDepth(-900);
  }
  decorate() {
    const dec: [string, number, number, number][] = [
      ['flag', 9, 24, 34],
      ['flag', 14, 24, 34],
    ];
    for (const [k, x, y, w] of dec) {
      const p = iso(x, y),
        im = this.add.image(p.x, p.y, k).setOrigin(0.5, 0.88);
      im.setDisplaySize(w, (w * im.height) / im.width).setDepth(p.y);
    }
  }
  private updateBaseZoom() {
    const { width, height } = this.scale;
    this.baseZoom = Math.max(width / 1792, height / 1195) * 1.04;
    if (width < 700) this.baseZoom = Math.max(width / 1250, height / 1400);
  }
  get minZoom() {
    return Math.min(
      this.baseZoom * 0.78,
      Math.max(this.scale.width / WORLD.width, this.scale.height / WORLD.height) * 0.95,
    );
  }
  resetCamera() {
    if (!this.cameras) return;
    this.updateBaseZoom();
    this.cameraViewport = { width: this.cameras.main.width, height: this.cameras.main.height };
    this.cameras.main.setZoom(this.baseZoom);
    this.cameras.main.centerOn(896, 570);
    this.clampCamera();
  }
  private resizeCamera() {
    const c = this.cameras.main;
    // Phaser has resized the viewport, but scroll still refers to its previous size.
    const x = c.scrollX + this.cameraViewport.width / 2;
    const y = c.scrollY + this.cameraViewport.height / 2;
    const zoom = c.zoom;
    this.updateBaseZoom();
    this.cameraViewport = { width: c.width, height: c.height };
    c.setZoom(Phaser.Math.Clamp(zoom, this.minZoom, this.baseZoom * 2));
    c.centerOn(x, y);
    this.clampCamera();
    // A pointer's old screen coordinates no longer describe the resized playfield.
    this.down = undefined;
    this.gesture = 'none';
    this.pinchDistance = 0;
  }
  setZoom(value: number) {
    this.cameras.main.setZoom(Phaser.Math.Clamp(value, this.minZoom, this.baseZoom * 2));
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
        WORLD.left + Math.min(vw / 2 - CAMERA_MARGIN, WORLD.width / 2),
        WORLD.left + Math.max(WORLD.width - vw / 2 + CAMERA_MARGIN, WORLD.width / 2),
      ),
      centerY = Phaser.Math.Clamp(
        c.scrollY + c.height / 2,
        Math.min(vh / 2 - CAMERA_MARGIN, WORLD.height / 2),
        Math.max(WORLD.height - vh / 2 + CAMERA_MARGIN, WORLD.height / 2),
      );
    c.centerOn(centerX, centerY);
  }
  /** Decides once per gesture whether a drag pans, deploys, or moves a building. */
  private classifyDrag(p: Phaser.Input.Pointer): 'pan' | 'deploy' | 'drag-building' | 'drag-wall' {
    if (this.model.wallMove) return this.wallDragOffset ? 'drag-wall' : 'pan';
    if (this.model.editing && this.down?.id != null) return 'drag-building';
    const b = this.model.battle;
    if (
      b &&
      !this.model.replay &&
      !b.finished &&
      !this.model.placement &&
      !this.model.activeSpell
    ) {
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
    if (this.model.wallMove) {
      this.model.previewWallMove(Math.floor(grid.x), Math.floor(grid.y));
      return;
    }
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
    const obstacle = !hit ? [...this.obstacleSprites.entries()]
      .sort((a, b) => b[1].depth - a[1].depth)
      .find(([, im]) => im.visible && world.x > im.x - im.displayWidth * .4
        && world.x < im.x + im.displayWidth * .4
        && world.y > im.y - im.displayHeight * .83 && world.y < im.y + im.displayHeight * .06) : undefined;
    this.model.selected = hit?.id ?? (obstacle ? -obstacle[0] : null);
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
      x < 1 || y < 1 || x > MAP_SIZE - 2 || y > MAP_SIZE - 2
        ? true
        : this.model.deployBlocked(x + 0.5, y + 0.5);
    const edges: number[][] = [];
    for (let x = 1; x <= MAP_SIZE - 2; x++)
      for (let y = 1; y <= MAP_SIZE - 2; y++) {
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
    if (reduced && !this.reducedCombatMotion) {
      this.combatEffects.clear();
      this.effectTimeline.clear();
    }
    this.reducedCombatMotion = reduced;
    if (this.model.state.settings.reducedMotion) this.resourceFlights.clear();
    const mode = this.model.battle ? 'battle' : 'home';
    if (mode !== this.mode || this.renderedBattle !== this.model.battle) {
      this.combatEffects.clear();
      this.effectTimeline.clear();
      this.resourceFlights.clear();
      const keepCamera = !!this.model.replay && this.renderedReplay === this.model.replay;
      this.renderedReplay = this.model.replay;
      this.renderedBattle = this.model.battle;
      // Short-lived combat effects must not survive a jump to an earlier timeline.
      const troops = new Set(this.unitSprites.values());
      for (const object of [...this.children.list]) {
        const display = object as Phaser.GameObjects.Image;
        if (display.depth >= 7000 && !troops.has(display)) {
          this.tweens.killTweensOf(display);
          display.destroy();
        }
      }
      this.boundary.signature = '';
      for (const s of this.sprites.values()) s.destroy();
      for (const s of this.unitSprites.values()) s.destroy();
      for (const id of this.bubbles.keys()) this.removeBubble(id);
      this.sprites.clear();
      this.unitSprites.clear();
      this.bubbles.clear();
      this.mode = mode;
      if (!keepCamera) this.resetCamera();
    }
    const obstacleIds = new Set(this.model.obstacles.map((o) => o.id));
    for (const [id, im] of this.obstacleSprites) {
      if (!obstacleIds.has(id)) { im.destroy(); this.obstacleSprites.delete(id); }
    }
    for (const o of this.model.obstacles) {
      const d = OBSTACLES[o.kind], p = iso(o.x + d.size / 2, o.y + d.size / 2);
      let im = this.obstacleSprites.get(o.id);
      if (!im) {
        im = this.add.image(p.x, p.y, o.kind).setOrigin(.5, .88);
        this.obstacleSprites.set(o.id, im);
      }
      im.setTexture(o.kind).setPosition(p.x, p.y).setDisplaySize(d.width, d.width * im.height / im.width)
        .setDepth(p.y).setVisible(!this.model.battle).setAlpha(o.removeEnd ? .65 : 1);
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
      this.styleBuilding(im, b.kind, b.level).setPosition(p.x, p.y).setDepth(p.y);
      im.setVisible(this.model.visibleBuilding(b) && !this.model.wallMove?.source.some((w) => w.id === b.id));
      im.setData('intactHeight', im.displayHeight);
      if (b.kind === 'mortar') {
        const muzzle = mortarMuzzle(b.level);
        im.setData('mortarMuzzle', {
          x: im.x + (muzzle.x - im.originX) * im.displayWidth,
          y: im.y + (muzzle.y - im.originY) * im.displayHeight,
        });
      }
      const trap = this.model.battle?.traps[b.id];
      im.setAlpha(trap?.resolved ? 0.35 : b.constructing ? 0.58 : 1);
      if (b.level >= TIER3_LEVEL && b.kind !== 'wall' && b.kind !== 'mortar' && b.kind !== 'camp') im.setTint(0xffecc7);
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
      const level = this.model.moving === null ? 1 : this.model.state.buildings.find((b) => b.id === this.model.moving)?.level ?? 1;
      if (!this.ghost) {
        this.ghost = this.add
          .image(0, 0, buildingTexture(this.model.placement, level))
          .setAlpha(0.72)
          .setDepth(6001);
      }
      // A paid upgrade can finish while this preview is open, even within one artwork tier.
      this.styleBuilding(this.ghost, this.model.placement, level);
      this.updateGhost(this.pointerScreen());
    } else {
      this.ghost?.destroy();
      this.ghost = undefined;
    }
    this.syncWalls();
    this.syncWallPreview();
    this.drawRuinGround();
    this.syncCampUnits();
    this.lastRevision = this.model.revision;
  }
  private styleBuilding(im: Phaser.GameObjects.Image, kind: BuildingKind, level: number) {
    const texture = buildingTexture(kind, level);
    if (im.texture.key !== texture) im.setTexture(texture);
    const wall = kind === 'wall' ? wallArt(level) : undefined;
    const camp = kind === 'camp' ? campArt(level) : undefined;
    const scale = wall || camp || kind === 'mortar' ? 1 : 1 + Math.min(4, level - 1) * .035;
    const width = wall ? wall.height * .75 : camp ? camp.width : BUILDINGS[kind].width * scale;
    return im.setOrigin(camp?.originX ?? .5, camp?.originY ?? (wall ? .84 : .88)).setFlipX(false)
      .setDisplaySize(width, wall ? wall.height : width * im.height / im.width);
  }
  private syncCampUnits() {
    if (this.model.battle) {
      for (const im of this.ambientUnits) im.setVisible(false);
      this.campShadows.clear();
      return;
    }
    const { army, buildings } = this.model.state;
    const obstacles = this.model.obstacles;
    const signature = TROOP_KEYS.map((k) => army[k]).join(',') + '|' +
      buildings.map((b) => `${b.id}:${b.kind}:${b.x}:${b.y}:${b.level}:${!!b.constructing}`).join('|') + '|' +
      obstacles.map((o) => `${o.id}:${o.kind}:${o.x}:${o.y}`).join('|');
    if (signature !== this.campSignature) {
      this.campSignature = signature;
      this.campActors = campPlan(army, buildings, obstacles);
      const ids = new Set(this.campActors.map((a) => a.id));
      for (const [id, im] of this.campViews)
        if (!ids.has(id)) { im.destroy(); this.campViews.delete(id); }
      this.ambientUnits = this.campActors.map((actor) => {
        let im = this.campViews.get(actor.id);
        if (!im) {
          const art = troopArt(actor.kind), size = TROOPS[actor.kind].width * art.displayScale * 0.7;
          im = this.add.image(0, 0, `${actor.kind}-walk`, art.idleFrame)
            .setOrigin(0.5, 122 / 128).setDisplaySize(size, size)
            .setData('campActor', actor.id).setData('kind', actor.kind);
          this.campViews.set(actor.id, im);
        }
        return im.setData('campId', actor.campId);
      });
    }
    this.drawCampUnits();
  }
  private drawCampUnits() {
    this.campShadows.clear();
    if (this.model.battle) return;
    const reduced = this.model.state.settings.reducedMotion;
    this.campShadows.fillStyle(0x1f2a16, 0.26);
    for (let i = 0; i < this.campActors.length; i++) {
      const actor = this.campActors[i], im = this.ambientUnits[i];
      const pose = campPose(actor, this.campTime);
      const px = WORLD.ox + (pose.x - pose.y) * 32, py = WORLD.oy + (pose.x + pose.y) * 16;
      const art = troopArt(actor.kind), flying = !!TROOPS[actor.kind].flying;
      const previousFacing = im.getData('facing');
      const facing = pose.facing || previousFacing || art.nativeFacing;
      const moving = pose.moving && !reduced;
      const bob = !reduced && flying ? Math.sin(this.campTime * 1.7 + actor.phase) * 2 : 0;
      const depth = flying ? 6500 : py + 1;
      const frame = moving || flying && !reduced
        ? Math.floor(this.campTime * 550 / art.frameMs + actor.phase * 4) % 4 : art.idleFrame;
      im.setVisible(true).setPosition(px, py - (flying ? AIR_LIFT : 0) + bob);
      if (im.depth !== depth) im.setDepth(depth);
      // Avoid rebuilding identical frame geometry and dispatching data events each frame.
      if (Number(im.frame.name) !== frame) im.setFrame(frame);
      if (previousFacing !== facing)
        im.setFlipX(art.nativeFacing > 0 ? facing < 0 : facing > 0).setData('facing', facing);
      if (flying) this.campShadows.fillEllipse(px, py, 22, 11);
    }
  }
  private renderRuin(b: Building, im: Phaser.GameObjects.Image) {
    const width = (b.kind === 'camp' ? campArt(b.level).width : BUILDINGS[b.kind].width) * (b.kind === 'wall' ? 0.9 : 0.98);
    im.setTexture(WOOD_RUINS.has(b.kind) && !(b.kind === 'camp' && b.level >= 7) ? 'ruins-wood' : 'ruins-stone')
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
      const width = (b.kind === 'camp' ? campArt(b.level).width : d.width) * 1.12;
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
    const walls = this.model.buildings.filter((b) => b.kind === 'wall' && b.hp > 0 && !this.model.wallMove?.source.some((w) => w.id === b.id));
    const signature = this.mode + walls.map((b) => `${b.id},${b.x},${b.y},${b.level}`).join(';');
    if (signature === this.wallSignature) return;
    this.wallSignature = signature;
    for (const g of this.wallViews) g.destroy();
    this.wallViews = [];
    for (const b of walls) {
      for (const [dx, dy] of [[1, 0], [0, 1]]) {
        const next = walls.find((w) => w.x === b.x + dx && w.y === b.y + dy);
        if (!next) continue;
        const p = iso(b.x + .5, b.y + .5), q = iso(next.x + .5, next.y + .5);
        const g = this.add.graphics().setDepth((p.y + q.y) / 2 - .5);
        this.paintWallLink(g, p, q, b.level, next.level);
        this.wallViews.push(g);
      }
    }
  }
  /** Two material halves meet at the seam, including when neighbouring walls differ in level. */
  private paintWallLink(g: Phaser.GameObjects.Graphics, p: Phaser.Math.Vector2, q: Phaser.Math.Vector2, fromLevel: number, toLevel: number, blocked = false) {
    const a = wallArt(fromLevel), b = wallArt(toLevel);
    const mid = new Phaser.Math.Vector2((p.x + q.x) / 2, (p.y + q.y) / 2);
    const midHeight = (a.linkHeight + b.linkHeight) / 2;
    const halves = [{ p, q: mid, art: a, h0: a.linkHeight, h1: midHeight }, { p: mid, q, art: b, h0: midHeight, h1: b.linkHeight }];
    for (const half of halves) {
      const { p, q, art, h0, h1 } = half;
      const top0 = new Phaser.Math.Vector2(p.x, p.y - h0), top1 = new Phaser.Math.Vector2(q.x, q.y - h1);
      const bottom0 = new Phaser.Math.Vector2(p.x, p.y - 2), bottom1 = new Phaser.Math.Vector2(q.x, q.y - 2);
      const mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2, mh = (h0 + h1) / 2;
      const jagged = art.material === 'crystal' || art.material === 'obsidian' || art.material === 'wood';
      const peak = new Phaser.Math.Vector2(mx, my - mh - (art.material === 'crystal' ? 5 : 3));
      const pts = jagged ? [bottom0, bottom1, top1, peak, top0] : [bottom0, bottom1, top1, top0];
      g.fillStyle(blocked ? 0xc94e4e : q.x > p.x ? art.face : art.shade, .98).fillPoints(pts, true);
      g.lineStyle(1, art.edge, .8).strokePoints(pts, true);
      if (jagged) {
        g.fillStyle(blocked ? 0xe77575 : art.top, .45).fillTriangle(mx, my - 2, peak.x, peak.y, top1.x, top1.y);
        g.lineStyle(1, art.edge, .6).lineBetween(mx, my - 2, peak.x, peak.y);
      } else {
        g.lineStyle(3, blocked ? 0xe77575 : art.top, 1).lineBetween(top0.x, top0.y, top1.x, top1.y);
        if (art.material === 'rubble' || art.material === 'stone') {
          g.lineStyle(1, art.edge, .55).lineBetween(p.x, p.y - h0 / 2, q.x, q.y - h1 / 2);
          g.lineBetween(mx, my - 2, mx, my - mh / 2);
        } else {
          g.lineStyle(1, art.top, .5).lineBetween(mx, my - 3, mx, my - mh + 3);
        }
      }
      if (art.material === 'wood') {
        g.lineStyle(2, 0xd9b76f, .9).lineBetween(p.x, p.y - h0 * .35, q.x, q.y - h1 * .35);
        g.lineBetween(p.x, p.y - h0 * .7, q.x, q.y - h1 * .7);
      }
    }
  }
  private syncWallPreview() {
    const preview = this.model.wallPreview;
    const ids = new Set(preview.map((b) => b.id));
    for (const [id, im] of this.wallGhosts) if (!ids.has(id)) { im.destroy(); this.wallGhosts.delete(id); }
    this.wallGhostLinks?.clear();
    if (!preview.length) { this.wallGhostLinks?.destroy(); this.wallGhostLinks = undefined; return; }
    const blocked = !!this.model.wallPlacementIssue;
    const color = blocked ? 0xff7272 : 0xffffff;
    const g = this.wallGhostLinks ??= this.add.graphics().setDepth(6000);
    for (const w of preview) {
      const p = iso(w.x + .5, w.y + .5);
      let im = this.wallGhosts.get(w.id);
      if (!im) { im = this.add.image(0, 0, 'wall').setOrigin(.5, .88); this.wallGhosts.set(w.id, im); }
      const level = this.model.state.buildings.find((b) => b.id === w.id)!.level, art = wallArt(level);
      im.setTexture(wallTexture(level)).setOrigin(.5, .84).setPosition(p.x, p.y).setDisplaySize(art.height * .75, art.height).setDepth(6001 + p.y / 10000).setTint(color).setAlpha(.85);
      for (const [dx, dy] of [[1, 0], [0, 1]]) {
        const next = preview.find((v) => v.x === w.x + dx && v.y === w.y + dy);
        if (!next) continue;
        const q = iso(next.x + .5, next.y + .5);
        const nextLevel = this.model.state.buildings.find((b) => b.id === next.id)!.level;
        this.paintWallLink(g, p, q, level, nextLevel, blocked);
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
      screen = iso(x + s / 2, y + s / 2),
      valid = this.model.canPlace(this.model.placement, x, y, this.model.moving ?? undefined);
    this.ghost.setPosition(screen.x, screen.y);
    this.ghost.setTint(
      valid
        ? this.model.placement === 'wall' || this.model.placement === 'mortar' || this.model.placement === 'camp' ? 0xffffff : 0xd9ffb0
        : 0xff7272,
    );
    return { x, y, size: s, valid };
  }
  drawOverlay(time: number) {
    if (this.model.battle)
      this.effectTimeline.update(this.model.battle.finished ? Infinity : this.model.battle.elapsed);
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
    for (const wall of this.model.selectedWalls)
      if (wall.id !== b?.id) diamond(wall.x, wall.y, 1, 0xffe8a0);
    const obstacle = this.model.selectedObstacle;
    if (obstacle) diamond(obstacle.x, obstacle.y, OBSTACLES[obstacle.kind].size, 0xffe8a0);
    if (b && !this.model.wallMove && b.hp > 0 && this.model.visibleBuilding(b)) {
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
    if (this.model.wallMove) {
      this.drawGrid(g);
      const color = this.model.wallPlacementIssue ? 0xff6464 : 0x8fff73;
      for (const w of this.model.wallMove.source) diamond(w.x, w.y, 1, 0xffe8a0, .06);
      for (const w of this.model.wallPreview) diamond(w.x, w.y, 1, color, .3);
    }
    if (this.model.editing && !this.model.placement && !this.model.wallMove) this.drawGrid(g);
    if (this.model.placement) {
      this.drawGrid(g);
      // Camera motion and DOM drags can change the tile without a Phaser pointer event.
      // Resolve it once per frame for both the sprite and its placement footprint.
      const preview = this.updateGhost(this.pointerScreen());
      if (preview)
        diamond(preview.x, preview.y, preview.size, preview.valid ? 0x8fff73 : 0xff6464, .28);
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
          pulse = this.model.state.settings.reducedMotion ? 1 : 1 + Math.sin(active.elapsed / 0.22) * 0.03;
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
        this.bar(im.x, im.y - im.displayHeight * (v.kind === 'camp' ? im.originY : 0.87), 54, progress, 0x82d745);
        const p = iso(v.x, v.y);
        this.detail.lineStyle(3, 0xe6b356, 0.7);
        this.detail.lineBetween(p.x - 12, p.y - 10, p.x - 12, p.y - 60);
        this.detail.lineBetween(p.x - 12, p.y - 50, p.x + 22, p.y - 65);
      } else if (this.model.battle && v.hp < v.maxHp)
        this.bar(im.x, im.y - im.displayHeight * (v.kind === 'camp' ? im.originY : 0.88), 42, v.hp / v.maxHp, 0xea654d);
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
      for (const u of battle.units) {
        const art = troopArt(u.kind);
        let im = this.unitSprites.get(u.id);
        if (!im) {
          const d = TROOPS[u.kind];
          im = this.add
            .image(0, 0, u.hero ? 'king' : `${u.kind}-walk`, 0)
            .setOrigin(0.5, u.hero ? 1 : 122 / 128);
          if (u.hero) im.setDisplaySize(52, (52 * im.height) / im.width);
          else im.setDisplaySize(d.width * art.displayScale, d.width * art.displayScale);
          this.unitSprites.set(u.id, im);
          const spawn = iso(u.x, u.y);
          im.setPosition(spawn.x, spawn.y - (TROOPS[u.kind].flying ? AIR_LIFT : 0));
        }
        if (u.hp <= 0) {
          const flying = !!TROOPS[u.kind].flying;
          const at = u.defeatedAt ?? im.getData('defeatedAt') ?? battle.elapsed;
          const pose = defeatPose(
            battle.finished ? Infinity : battle.elapsed - at,
            u.ejected ? 'spring' : flying ? 'air' : 'ground',
            im.getData('facing') ?? -1,
            this.model.state.settings.reducedMotion,
            AIR_LIFT,
          );
          const p = iso(u.x, u.y);
          im.setData('dying', true).setData('defeatedAt', at)
            .setTint(u.ejected ? 0xffe9ae : 0xa09482)
            .setPosition(p.x + pose.x, p.y - (flying ? AIR_LIFT : 0) + pose.y)
            .setDepth(flying || u.ejected ? 7500 : p.y + 1)
            .setAngle(pose.angle).setAlpha(pose.alpha).setVisible(pose.visible);
          continue;
        }
        const flying = !!TROOPS[u.kind].flying;
        const sprung = (u.springUntil ?? 0) > battle.elapsed;
        const springProgress =
          1 -
          Math.min(SPRING_AIRTIME, Math.max(0, (u.springUntil ?? 0) - battle.elapsed)) /
            SPRING_AIRTIME;
        const springLift =
          sprung && !this.model.state.settings.reducedMotion
            ? Math.sin(springProgress * Math.PI) * 45
            : 0;
        const target = battle.buildings.find((b) => b.id === u.target);
        const pose = unitPose(u, target, im.getData('facing') ?? -1);
        im.setData('facing', pose.facing).setFlipX(pose.flipX);
        // Presentation shares battle time, so pause, playback speed and seeking agree.
        const animationTime = battle.elapsed * 1000;
        if (!u.hero)
          im.setFrame(
            sprung || (!pose.moving && !flying) || this.model.state.settings.reducedMotion
              ? art.idleFrame
              : Math.floor(animationTime / art.frameMs + u.id) % 4,
          );
        if (u.hero) {
          const enraged = (battle.hero?.rageUntil ?? 0) > battle.elapsed;
          if (enraged) im.setTint(0xffbd76);
          else im.clearTint();
        }
        const p = iso(u.x, u.y),
          motion = sprung || this.model.state.settings.reducedMotion
            ? 0
            : flying
              ? Math.sin(animationTime / 600 + u.id) * 2.2
              : pose.moving ? Math.sin(animationTime / 80 + u.id) * (u.hero ? 1.6 : art.bob) : 0;
        const lift = flying ? AIR_LIFT : springLift;
        // Air troops draw above every rooftop, with a shadow left on the ground.
        im.setPosition(p.x, p.y + motion - lift)
          .setDepth(flying || sprung ? 7500 : p.y + 1)
          .setData('springLift', springLift);
        if (flying || sprung) {
          this.detail.fillStyle(0x1f2a16, 0.28);
          this.detail.fillEllipse(p.x, p.y, 26, 13);
        }
        const rate = u.hero && battle.hero
          ? heroStats(battle.hero.level, battle.hero.townhall).rate : TROOPS[u.kind].rate;
        const phase = 1 - Math.max(0, u.cooldown) / rate;
        const impulse =
          u.attacking && phase < 0.28 && !this.model.state.settings.reducedMotion
            ? Math.sin((phase / 0.28) * Math.PI)
            : 0;
        const facing = pose.facing;
        im.setX(p.x + facing * impulse * 4).setAngle(flying ? impulse * 4 : facing * impulse * 9);
        if (u.hp < u.maxHp)
          this.bar(p.x, p.y - lift - im.displayHeight, 22, u.hp / u.maxHp, 0x8dea68);
      }
    }
  }
  private drawGrid(g: Phaser.GameObjects.Graphics) {
    for (let x = BUILD_MIN; x <= BUILD_MAX; x++) {
      g.lineStyle(1, 0xffffff, 0.15);
      const p = iso(x, BUILD_MIN),
        q = iso(x, BUILD_MAX);
      g.lineBetween(p.x, p.y, q.x, q.y);
      const r = iso(BUILD_MIN, x),
        s = iso(BUILD_MAX, x);
      g.lineBetween(r.x, r.y, s.x, s.y);
    }
  }
  bar(x: number, y: number, w: number, p: number, color: number) {
    this.detail.fillStyle(0x292920, 0.8);
    this.detail.fillRoundedRect(x - w / 2 - 2, y - 2, w + 4, 7, 3);
    this.detail.fillStyle(color);
    this.detail.fillRoundedRect(x - w / 2, y, Math.max(0, w * p), 3, 1);
  }
  private animateEffect(config: EffectTween) {
    if (this.model.state.settings.reducedMotion) {
      // Phaser treats present-but-undefined properties as tween definitions.
      const { x, y, scale, scaleX, scaleY, ...stationary } = config;
      config = { ...stationary, delay: 0 };
    }
    if (this.model.battle) this.effectTimeline.add(config, this.model.battle.elapsed);
    else this.tweens.add(config);
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
      this.animateEffect({
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
      this.animateEffect({
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
      this.animateEffect({
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
      this.animateEffect({
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
          this.animateEffect({
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
    if (fx.type === 'blast' && fx.weapon === 'cannonball') {
      this.combatEffects.groundBlast(
        p, fx.radius ?? 1.5, this.model.state.settings.reducedMotion, 'mortar',
      );
      this.audio.play('destroy');
      if (!this.model.state.settings.reducedMotion) this.cameras.main.shake(80, 0.0016);
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
      this.animateEffect({
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
    if (fx.type === 'mortar-fire') {
      if (!this.model.state.settings.reducedMotion)
        this.combatEffects.muzzle('cannonball', this.mortarMuzzlePoint(fx.sourceId!, p));
      this.audio.play('hit');
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
      if (fx.type === 'impact' && fx.weapon === 'bomb' && fx.radius)
        this.combatEffects.groundBlast(iso(fx.toX, fx.toY!), fx.radius, reduced);
      else if (fx.type === 'impact') this.combatEffects.impact(fx.weapon!, to, reduced);
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
      this.animateEffect({
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
    if (this.model.state.settings.reducedMotion) return;
    for (let i = 0; i < count; i++) {
      const dot = this.add.circle(x, y, 2 + Math.random() * 3, color, 0.9).setDepth(8100);
      this.animateEffect({
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
      (fx.weapon === 'bomb'
        ? 3
        : (fx.toAir ? AIR_LIFT : 0) +
          (target
            ? fx.targetBuilding
              ? (target.getData('intactHeight') ?? target.displayHeight) * 0.38
              : target.displayHeight * 0.48
            : 15));
    return { from: { x: p.x, y: fromY }, to: { x: q.x, y: toY } };
  }

  private mortarMuzzlePoint(sourceId: number, ground: { x: number; y: number }) {
    const source = this.sprites.get(sourceId);
    return (source?.getData('mortarMuzzle') as { x: number; y: number } | undefined) ??
      { x: ground.x, y: ground.y - 28 };
  }

  private drawProjectiles() {
    const b = this.model.battle;
    const shots =
      !b || b.finished || this.model.state.settings.reducedMotion ? [] : (b.projectiles ?? []);
    const shells = !b || b.finished || this.model.state.settings.reducedMotion ? [] : b.shells;
    const shellId = (s: (typeof shells)[number]) => `mortar:${s.sourceId}:${s.launched}`;
    this.combatEffects.retainProjectiles(new Set([...shots.map((p) => p.id), ...shells.map(shellId)]));
    for (const shell of shells) {
      const progress = Phaser.Math.Clamp(
        (b!.elapsed - shell.launched) / (shell.impact - shell.launched), 0, 1,
      );
      this.combatEffects.poseMortar(
        shellId(shell), iso(shell.fromX, shell.fromY), iso(shell.x, shell.y),
        this.mortarMuzzlePoint(shell.sourceId, iso(shell.fromX, shell.fromY)), progress,
      );
    }
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
    if (!this.uiBlocked && !(document.activeElement instanceof HTMLInputElement)) {
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
    if (!this.model.battle && !this.model.state.settings.reducedMotion) this.campTime += dt;
    this.drawCampUnits();
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
