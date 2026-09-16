import { TroopNativePresentation } from './troop-native-scene';
import { EXTRA_TROOP_KINDS } from './extra-troops';
import { VillageNativePresentation, hasVillageNativeArt } from './village-native-scene';
import { NativeArtPacks, type NativeArtPack } from './native-art-pack';
import { NativeProjectilePresentation } from './native-projectile-scene';
import { NativeDefensePresentation } from './native-defense-scene';
import { nativeRow, tiles as nativeTiles } from './native-data';
import {
  ArcherTowerProjectiles,
  preloadArcherTowerProjectiles,
} from './archer-tower-projectile-scene';
import {
  VillageArcherTowers,
  preloadVillageArcherTowers,
  villageArcherTowerBounds,
} from './archer-tower-scene';
import { DarkDrillPresentation, preloadDarkDrills } from './dark-drill-scene';
import type { LateCampaignPresentation } from './late-campaign-scene';
import { hasLateArt, lateArt } from './late-campaign-art';
import {
  isLateBuilding,
  isLateCampaignBuilding,
  lateUnitFrozen,
  lateUnitTimeLost,
} from './late-campaign';
import { FROZEN_TINT } from './freeze-trap-art';
import { darkDrillBounds } from './dark-drill-art';
import { infernoSoundCues } from './inferno-sounds';
import { preloadInfernos, InfernoPresentation } from './inferno-scene';
import { infernoPortrait } from './inferno-art';
import { infernoBounds } from './inferno-graph';
import {
  preloadGarrisonTroops,
  preloadLateGarrisonTroops,
  GarrisonPresentation,
} from './garrison-scene';
import { garrisonSoundCues } from './garrison-sounds';
import { garrisonStats } from './garrison-kinds';
import { characterBarHeight } from './character-poses';
import { preloadCastles, CastlePresentation } from './castle-scene';
import { CASTLE_ART } from './castle-art';
import { castleBounds } from './castle-graph';
import { CANNON_ART } from './cannon-art';
import { preloadCannons, CannonPresentation } from './cannon-scene';
import { cannonBounds } from './cannon-poses';
import { preloadSeekingMines, SeekingMinePresentation } from './seeking-mine-scene';
import { SEEKING_MINE_ART } from './seeking-mine-art';
import { seekingMineBounds, seekingMineBodyState } from './seeking-mine-poses';
import { seekingMineShake } from './seeking-mine-shake';
import { bombTowerShake } from './bomb-tower-shake';
import { preloadGoblinBuildings, GoblinBuildingPresentation } from './goblin-building-scene';
import { isGoblinBuilding } from './goblin-building-art';
import { preloadDarkStorages, DarkStoragePresentation } from './dark-storage-scene';
import { DARK_STORAGE_ART } from './dark-storage-art';
import { SCENERY_SPRITES, sceneryAsset, sceneryArt } from './campaign-scenery';
import { NATIVE_SCENERY } from './native-campaign';
import { npcArt, type NpcBuildingKind } from './npc-buildings';
import { PUMPKIN_ART, pumpkinFrame } from './pumpkin-bomb';
import { santaTrapFrame } from './santa-art';
import { preloadSanta, SantaPresentation } from './santa-scene';
import { preloadShrinkTraps, ShrinkTrapPresentation } from './shrink-trap-scene';
import { isShrunk } from './shrink-trap';
import { preloadXbows, XbowPresentation } from './xbow-scene';
import { XBOW_ART } from './xbow-art';
import { xbowRange, type XbowMode } from './xbow-stats';
import { spellTowerRange } from './spell-tower-stats';
import { battleTrapStats } from './traps';
import { BOMB_TOWER_ART } from './bomb-tower-art';
import { preloadBombTowers, BombTowerPresentation } from './bomb-tower-scene';
import { bombTowerBounds, bombTowerMuzzle } from './bomb-tower-poses';
import { WIZARD_TOWER_ART } from './wizard-tower-art';
import { preloadWizardTowers, WizardTowerPresentation } from './wizard-tower-scene';
import { wizardTowerBounds } from './wizard-tower-poses';
import {
  SKELETON_ART_TIERS,
  skeletonTrapArt,
  skeletonTrapFrame,
  skeletonTrapAsset,
  skeletonTrapTexture,
  skeletonAsset,
} from './skeleton-art';
import { skeletonStats, type SkeletonMode } from './skeleton-stats';
import { isGarrisonDefender } from './defenders';
import { TESLA_ART } from './tesla-art';
import { preloadTeslas, TeslaPresentation } from './tesla-scene';
import { teslaBodyBounds } from './tesla-poses';
import { teslaRevealShake } from './tesla-shake';
import { CameraShakeLayer } from './camera-shake-layer';
import { SWEEPER_ART } from './air-control-art';
import { preloadSweepers, SweeperPresentation } from './air-sweeper-scene';
import { sweeperBounds } from './air-sweeper-poses';
import { SWEEPER, sweeperAngle } from './air-control-stats';
import { isDefense } from './data';
import { CAMP_ART_LEVELS, campTexture, campArt } from './camp-art';
import { MAP_SIZE, BUILD_MIN, BUILD_MAX } from './grid';
import { MORTAR_ART } from './mortar-art';
import { preloadMortars, MortarPresentation } from './mortar-scene';
import { mortarBounds } from './mortar-poses';
import { mortarShake } from './mortar-shake';
import { infernoShake } from './inferno-shake';
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
import { GameModel, makeBuilding, type Building, type FX } from './model';
import { AudioManager } from './audio';
import { ResourceFlights } from '../ui/resource-flight';
import { CombatEffects } from './combat-effects';
import { projectileEffect } from './projectiles';
import { unitPose } from './unit-pose';
import { troopArt } from './troop-art';
import { KING_ART, KING_DIRECTIONS, kingAtlas, kingTexture, kingPose } from './king-art';
import { campPlan, campPose, type CampActor } from './camp-presentation';
import { configureQuadRendering } from './quad-renderer';
import { defeatPose } from './unit-defeat';
import { EffectTimeline, type EffectTween } from './effect-timeline';
import { heroStats } from './heroes';
/** Screen height a flying troop floats above its ground position. */
const AIR_LIFT = 46;
const LOADING_LATE_ART = 'Loading village art…';
/** Stands in for the late campaign presentation until its art has loaded. */
const INERT_LATE_CAMPAIGN = {
  handles: () => false,
  bounds: () => undefined,
  render: () => [],
  clear: () => {},
  destroy: () => {},
};
const WOOD_RUINS = new Set<BuildingKind>([
  'barracks',
  'builder',
  'camp',
  'archertower',
  'cannon',
  'tesla',
]);
const SPELL_COLOR: Record<string, number> = {
  rage: 0xcf79ef,
  heal: 0xffed8a,
  lightning: 0x6fd4ff,
};
/** Ring colors for client spell rows cast through the version 45 spell engine. */
const NATIVE_SPELL_COLOR: Record<string, number> = {
  Jump: 0x9be86a,
  Freeze: 0x9fe3ff,
  Clone: 0x7ee0ff,
  Invisibility: 0xe8f4ff,
  Recall: 0xffd36a,
  Revive: 0xffe9a8,
  'Totem Spell': 0xffb35c,
  TotemSummon: 0xffb35c,
  Poison: 0x86e04f,
  Earthquake: 0xc9a06b,
  Haste: 0xff9fe3,
  'Skeleton Spell': 0xd9d4c7,
  'Bat Spell': 0x9b7ad6,
  Overgrowth: 0x57c95b,
  'Ice Block': 0xbfeaff,
  AngrySpell: 0xff6a5c,
  'Electro Titan Aura': 0x8fd8ff,
  'Apprentice Aura': 0xffe07a,
  TreantWallDamageAura: 0x7cc46a,
  FireSpiritBurn: 0xff8a3c,
  ElectroDragonDie: 0x8fd8ff,
  IceGolemFreeze: 0x9fe3ff,
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
  private defenderMarkers!: Phaser.GameObjects.Graphics;
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
  private cameraViewport = { width: 0, height: 0, densityX: 1 };
  private wallSignature = '';
  private wallViews: Phaser.GameObjects.Graphics[] = [];
  private seekingMinePresentation!: SeekingMinePresentation;
  private bombTowerPresentation!: BombTowerPresentation;
  private wizardTowerPresentation!: WizardTowerPresentation;
  private sweeperPresentation!: SweeperPresentation;
  private mortarPresentation!: MortarPresentation;
  private garrisonPresentation!: GarrisonPresentation;
  private archerTowerProjectiles!: ArcherTowerProjectiles;
  private villageArcherTowers!: VillageArcherTowers;
  private troopNativePresentation!: TroopNativePresentation;
  private villageNativePresentation!: VillageNativePresentation;
  private nativeEffectPacks!: NativeArtPacks<NativeArtPack>;
  private nativeProjectiles!: NativeProjectilePresentation;
  private nativeDefenses!: NativeDefensePresentation;
  private darkDrillPresentation!: DarkDrillPresentation;
  private infernoPresentation!: InfernoPresentation;
  private castlePresentation!: CastlePresentation;
  private cannonPresentation!: CannonPresentation;
  private defenderSprites = new Map<number, Phaser.GameObjects.Image>();
  private ambientUnits: Phaser.GameObjects.Image[] = [];
  private campActors: CampActor[] = [];
  private campViews = new Map<string, Phaser.GameObjects.Image>();
  private campShadows!: Phaser.GameObjects.Graphics;
  private campSignature = '';
  private campTime = 0;
  private resourceFlights = new ResourceFlights();
  private combatEffects!: CombatEffects;
  private santaPresentation!: SantaPresentation;
  private shrinkTrapPresentation!: ShrinkTrapPresentation;
  private goblinBuildingPresentation!: GoblinBuildingPresentation;
  private darkStoragePresentation!: DarkStoragePresentation;
  private xbowPresentation!: XbowPresentation;
  private teslaPresentation!: TeslaPresentation;
  /** Inert until the late campaign art loads; see `loadLateAssets`. */
  private lateCampaign: Pick<
    LateCampaignPresentation,
    'handles' | 'bounds' | 'render' | 'clear' | 'destroy'
  > = INERT_LATE_CAMPAIGN;
  private lateAssets?: Promise<void>;
  lateAssetsReady = false;
  private lateBattle: { battle: GameModel['battle']; needed: boolean } = {
    battle: null,
    needed: false,
  };
  private cameraShake!: CameraShakeLayer;
  private effectTimeline = new EffectTimeline();
  private reducedCombatMotion = false;
  constructor(model: GameModel, audio: AudioManager) {
    super('village');
    this.model = model;
    this.audio = audio;
  }
  preload() {
    preloadSanta(this);
    preloadXbows(this);
    preloadDarkStorages(this);
    preloadGoblinBuildings(this);
    preloadTeslas(this);
    preloadBombTowers(this);
    preloadWizardTowers(this);
    preloadSweepers(this);
    preloadMortars(this);
    this.load.image('cannon', '/assets/buildings/cannon.webp');
    preloadGarrisonTroops(this);
    preloadCastles(this);
    preloadInfernos(this);
    preloadDarkDrills(this);
    preloadVillageArcherTowers(this);
    preloadArcherTowerProjectiles(this);
    preloadCannons(this);
    preloadSeekingMines(this);
    preloadShrinkTraps(this);
    for (const level of SKELETON_ART_TIERS) {
      const art = skeletonTrapArt(level);
      this.load.spritesheet(art.texture, art.asset, {
        frameWidth: art.frameWidth,
        frameHeight: art.frameHeight,
        endFrame: art.frames - 1,
      });
      for (const mode of ['ground', 'air', 'spent'] as const)
        this.load.image(skeletonTrapTexture(mode, level), skeletonTrapAsset(mode, level));
    }
    for (const mode of ['ground', 'air'] as const)
      this.load.spritesheet(`skeleton-${mode}`, skeletonAsset(mode), {
        frameWidth: 128,
        frameHeight: 128,
      });
    for (const level of WALL_ART_LEVELS) this.load.image(wallTexture(level), asset('wall', level));
    for (const level of CAMP_ART_LEVELS)
      if (level > 1) this.load.image(campTexture(level), asset('camp', level));
    this.load.spritesheet(PUMPKIN_ART.texture, PUMPKIN_ART.asset, {
      frameWidth: PUMPKIN_ART.frameWidth,
      frameHeight: PUMPKIN_ART.frameHeight,
      endFrame: 44,
    });
    this.load.image('king', asset('king'));
    for (const direction of KING_DIRECTIONS)
      this.load.spritesheet(kingTexture(direction), kingAtlas(direction), {
        frameWidth: KING_ART.cell,
        frameHeight: KING_ART.cell,
      });
    for (const kind of SCENERY_SPRITES) this.load.image(`campaign-${kind}`, sceneryAsset(kind));
    this.load.image('terrain', '/assets/environment/terrain-field-v4.webp');
    for (const material of ['stone', 'wood'])
      this.load.image(`ruins-${material}`, `/assets/environment/ruins-${material}.webp`);
    for (const k of Object.keys(BUILDINGS)) {
      // Late campaign kinds render from their own per-level art, loaded with the late families.
      if (hasLateArt(k)) continue;
      if (k !== 'mortar' && k !== 'cannon')
        this.load.image(k, k === 'darkdrill' ? '/assets/buildings/darkdrill.webp' : asset(k));
      if (
        k !== 'wall' &&
        k !== 'mortar' &&
        k !== 'cannon' &&
        k !== 'camp' &&
        !BUILDINGS[k as keyof typeof BUILDINGS].singleArtwork
      )
        this.load.image(`${k}-tier3`, asset(k, TIER3_LEVEL));
    }
    for (const k of SPELL_KEYS) this.load.image(k, asset(k));
    for (const k of TROOP_KEYS.filter(
      (kind) => !EXTRA_TROOP_KINDS.includes(kind as (typeof EXTRA_TROOP_KINDS)[number]),
    ))
      this.load.spritesheet(
        `${k}-walk`,
        walkAsset(k).replace('.webp', `${troopArt(k).version}.webp`),
        {
          frameWidth: 128,
          frameHeight: 128,
        },
      );
    for (const k of EXTRA_TROOP_KINDS) this.load.image(`${k}-walk`, asset(k));
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
    this.defenderMarkers = this.add.graphics().setDepth(7600);
    this.overlay = this.add.graphics().setDepth(6000);
    this.combatEffects = new CombatEffects(this, (config) => this.animateEffect(config));
    this.santaPresentation = new SantaPresentation(this, this.audio);
    this.shrinkTrapPresentation = new ShrinkTrapPresentation(this, this.audio);
    this.goblinBuildingPresentation = new GoblinBuildingPresentation(this);
    this.darkStoragePresentation = new DarkStoragePresentation(this);
    this.xbowPresentation = new XbowPresentation(this, this.audio);
    this.teslaPresentation = new TeslaPresentation(this, this.audio);
    this.bombTowerPresentation = new BombTowerPresentation(this, this.audio);
    this.wizardTowerPresentation = new WizardTowerPresentation(this, this.audio);
    this.sweeperPresentation = new SweeperPresentation(this, this.audio);
    this.mortarPresentation = new MortarPresentation(this, this.audio);
    this.garrisonPresentation = new GarrisonPresentation(this, this.audio);
    this.castlePresentation = new CastlePresentation(this);
    this.infernoPresentation = new InfernoPresentation(this, this.audio);
    this.archerTowerProjectiles = new ArcherTowerProjectiles(this);
    this.villageArcherTowers = new VillageArcherTowers(this, this.audio);
    this.darkDrillPresentation = new DarkDrillPresentation(this, this.audio);
    this.troopNativePresentation = new TroopNativePresentation(this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.troopNativePresentation.destroy());
    this.villageNativePresentation = new VillageNativePresentation(
      this,
      (message) => this.model.notify(message),
      (resource) => this.model.state[resource] / Math.max(1, this.model.resourceCap(resource)),
    );
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.villageNativePresentation.destroy());
    this.nativeEffectPacks = new NativeArtPacks<NativeArtPack>(this);
    this.nativeProjectiles = new NativeProjectilePresentation(this, this.nativeEffectPacks);
    this.nativeDefenses = new NativeDefensePresentation(this, this.nativeEffectPacks);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.nativeProjectiles.destroy();
      this.nativeDefenses.destroy();
      this.nativeEffectPacks.destroy();
    });
    this.cannonPresentation = new CannonPresentation(this, this.audio);
    this.seekingMinePresentation = new SeekingMinePresentation(this, this.audio);
    this.cameraShake = new CameraShakeLayer(this.cameras.main, () => {
      const reduced = this.model.state.settings.reducedMotion,
        replay = !!this.model.replay;
      const tesla = teslaRevealShake(this.model.battle, reduced, replay);
      const bomb = bombTowerShake(this.model.battle, reduced, replay);
      const mine = seekingMineShake(this.model.battle, reduced, replay);
      const mortar = mortarShake(this.model.battle, reduced, replay);
      const inferno = infernoShake(this.model.battle, reduced, replay);
      return {
        x: tesla.x + bomb.x + mine.x + mortar.x + inferno.x,
        y: tesla.y + bomb.y + mine.y + mortar.y + inferno.y,
      };
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.combatEffects.clear();
      this.effectTimeline.clear();
      this.santaPresentation.destroy();
      this.shrinkTrapPresentation.destroy();
      this.xbowPresentation.destroy();
      this.darkStoragePresentation.destroy();
      this.goblinBuildingPresentation.destroy();
      this.teslaPresentation.destroy();
      this.lateCampaign.destroy();
      this.bombTowerPresentation.destroy();
      this.wizardTowerPresentation.destroy();
      this.sweeperPresentation.destroy();
      this.mortarPresentation.destroy();
      this.garrisonPresentation.clear();
      this.castlePresentation.clear();
      this.infernoPresentation.clear();
      this.darkDrillPresentation.clear();
      this.villageNativePresentation.clear();
      this.troopNativePresentation.clear();
      this.villageArcherTowers.clear();
      this.archerTowerProjectiles.clear();
      this.cannonPresentation.destroy();
      this.seekingMinePresentation.destroy();
      this.cameraShake.destroy();
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
      if (
        move &&
        this.model.wallPreview.some(
          (w) =>
            (Math.floor(grid.x) === w.x && Math.floor(grid.y) === w.y) ||
            this.wallGhosts.get(w.id)?.getBounds().contains(world.x, world.y),
        )
      )
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
        this.model.endDrag(true);
        const dist = Phaser.Math.Distance.Between(
          pointers[0].x / this.scale.displayScale.x,
          pointers[0].y / this.scale.displayScale.y,
          pointers[1].x / this.scale.displayScale.x,
          pointers[1].y / this.scale.displayScale.y,
        );
        if (this.pinchDistance) this.setZoom((this.viewZoom * dist) / this.pinchDistance);
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
          travel = Math.hypot(dx / this.scale.displayScale.x, dy / this.scale.displayScale.y);
        if (this.gesture === 'none' && travel > 7) this.gesture = this.classifyDrag(p);
        if (this.gesture !== 'none') this.dragged = true;
        if (this.gesture === 'pan') {
          this.cameras.main.scrollX = this.down.cx - dx / this.cameras.main.zoomX;
          this.cameras.main.scrollY = this.down.cy - dy / this.cameras.main.zoomY;
          this.clampCamera();
        } else if (this.gesture === 'deploy') this.dragDeploy(p);
        else if (this.gesture === 'drag-building') this.dragBuilding(p);
        else if (this.gesture === 'drag-wall' && this.wallDragOffset) {
          const grid = this.gridAtPointer(p);
          this.model.previewWallMove(
            Math.floor(grid.x) + this.wallDragOffset.x,
            Math.floor(grid.y) + this.wallDragOffset.y,
          );
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
      this.model.endDrag(
        this.uiBlocked ||
          !down ||
          p.downElement !== this.game.canvas ||
          p.event.type.includes('cancel'),
      );
      if (
        this.uiBlocked ||
        !down ||
        p.downElement !== this.game.canvas ||
        p.event.type.includes('cancel')
      )
        return;
      if (this.dragged || gesture !== 'none') return;
      this.tap(p);
    });
    // Phaser sends DOM releases through a separate event. A control can move
    // under a held pointer when a drawer opens or rerenders.
    const cancelGesture = () => {
      this.model.endDrag(true);
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
      if (!this.uiBlocked) this.setZoom(this.viewZoom * (dy > 0 ? 0.92 : 1.08));
    });
    this.model.onEffect = (fx) => this.effect(fx);
    this.sync();
    this.ready = true;
    this.onReady();
    document.querySelector('#loading')?.classList.add('loaded');
    setTimeout(() => document.querySelector('#loading')?.remove(), 500);
    this.game.canvas.addEventListener('webglcontextlost', () => {
      this.paused = true;
      this.audio.samples.stop();
      this.model.notify('Graphics paused. Restoring your village…');
    });
    this.game.canvas.addEventListener('webglcontextrestored', () => {
      this.paused = false;
    });
  }
  /**
   * The late Goblin Map families and their defending characters (about 40 MB) load the first
   * time a battle or replay needs them rather than at boot. Resolves once they can render.
   */
  loadLateAssets(): Promise<void> {
    if (this.lateAssets) return this.lateAssets;
    const slow = setTimeout(() => this.model.notify(LOADING_LATE_ART), 400);
    const settle = () => {
      clearTimeout(slow);
      // Withdraw a loading notice that is still showing; later messages stay.
      if (document.querySelector('#toast')?.textContent === LOADING_LATE_ART) this.model.notify('');
    };
    // The presentation code and its source graphs are a separate chunk, fetched with the art.
    this.lateAssets = import('./late-campaign-scene').then(
      ({ LateCampaignPresentation, preloadLateCampaign }) =>
        new Promise<void>((resolve) => {
          let failed = false;
          const failure = () => (failed = true);
          this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, failure);
          this.load.once(Phaser.Loader.Events.COMPLETE, () => {
            settle();
            this.load.off(Phaser.Loader.Events.FILE_LOAD_ERROR, failure);
            if (failed) this.model.notify('Some village art could not load. Refresh to retry.');
            this.lateCampaign = new LateCampaignPresentation(this, this.audio);
            this.lateAssetsReady = true;
            // Restyle every building so late bodies replace the hidden fallback sprites.
            this.lastRevision = -1;
            resolve();
          });
          preloadLateCampaign(this);
          preloadLateGarrisonTroops(this);
          this.load.start();
        }),
      () => {
        settle();
        this.model.notify('Village art could not load. Check your connection and try again.');
        // The waiting battle can still return home; a later sync retries after a pause.
        setTimeout(() => (this.lateAssets = undefined), 5000);
      },
    );
    return this.lateAssets;
  }
  /** True while the current battle waits for late campaign art; its clock and input hold. */
  private lateAssetsPending() {
    if (this.lateAssetsReady) return false;
    const battle = this.model.battle;
    // A home village that owns a late family needs the same art outside battle.
    if (!battle) return this.model.state.buildings.some(isLateCampaignBuilding);
    if (this.lateBattle.battle !== battle)
      this.lateBattle = { battle, needed: battle.buildings.some(isLateCampaignBuilding) };
    return this.lateBattle.needed;
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
    const left = center.x - side * 32,
      right = center.x + side * 32;
    const top = center.y - side * 16,
      bottom = center.y + side * 16;
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
  private campaignScenery: Phaser.GameObjects.Image[] = [];
  private homeDecorations: Phaser.GameObjects.Image[] = [];
  decorate() {
    const dec: [string, number, number, number][] = [
      ['flag', 9, 24, 34],
      ['flag', 14, 24, 34],
    ];
    for (const [k, x, y, w] of dec) {
      const p = iso(x, y),
        im = this.add.image(p.x, p.y, k).setOrigin(0.5, 0.88);
      im.setDisplaySize(w, (w * im.height) / im.width).setDepth(p.y);
      this.homeDecorations.push(im);
    }
  }
  private updateBaseZoom() {
    const { width, height } = this.scale.canvasBounds;
    this.baseZoom = Math.max(width / 1792, height / 1195) * 1.04;
    if (width < 700) this.baseZoom = Math.max(width / 1250, height / 1400);
  }
  get minZoom() {
    return Math.min(
      this.baseZoom * 0.78,
      Math.max(
        this.scale.canvasBounds.width / WORLD.width,
        this.scale.canvasBounds.height / WORLD.height,
      ) * 0.95,
    );
  }
  /** Camera zoom in CSS pixels per world pixel, independent of display density. */
  get viewZoom() {
    return this.cameras.main.zoomX / this.cameraViewport.densityX;
  }
  private rememberViewport() {
    const c = this.cameras.main;
    this.cameraViewport = { width: c.width, height: c.height, densityX: this.scale.displayScale.x };
  }
  resetCamera() {
    if (!this.cameras) return;
    this.updateBaseZoom();
    this.rememberViewport();
    this.setZoom(this.baseZoom);
    const battle = this.model.battle;
    if (battle?.catalog === 'goblin-v1') {
      const points = battle.buildings
        .filter((b) => !isTrap(b.kind))
        .flatMap((b) => {
          const size = BUILDINGS[b.kind].size;
          return [
            iso(b.x, b.y),
            iso(b.x + size, b.y),
            iso(b.x, b.y + size),
            iso(b.x + size, b.y + size),
          ];
        });
      const span = Math.max(...points.map((p) => p.x)) - Math.min(...points.map((p) => p.x));
      this.setZoom(Math.min(this.baseZoom, (this.scale.canvasBounds.width - 48) / (span + 64)));
      const x = (Math.min(...points.map((p) => p.x)) + Math.max(...points.map((p) => p.x))) / 2;
      const y =
        (Math.min(...points.map((p) => p.y)) + Math.max(...points.map((p) => p.y))) / 2 - 45;
      const portrait = this.scale.canvasBounds.width < 700;
      this.cameras.main.centerOn(x, y - (portrait ? 50 / this.viewZoom : 0));
    } else this.cameras.main.centerOn(896, 570);
    this.clampCamera();
  }
  private resizeCamera() {
    this.model.endDrag(true);
    const c = this.cameras.main;
    // Phaser has resized the viewport, but scroll still refers to its previous size.
    const x = c.scrollX + this.cameraViewport.width / 2;
    const y = c.scrollY + this.cameraViewport.height / 2;
    const zoom = this.viewZoom;
    this.updateBaseZoom();
    this.rememberViewport();
    this.setZoom(zoom);
    c.centerOn(x, y);
    this.clampCamera();
    // A pointer's old screen coordinates no longer describe the resized playfield.
    this.down = undefined;
    this.gesture = 'none';
    this.pinchDistance = 0;
    this.ghostPoint = undefined;
    // Reproject the last DOM position into the new buffer for a stationary cursor.
    const pointer = this.input.activePointer;
    const event = pointer.event;
    if (event && 'clientX' in event) {
      const point = this.canvasPoint(event.clientX, event.clientY);
      pointer.position.set(point.x, point.y);
    }
  }
  setZoom(value: number) {
    const zoom = Phaser.Math.Clamp(value, this.minZoom, this.baseZoom * 2);
    this.cameras.main.setZoom(zoom * this.scale.displayScale.x, zoom * this.scale.displayScale.y);
    this.clampCamera();
  }
  zoomBy(delta: number) {
    this.setZoom(this.viewZoom * delta);
  }
  clampCamera() {
    const c = this.cameras.main,
      vw = c.width / c.zoomX,
      vh = c.height / c.zoomY;
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
      !this.model.activeSpell &&
      !this.lateAssetsPending()
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
      this.placeBuilding(Math.floor(grid.x), Math.floor(grid.y));
      return;
    }
    if (this.model.battle) {
      if (this.lateAssetsPending()) {
        this.model.notify(LOADING_LATE_ART);
        return;
      }
      if (this.model.activeSpell) {
        if (this.model.castSpell(grid.x, grid.y)) this.audio.play('deploy');
        return;
      }
      const hit = this.pickBuilding(world.x, world.y, grid);
      if (hit && hit.hp > 0 && isDefense(hit.kind) && this.model.deployBlocked(grid.x, grid.y)) {
        const d = BUILDINGS[hit.kind];
        this.model.selected = hit.id;
        this.model.changed();
        this.model.notify(
          `${d.name} · Level ${hit.level} · Range ${d.minRange ? `${d.minRange}–` : ''}${hit.kind === 'inferno' ? (hit.infernoMode === 'multi' ? 10 : 9) : hit.kind === 'xbow' ? xbowRange(hit.xbowMode) : hit.kind === 'spelltower' ? spellTowerRange(hit) : d.range} tiles${d.minRange ? ' · Orange ring = blind spot' : ''}${hit.kind === 'xbow' ? ` · ${hit.xbowMode === 'both' ? 'Ground & air' : 'Ground only'} · ${(this.model.battle.xbows?.[hit.id]?.ammunition ?? 1500).toLocaleString()} bolts` : ''}`,
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
    const obstacle = !hit
      ? [...this.obstacleSprites.entries()]
          .sort((a, b) => b[1].depth - a[1].depth)
          .find(
            ([, im]) =>
              im.visible &&
              world.x > im.x - im.displayWidth * 0.4 &&
              world.x < im.x + im.displayWidth * 0.4 &&
              world.y > im.y - im.displayHeight * 0.83 &&
              world.y < im.y + im.displayHeight * 0.06,
          )
      : undefined;
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
    return {
      x: ((clientX - rect.left) * this.scale.width) / rect.width,
      y: ((clientY - rect.top) * this.scale.height) / rect.height,
    };
  }
  gridAtScreen(clientX: number, clientY: number) {
    return this.gridAtPointer(this.canvasPoint(clientX, clientY));
  }
  /** Shared mouse/touch placement feedback; native Tesla sounds come from the model event. */
  placeBuilding(x: number, y: number) {
    const kind = this.model.placement;
    if (!this.model.place(x, y)) return false;
    if (
      kind !== 'archertower' &&
      kind !== 'darkdrill' &&
      kind !== 'tesla' &&
      kind !== 'bombtower' &&
      kind !== 'seekingairmine' &&
      kind !== 'airsweeper' &&
      kind !== 'mortar' &&
      kind !== 'cannon' &&
      kind !== 'wizardtower'
    )
      this.audio.play('build');
    return true;
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
        .filter(
          (v) => v.hp > 0 && v.kind !== 'wall' && !isTrap(v.kind) && this.model.visibleBuilding(v),
        )
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
  private nativeBuildingBounds(b: Building) {
    const late = this.lateCampaign.bounds(b);
    if (late) return late;
    if (b.kind === 'archertower' && (!this.model.battle || this.model.battle.nativeArcherTowers))
      return villageArcherTowerBounds(
        b,
        this.model.state.settings.reducedMotion
          ? 0
          : (this.model.battle?.elapsed ?? this.renderClock / 1000),
        this.model.battle,
        this.model.state.settings.reducedMotion,
      );
    if (b.kind === 'darkdrill')
      return darkDrillBounds(
        b,
        this.model.state.settings.reducedMotion
          ? 0
          : (this.model.battle?.elapsed ?? this.renderClock / 1000),
      );
    const sample =
      b.kind === 'inferno'
        ? infernoBounds
        : b.kind === 'clancastle'
          ? castleBounds
          : b.kind === 'cannon' && !b.npc
            ? cannonBounds
            : b.kind === 'mortar'
              ? mortarBounds
              : b.kind === 'airsweeper'
                ? sweeperBounds
                : b.kind === 'tesla'
                  ? teslaBodyBounds
                  : b.kind === 'bombtower'
                    ? bombTowerBounds
                    : b.kind === 'wizardtower'
                      ? wizardTowerBounds
                      : b.kind === 'seekingairmine'
                        ? seekingMineBounds
                        : undefined;
    if (!sample) return;
    const state =
      b.hp <= 0 ? 'ruin' : b.constructing ? 'constructing' : b.upgradeEnd ? 'upgrading' : 'setup';
    if (b.kind === 'seekingairmine' && state === 'setup') {
      const pose = seekingMineBodyState(
        this.model.battle?.traps[b.id],
        this.model.battle?.elapsed ?? 0,
        this.model.state.settings.reducedMotion,
        !!this.model.battle?.finished,
      );
      return seekingMineBounds(b.level, pose.state);
    }
    if (b.kind === 'inferno')
      return infernoBounds(
        b.level,
        state,
        this.model.state.settings.reducedMotion
          ? 0
          : (this.model.battle?.elapsed ?? this.renderClock / 1000),
        b.infernoMode ?? 'single',
      );
    return sample(b.level, state);
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
      const bounds = this.nativeBuildingBounds(b);
      if (im && bounds) {
        if (
          wx > im.x + bounds[0] &&
          wx < im.x + bounds[2] &&
          wy > im.y + bounds[1] &&
          wy < im.y + bounds[3]
        )
          return b;
        continue;
      }
      if (
        im &&
        wx > im.x - im.displayWidth * 0.42 &&
        wx < im.x + im.displayWidth * 0.42 &&
        wy >
          im.y -
            im.displayHeight *
              (['xbow', 'darkstorage'].includes(b.kind) || isGoblinBuilding(b.npc)
                ? im.originY
                : 0.83) &&
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
    if (this.lateAssetsPending()) void this.loadLateAssets();
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
      this.santaPresentation.clear();
      this.shrinkTrapPresentation.clear();
      this.xbowPresentation.clear();
      this.darkStoragePresentation.clear();
      this.goblinBuildingPresentation.clear();
      this.teslaPresentation.clear();
      this.lateCampaign.clear();
      this.bombTowerPresentation.clear();
      this.wizardTowerPresentation.clear();
      this.sweeperPresentation.clear();
      this.mortarPresentation.clear();
      this.garrisonPresentation.clear();
      this.castlePresentation.clear();
      this.infernoPresentation.clear();
      this.darkDrillPresentation.clear();
      this.villageNativePresentation.clear();
      this.troopNativePresentation.clear();
      this.nativeProjectiles.clear();
      this.nativeDefenses.clear();
      this.villageArcherTowers.clear();
      this.archerTowerProjectiles.clear();
      this.cannonPresentation.clear();
      this.seekingMinePresentation.clear();
      this.effectTimeline.clear();
      this.resourceFlights.clear();
      const keepCamera = !!this.model.replay && this.renderedReplay === this.model.replay;
      this.renderedReplay = this.model.replay;
      this.renderedBattle = this.model.battle;
      // Short-lived combat effects must not survive a jump to an earlier timeline.
      const troops = new Set(this.unitSprites.values());
      for (const object of [...this.children.list]) {
        const display = object as Phaser.GameObjects.Image;
        if (display.depth >= 7000 && !troops.has(display) && object !== this.defenderMarkers) {
          this.tweens.killTweensOf(display);
          display.destroy();
        }
      }
      for (const im of this.campaignScenery) im.destroy();
      this.campaignScenery = [];
      for (const im of this.homeDecorations)
        im.setVisible(mode === 'home' || this.model.battle?.catalog !== 'goblin-v1');
      for (const o of this.model.battle?.scenery ?? []) {
        const art = sceneryArt(o.data),
          p = iso(o.x + art.size / 2, o.y + art.size / 2);
        const im = this.add
          .image(p.x, p.y, art.texture)
          .setOrigin(0.5, 225 / 256)
          .setDisplaySize(art.width, art.width)
          .setDepth(p.y)
          .setData('nativeScenery', o.data)
          .setAlpha(NATIVE_SCENERY[o.data].faded ? 0.5 : 1);
        this.campaignScenery.push(im);
      }
      this.boundary.signature = '';
      for (const s of this.sprites.values()) s.destroy();
      for (const s of this.unitSprites.values()) s.destroy();
      for (const id of this.bubbles.keys()) this.removeBubble(id);
      this.sprites.clear();
      this.unitSprites.clear();
      this.bubbles.clear();
      for (const sprite of this.defenderSprites.values()) sprite.destroy();
      this.defenderSprites.clear();
      this.mode = mode;
      if (!keepCamera) this.resetCamera();
    }
    const obstacleIds = new Set(this.model.obstacles.map((o) => o.id));
    for (const [id, im] of this.obstacleSprites) {
      if (!obstacleIds.has(id)) {
        im.destroy();
        this.obstacleSprites.delete(id);
      }
    }
    for (const o of this.model.obstacles) {
      const d = OBSTACLES[o.kind],
        p = iso(o.x + d.size / 2, o.y + d.size / 2);
      let im = this.obstacleSprites.get(o.id);
      if (!im) {
        im = this.add.image(p.x, p.y, o.kind).setOrigin(0.5, 0.88);
        this.obstacleSprites.set(o.id, im);
      }
      im.setTexture(o.kind)
        .setPosition(p.x, p.y)
        .setDisplaySize(d.width, (d.width * im.height) / im.width)
        .setDepth(p.y)
        .setVisible(!this.model.battle)
        .setAlpha(o.removeEnd ? 0.65 : 1);
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
      this.styleBuilding(
        im,
        b.kind,
        b.level,
        b.direction,
        b.skeletonMode,
        b.npc,
        b.xbowMode,
        b.spellTowerWeapon,
      )
        .setPosition(p.x, p.y)
        .setDepth(p.y)
        .setCrop();
      im.setVisible(
        this.model.visibleBuilding(b) && !this.model.wallMove?.source.some((w) => w.id === b.id),
      );
      im.setData(
        'intactHeight',
        b.kind === 'archertower' && (!this.model.battle || this.model.battle.nativeArcherTowers)
          ? villageArcherTowerBounds(
              { ...b, hp: 1, constructing: false, upgradeEnd: undefined },
              0,
            )[3] -
              villageArcherTowerBounds(
                { ...b, hp: 1, constructing: false, upgradeEnd: undefined },
                0,
              )[1]
          : b.kind === 'darkdrill'
            ? darkDrillBounds({ ...b, hp: 1, constructing: false, upgradeEnd: undefined }, 0)[3] -
              darkDrillBounds({ ...b, hp: 1, constructing: false, upgradeEnd: undefined }, 0)[1]
            : b.kind === 'inferno'
              ? infernoBounds(b.level, 'setup', 0, b.infernoMode)[3] -
                infernoBounds(b.level, 'setup', 0, b.infernoMode)[1]
              : b.kind === 'clancastle'
                ? castleBounds(b.level)[3] - castleBounds(b.level)[1]
                : b.kind === 'cannon' && !b.npc
                  ? cannonBounds(b.level)[3] - cannonBounds(b.level)[1]
                  : b.kind === 'mortar'
                    ? mortarBounds(b.level)[3] - mortarBounds(b.level)[1]
                    : b.kind === 'airsweeper'
                      ? sweeperBounds(b.level)[3] - sweeperBounds(b.level)[1]
                      : b.kind === 'bombtower'
                        ? bombTowerBounds(b.level)[3] - bombTowerBounds(b.level)[1]
                        : b.kind === 'wizardtower'
                          ? wizardTowerBounds(b.level)[3] - wizardTowerBounds(b.level)[1]
                          : im.displayHeight,
      );
      const trap = this.model.battle?.traps[b.id];
      if (b.npc === 'pumpkin-bomb')
        im.setFrame(
          pumpkinFrame(
            trap,
            this.model.battle?.elapsed ?? 0,
            this.model.state.settings.reducedMotion,
          ),
        );
      im.setAlpha(trap?.resolved ? 0.35 : b.constructing ? 0.58 : 1);
      if (
        (b.kind === 'clancastle' ||
          b.kind === 'xbow' ||
          b.kind === 'darkstorage' ||
          b.kind === 'tesla' ||
          b.kind === 'bombtower' ||
          b.kind === 'wizardtower' ||
          b.kind === 'airsweeper' ||
          b.kind === 'mortar' ||
          (b.kind === 'cannon' && !b.npc) ||
          b.kind === 'seekingairmine' ||
          b.npc === 'shrink-trap' ||
          isGoblinBuilding(b.npc)) &&
        b.hp > 0
      )
        im.setAlpha(0);
      if (b.npc === 'santa-trap')
        im.setFrame(
          santaTrapFrame(
            trap,
            this.model.battle?.elapsed ?? 0,
            this.model.state.settings.reducedMotion,
          ),
        ).setAlpha(1);
      if (
        !b.npc &&
        b.level >= TIER3_LEVEL &&
        b.kind !== 'wall' &&
        b.kind !== 'mortar' &&
        b.kind !== 'cannon' &&
        b.kind !== 'camp' &&
        b.kind !== 'inferno' &&
        b.kind !== 'clancastle' &&
        b.kind !== 'xbow' &&
        b.kind !== 'darkstorage' &&
        b.kind !== 'tesla' &&
        b.kind !== 'bombtower' &&
        b.kind !== 'wizardtower' &&
        b.kind !== 'airsweeper' &&
        b.kind !== 'seekingairmine'
      )
        im.setTint(0xffecc7);
      else im.clearTint();
      if (b.hp <= 0) {
        this.renderRuin(b, im);
      }
      if (b.kind === 'clancastle' || b.kind === 'inferno' || b.kind === 'darkdrill') im.setAlpha(0);
      // Late campaign families draw their own bodies, foundations and ruins; until their art has
      // loaded, the fallback sprites have no texture to show either.
      if (
        this.lateCampaign.handles(b) ||
        (!this.lateAssetsReady && this.model.battle && isLateCampaignBuilding(b))
      )
        im.setAlpha(0);
      if (b.kind === 'archertower' && (!this.model.battle || this.model.battle.nativeArcherTowers))
        im.setAlpha(0);
      const shouldBubble =
        !this.model.battle &&
        b.id !== this.model.moving &&
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
            color:
              b.kind === 'goldmine' ? '#efaa10' : b.kind === 'darkdrill' ? '#514076' : '#c449e2',
            stroke:
              b.kind === 'goldmine' ? '#b87516' : b.kind === 'darkdrill' ? '#291d3e' : '#823b9c',
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
        const y =
          b.kind === 'darkdrill'
            ? p.y + darkDrillBounds(b, 0)[1] - 13
            : p.y - im.displayHeight * 0.86 - 13;
        const reduced = this.model.state.settings.reducedMotion;
        const anchor = `${p.x},${y},${reduced}`;
        if (c.getData('anchor') !== anchor) {
          this.tweens.killTweensOf(c);
          c.setPosition(p.x, y)
            .setDepth(p.y + 300)
            .setData('anchor', anchor);
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
    if (this.model.placement !== 'darkdrill') this.darkDrillPresentation.preview(undefined);
    if (this.model.placement !== 'archertower') this.villageArcherTowers.preview(undefined);
    if (this.model.placement) {
      const level =
        this.model.moving === null
          ? 1
          : (this.model.state.buildings.find((b) => b.id === this.model.moving)?.level ?? 1);
      if (!this.ghost) {
        this.ghost = this.add
          .image(0, 0, buildingTexture(this.model.placement, level))
          .setAlpha(0.72)
          .setDepth(6001);
      }
      // A paid upgrade can finish while this preview is open, even within one artwork tier.
      this.styleBuilding(
        this.ghost,
        this.model.placement,
        level,
        this.model.state.buildings.find((b) => b.id === this.model.moving)?.direction,
        this.model.state.buildings.find((b) => b.id === this.model.moving)?.skeletonMode,
        undefined,
        this.model.state.buildings.find((b) => b.id === this.model.moving)?.xbowMode,
      );
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
  private styleBuilding(
    im: Phaser.GameObjects.Image,
    kind: BuildingKind,
    level: number,
    direction = 0,
    skeletonMode: SkeletonMode = 'ground',
    npc?: NpcBuildingKind,
    xbowMode: XbowMode = 'ground',
    spellTowerWeapon?: string,
  ) {
    if (kind === 'skeletontrap') {
      const art = skeletonTrapArt(level);
      return im
        .setTexture(art.texture, skeletonTrapFrame(level, skeletonMode, undefined, 0))
        .setOrigin(art.originX, art.originY)
        .setFlipX(false)
        .setDisplaySize(art.width, (art.width * art.frameHeight) / art.frameWidth);
    }
    const npcVisual = npc && npcArt(npc);
    if (npc === 'tutorial-cannon') {
      const width = BUILDINGS.cannon.width;
      return im
        .setTexture('cannon')
        .setOrigin(0.5, 0.88)
        .setFlipX(false)
        .setDisplaySize(width, (width * im.height) / im.width);
    }
    if (npcVisual)
      return im
        .setTexture(npcVisual.texture)
        .setOrigin(npcVisual.originX, npcVisual.originY)
        .setFlipX(false)
        .setDisplaySize(npcVisual.width, (npcVisual.width * im.height) / im.width);
    const texture = buildingTexture(kind, level, direction, xbowMode, 'single', spellTowerWeapon);
    if (im.texture.key !== texture) im.setTexture(texture);
    if (hasLateArt(kind)) {
      const art = lateArt(kind);
      return im
        .setOrigin(art.originX, art.originY)
        .setFlipX(false)
        .setDisplaySize(art.width, art.height);
    }
    if (kind === 'inferno') {
      const art = infernoPortrait(level);
      return im
        .setOrigin(art.originX, art.originY + 64 / (art.height * 1.2))
        .setFlipX(false)
        .setDisplaySize(art.width * 1.2, art.height * 1.2);
    }
    if (kind === 'clancastle')
      return im
        .setOrigin(CASTLE_ART.originX, CASTLE_ART.originY)
        .setFlipX(false)
        .setDisplaySize(CASTLE_ART.width, CASTLE_ART.height);
    if (kind === 'darkstorage')
      return im
        .setOrigin(DARK_STORAGE_ART.originX, DARK_STORAGE_ART.originY)
        .setFlipX(false)
        .setDisplaySize(DARK_STORAGE_ART.width, DARK_STORAGE_ART.height);
    if (kind === 'xbow')
      return im
        .setOrigin(XBOW_ART.originX, XBOW_ART.originY)
        .setFlipX(false)
        .setDisplaySize(XBOW_ART.width, XBOW_ART.height);
    if (kind === 'tesla')
      return im
        .setOrigin(TESLA_ART.originX, TESLA_ART.originY)
        .setFlipX(false)
        .setDisplaySize(TESLA_ART.width, TESLA_ART.height)
        .setData('nativeTeslaRuin', false);
    if (kind === 'bombtower')
      return im
        .setOrigin(BOMB_TOWER_ART.originX, BOMB_TOWER_ART.originY)
        .setFlipX(false)
        .setDisplaySize(BOMB_TOWER_ART.width, BOMB_TOWER_ART.height)
        .setData('nativeBombTowerRuin', false);
    if (kind === 'seekingairmine')
      return im
        .setOrigin(SEEKING_MINE_ART.originX, SEEKING_MINE_ART.originY)
        .setFlipX(false)
        .setDisplaySize(SEEKING_MINE_ART.width, SEEKING_MINE_ART.height);
    if (kind === 'cannon')
      return im
        .setOrigin(CANNON_ART.originX, CANNON_ART.originY)
        .setFlipX(false)
        .setDisplaySize(CANNON_ART.width, CANNON_ART.height)
        .setData('nativeCannonRuin', false);
    if (kind === 'mortar')
      return im
        .setOrigin(MORTAR_ART.originX, MORTAR_ART.originY)
        .setFlipX(false)
        .setDisplaySize(MORTAR_ART.width, MORTAR_ART.height)
        .setData('nativeMortarRuin', false);
    if (kind === 'airsweeper')
      return im
        .setOrigin(SWEEPER_ART.originX, SWEEPER_ART.originY)
        .setFlipX(false)
        .setDisplaySize(SWEEPER_ART.width, SWEEPER_ART.height)
        .setData('nativeSweeperRuin', false);
    if (kind === 'wizardtower')
      return im
        .setOrigin(WIZARD_TOWER_ART.originX, WIZARD_TOWER_ART.originY)
        .setFlipX(false)
        .setDisplaySize(WIZARD_TOWER_ART.width, WIZARD_TOWER_ART.height)
        .setData('nativeWizardTowerRuin', false);
    const wall = kind === 'wall' ? wallArt(level) : undefined;
    const camp = kind === 'camp' ? campArt(level) : undefined;
    const scale = wall || camp ? 1 : 1 + Math.min(4, level - 1) * 0.035;
    const width = wall ? wall.height * 0.75 : camp ? camp.width : BUILDINGS[kind].width * scale;
    return im
      .setOrigin(camp?.originX ?? 0.5, camp?.originY ?? (wall ? 0.84 : 0.88))
      .setFlipX(false)
      .setDisplaySize(width, wall ? wall.height : (width * im.height) / im.width);
  }
  private syncCampUnits() {
    if (this.model.battle) {
      for (const im of this.ambientUnits) im.setVisible(false);
      this.campShadows.clear();
      return;
    }
    const { army, buildings } = this.model.state;
    const obstacles = this.model.obstacles;
    const signature =
      TROOP_KEYS.map((k) => army[k]).join(',') +
      '|' +
      buildings
        .map((b) => `${b.id}:${b.kind}:${b.x}:${b.y}:${b.level}:${!!b.constructing}`)
        .join('|') +
      '|' +
      obstacles.map((o) => `${o.id}:${o.kind}:${o.x}:${o.y}`).join('|');
    if (signature !== this.campSignature) {
      this.campSignature = signature;
      this.campActors = campPlan(army, buildings, obstacles);
      const ids = new Set(this.campActors.map((a) => a.id));
      for (const [id, im] of this.campViews)
        if (!ids.has(id)) {
          im.destroy();
          this.campViews.delete(id);
        }
      this.ambientUnits = this.campActors.map((actor) => {
        let im = this.campViews.get(actor.id);
        if (!im) {
          const art = troopArt(actor.kind),
            size = TROOPS[actor.kind].width * art.displayScale * 0.7;
          im = this.add
            .image(0, 0, `${actor.kind}-walk`, art.idleFrame)
            .setOrigin(0.5, 122 / 128)
            .setDisplaySize(size, size)
            .setData('campActor', actor.id)
            .setData('kind', actor.kind);
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
      const actor = this.campActors[i],
        im = this.ambientUnits[i];
      const pose = campPose(actor, this.campTime);
      const px = WORLD.ox + (pose.x - pose.y) * 32,
        py = WORLD.oy + (pose.x + pose.y) * 16;
      const art = troopArt(actor.kind),
        flying = !!TROOPS[actor.kind].flying;
      const previousFacing = im.getData('facing');
      const facing = pose.facing || previousFacing || art.nativeFacing;
      const moving = pose.moving && !reduced;
      const bob = !reduced && flying ? Math.sin(this.campTime * 1.7 + actor.phase) * 2 : 0;
      const depth = flying ? 6500 : py + 1;
      const frame =
        moving || (flying && !reduced)
          ? Math.floor((this.campTime * 550) / art.frameMs + actor.phase * 4) % 4
          : art.idleFrame;
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
    const p = iso(b.x + BUILDINGS[b.kind].size / 2, b.y + BUILDINGS[b.kind].size / 2);
    if (b.kind === 'cannon' && !b.npc) {
      im.setCrop().setPosition(p.x, p.y).setAlpha(0).setData('nativeCannonRuin', true);
      return;
    }
    if (b.kind === 'mortar') {
      im.setCrop().setPosition(p.x, p.y).setAlpha(0).setData('nativeMortarRuin', true);
      return;
    }
    if (b.kind === 'airsweeper') {
      im.setCrop().setPosition(p.x, p.y).setAlpha(0).setData('nativeSweeperRuin', true);
      return;
    }
    if (b.kind === 'seekingairmine') {
      im.setCrop().setPosition(p.x, p.y).setAlpha(0);
      return;
    }
    if (b.kind === 'tesla' || b.kind === 'bombtower' || b.kind === 'wizardtower') {
      im.setCrop()
        .setPosition(p.x, p.y)
        .setAlpha(0)
        .setData(
          b.kind === 'tesla'
            ? 'nativeTeslaRuin'
            : b.kind === 'wizardtower'
              ? 'nativeWizardTowerRuin'
              : 'nativeBombTowerRuin',
          true,
        );
      return;
    }
    const width =
      (b.kind === 'camp' ? campArt(b.level).width : BUILDINGS[b.kind].width) *
      (b.kind === 'wall' ? 0.9 : 0.98);
    im.setTexture(
      WOOD_RUINS.has(b.kind) && !(b.kind === 'camp' && b.level >= 7) ? 'ruins-wood' : 'ruins-stone',
    )
      .setCrop()
      .setPosition(p.x, p.y)
      .setOrigin(0.5, 0.58)
      .setFlipX(b.id % 2 === 0)
      .clearTint()
      .setAlpha(1)
      .setDisplaySize(width, (width * im.height) / im.width)
      .setDepth(im.y - 2);
  }
  private drawRuinGround() {
    this.ruinGround.clear();
    for (const b of this.model.buildings) {
      if (
        b.hp > 0 ||
        isTrap(b.kind) ||
        b.kind === 'tesla' ||
        b.kind === 'bombtower' ||
        b.kind === 'wizardtower' ||
        b.kind === 'airsweeper' ||
        b.kind === 'mortar' ||
        (b.kind === 'cannon' && !b.npc) ||
        // Late campaign families draw their own native rubble.
        this.lateCampaign.handles(b)
      )
        continue;
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
    const walls = this.model.buildings.filter(
      (b) =>
        b.kind === 'wall' && b.hp > 0 && !this.model.wallMove?.source.some((w) => w.id === b.id),
    );
    const signature = this.mode + walls.map((b) => `${b.id},${b.x},${b.y},${b.level}`).join(';');
    if (signature === this.wallSignature) return;
    this.wallSignature = signature;
    for (const g of this.wallViews) g.destroy();
    this.wallViews = [];
    for (const b of walls) {
      for (const [dx, dy] of [
        [1, 0],
        [0, 1],
      ]) {
        const next = walls.find((w) => w.x === b.x + dx && w.y === b.y + dy);
        if (!next) continue;
        const p = iso(b.x + 0.5, b.y + 0.5),
          q = iso(next.x + 0.5, next.y + 0.5);
        const g = this.add.graphics().setDepth((p.y + q.y) / 2 - 0.5);
        this.paintWallLink(g, p, q, b.level, next.level);
        this.wallViews.push(g);
      }
    }
  }
  /** Two material halves meet at the seam, including when neighbouring walls differ in level. */
  private paintWallLink(
    g: Phaser.GameObjects.Graphics,
    p: Phaser.Math.Vector2,
    q: Phaser.Math.Vector2,
    fromLevel: number,
    toLevel: number,
    blocked = false,
  ) {
    const a = wallArt(fromLevel),
      b = wallArt(toLevel);
    const mid = new Phaser.Math.Vector2((p.x + q.x) / 2, (p.y + q.y) / 2);
    const midHeight = (a.linkHeight + b.linkHeight) / 2;
    const halves = [
      { p, q: mid, art: a, h0: a.linkHeight, h1: midHeight },
      { p: mid, q, art: b, h0: midHeight, h1: b.linkHeight },
    ];
    for (const half of halves) {
      const { p, q, art, h0, h1 } = half;
      const top0 = new Phaser.Math.Vector2(p.x, p.y - h0),
        top1 = new Phaser.Math.Vector2(q.x, q.y - h1);
      const bottom0 = new Phaser.Math.Vector2(p.x, p.y - 2),
        bottom1 = new Phaser.Math.Vector2(q.x, q.y - 2);
      const mx = (p.x + q.x) / 2,
        my = (p.y + q.y) / 2,
        mh = (h0 + h1) / 2;
      const jagged =
        art.material === 'crystal' || art.material === 'obsidian' || art.material === 'wood';
      const peak = new Phaser.Math.Vector2(mx, my - mh - (art.material === 'crystal' ? 5 : 3));
      const pts = jagged ? [bottom0, bottom1, top1, peak, top0] : [bottom0, bottom1, top1, top0];
      g.fillStyle(blocked ? 0xc94e4e : q.x > p.x ? art.face : art.shade, 0.98).fillPoints(
        pts,
        true,
      );
      g.lineStyle(1, art.edge, 0.8).strokePoints(pts, true);
      if (jagged) {
        g.fillStyle(blocked ? 0xe77575 : art.top, 0.45).fillTriangle(
          mx,
          my - 2,
          peak.x,
          peak.y,
          top1.x,
          top1.y,
        );
        g.lineStyle(1, art.edge, 0.6).lineBetween(mx, my - 2, peak.x, peak.y);
      } else {
        g.lineStyle(3, blocked ? 0xe77575 : art.top, 1).lineBetween(top0.x, top0.y, top1.x, top1.y);
        if (art.material === 'rubble' || art.material === 'stone') {
          g.lineStyle(1, art.edge, 0.55).lineBetween(p.x, p.y - h0 / 2, q.x, q.y - h1 / 2);
          g.lineBetween(mx, my - 2, mx, my - mh / 2);
        } else {
          g.lineStyle(1, art.top, 0.5).lineBetween(mx, my - 3, mx, my - mh + 3);
        }
      }
      if (art.material === 'wood') {
        g.lineStyle(2, 0xd9b76f, 0.9).lineBetween(p.x, p.y - h0 * 0.35, q.x, q.y - h1 * 0.35);
        g.lineBetween(p.x, p.y - h0 * 0.7, q.x, q.y - h1 * 0.7);
      }
    }
  }
  private syncWallPreview() {
    const preview = this.model.wallPreview;
    const ids = new Set(preview.map((b) => b.id));
    for (const [id, im] of this.wallGhosts)
      if (!ids.has(id)) {
        im.destroy();
        this.wallGhosts.delete(id);
      }
    this.wallGhostLinks?.clear();
    if (!preview.length) {
      this.wallGhostLinks?.destroy();
      this.wallGhostLinks = undefined;
      return;
    }
    const blocked = !!this.model.wallPlacementIssue;
    const color = blocked ? 0xff7272 : 0xffffff;
    const g = (this.wallGhostLinks ??= this.add.graphics().setDepth(6000));
    for (const w of preview) {
      const p = iso(w.x + 0.5, w.y + 0.5);
      let im = this.wallGhosts.get(w.id);
      if (!im) {
        im = this.add.image(0, 0, 'wall').setOrigin(0.5, 0.88);
        this.wallGhosts.set(w.id, im);
      }
      const level = this.model.state.buildings.find((b) => b.id === w.id)!.level,
        art = wallArt(level);
      im.setTexture(wallTexture(level))
        .setOrigin(0.5, 0.84)
        .setPosition(p.x, p.y)
        .setDisplaySize(art.height * 0.75, art.height)
        .setDepth(6001 + p.y / 10000)
        .setTint(color)
        .setAlpha(0.85);
      for (const [dx, dy] of [
        [1, 0],
        [0, 1],
      ]) {
        const next = preview.find((v) => v.x === w.x + dx && v.y === w.y + dy);
        if (!next) continue;
        const q = iso(next.x + 0.5, next.y + 0.5);
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
    if (this.model.placement !== 'darkdrill') this.darkDrillPresentation.preview(undefined);
    if (this.model.placement !== 'archertower') this.villageArcherTowers.preview(undefined);
    if (hasVillageNativeArt(this.model.placement)) {
      const original = this.model.state.buildings.find((b) => b.id === this.model.moving);
      const building = original
        ? { ...original, x, y }
        : makeBuilding(-1, this.model.placement, x, y, 1);
      this.ghost.setAlpha(this.villageNativePresentation.preview(building, valid) ? 0 : 0.72);
    } else if (this.model.placement === 'darkdrill') {
      this.ghost.setAlpha(0);
      const building =
        this.model.state.buildings.find((b) => b.id === this.model.moving) ??
        makeBuilding(-1, 'darkdrill', x, y, 1);
      this.darkDrillPresentation.preview(building, screen.x, screen.y, valid);
    } else if (this.model.placement === 'archertower') {
      this.ghost.setAlpha(0);
      const building =
        this.model.state.buildings.find((b) => b.id === this.model.moving) ??
        makeBuilding(-1, 'archertower', x, y, 1);
      this.villageArcherTowers.preview(building, screen.x, screen.y, valid);
    } else {
      this.ghost.setAlpha(0.72);
      this.darkDrillPresentation.preview(undefined);
    }
    this.ghost.setTint(
      valid
        ? this.model.placement === 'wall' ||
          this.model.placement === 'mortar' ||
          this.model.placement === 'cannon' ||
          this.model.placement === 'camp' ||
          this.model.placement === 'wizardtower' ||
          this.model.placement === 'airsweeper'
          ? 0xffffff
          : 0xd9ffb0
        : 0xff7272,
    );
    return { x, y, size: s, valid };
  }
  drawOverlay(time: number) {
    if (!this.model.placement || !hasVillageNativeArt(this.model.placement))
      this.villageNativePresentation.preview();
    if (this.model.battle)
      this.effectTimeline.update(this.model.battle.finished ? Infinity : this.model.battle.elapsed);
    this.drawProjectiles();
    const bombTowerCues = this.drawBombTowers();
    const wizardTowerCues = this.wizardTowerPresentation.render(
      this.model.buildings.filter((v) => this.model.visibleBuilding(v)),
      this.model.battle,
      this.model.battle?.elapsed ?? this.renderClock / 1000,
      this.model.state.settings.reducedMotion,
      iso,
      AIR_LIFT,
    );
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
        const range =
          b.kind === 'inferno'
            ? b.infernoMode === 'multi'
              ? 10
              : 9
            : b.kind === 'xbow'
              ? xbowRange(b.xbowMode)
              : b.kind === 'spelltower'
                ? spellTowerRange(b) // per-weapon activation range
                : (d.trap?.trigger ?? d.range!);
        const p = iso(b.x + d.size / 2, b.y + d.size / 2);
        g.lineStyle(1, 0xffffff, 0.35);
        if (b.kind === 'airsweeper') {
          const angle = sweeperAngle(b.direction),
            x = b.x + 1,
            y = b.y + 1;
          const arc = (radius: number, reverse = false) =>
            Array.from({ length: 49 }, (_, i) => {
              const a = angle + SWEEPER.cone * ((reverse ? 48 - i : i) / 48 - 0.5);
              return iso(x + Math.cos(a) * radius, y + Math.sin(a) * radius);
            });
          const points = [...arc(range), ...arc(SWEEPER.minRange, true)];
          g.fillStyle(0xcaf8ff, 0.1).fillPoints(points, true);
          g.lineStyle(2, 0xe1fbff, 0.8).strokePoints(points, true);
          const arrow = iso(x + Math.cos(angle) * 3, y + Math.sin(angle) * 3);
          g.lineStyle(3, 0xffffff, 0.9).lineBetween(p.x, p.y, arrow.x, arrow.y);
        } else g.strokeEllipse(p.x, p.y, range * 64 * Math.SQRT2, range * 32 * Math.SQRT2);
        if (d.minRange) {
          g.lineStyle(2, 0xffc56b, 0.75);
          g.strokeEllipse(p.x, p.y, d.minRange * 64 * Math.SQRT2, d.minRange * 32 * Math.SQRT2);
        }
      }
    }
    if (this.model.wallMove) {
      this.drawGrid(g);
      const color = this.model.wallPlacementIssue ? 0xff6464 : 0x8fff73;
      for (const w of this.model.wallMove.source) diamond(w.x, w.y, 1, 0xffe8a0, 0.06);
      for (const w of this.model.wallPreview) diamond(w.x, w.y, 1, color, 0.3);
    }
    if (this.model.editing && !this.model.placement && !this.model.wallMove) this.drawGrid(g);
    if (this.model.placement) {
      this.drawGrid(g);
      // Camera motion and DOM drags can change the tile without a Phaser pointer event.
      // Resolve it once per frame for both the sprite and its placement footprint.
      const preview = this.updateGhost(this.pointerScreen());
      if (preview)
        diamond(preview.x, preview.y, preview.size, preview.valid ? 0x8fff73 : 0xff6464, 0.28);
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
      for (const cast of active.nativeSpells ?? []) {
        if (cast.firstHit - 0.9 > active.elapsed) continue;
        const row = nativeRow('spells', cast.name, cast.level);
        const radius = nativeTiles(row, 'Radius') || nativeTiles(row, 'TargetingRadius');
        if (radius <= 0.2) continue;
        const color =
          NATIVE_SPELL_COLOR[cast.name] ?? (cast.side === 'defense' ? 0xff6a5c : 0xfff0c2);
        const p = iso(cast.x, cast.y);
        const aura = cast.follow !== undefined;
        const pulse = this.model.state.settings.reducedMotion
          ? 1
          : 1 + Math.sin((active.elapsed - cast.castAt) / 0.22) * 0.03;
        g.fillStyle(color, aura ? 0.06 : 0.15);
        g.fillEllipse(p.x, p.y, radius * 128 * pulse, radius * 64 * pulse);
        g.lineStyle(aura ? 1.5 : 2, color, aura ? 0.35 : 0.75);
        g.strokeEllipse(p.x, p.y, radius * 128 * pulse, radius * 64 * pulse);
      }
      for (const aura of active.auras) {
        const p = iso(aura.x, aura.y),
          radius = SPELLS[aura.kind].radius,
          color = SPELL_COLOR[aura.kind],
          pulse = this.model.state.settings.reducedMotion
            ? 1
            : 1 + Math.sin(active.elapsed / 0.22) * 0.03;
        g.fillStyle(color, 0.17);
        g.fillEllipse(p.x, p.y, radius * 128 * pulse, radius * 64 * pulse);
        g.lineStyle(2, color, 0.75);
        g.strokeEllipse(p.x, p.y, radius * 128 * pulse, radius * 64 * pulse);
      }
    }
    this.detail.clear();
    for (const v of this.model.buildings) {
      if (v.kind === 'skeletontrap')
        this.sprites.get(v.id)?.setVisible(this.model.visibleBuilding(v));
      if (v.hp <= 0 || !this.model.visibleBuilding(v)) continue;
      const im = this.sprites.get(v.id)!;
      if (v.kind === 'skeletontrap') {
        const state = this.model.battle?.traps[v.id];
        im.setFrame(
          skeletonTrapFrame(
            v.level,
            v.skeletonMode ?? 'ground',
            state,
            this.model.battle?.elapsed ?? 0,
            this.model.state.settings.reducedMotion,
          ),
        )
          .setCrop()
          .setAlpha(1);
      }
      const nativeBounds = this.nativeBuildingBounds(v);
      if (v.upgradeEnd) {
        const start = v.upgradeStart ?? v.upgradeEnd - 15000,
          duration = Math.max(1, v.upgradeEnd - start),
          progress = (this.model.clock - start) / duration;
        this.bar(
          im.x,
          nativeBounds
            ? im.y + nativeBounds[1] - 6
            : im.y -
                im.displayHeight *
                  (['camp', 'xbow', 'darkstorage'].includes(v.kind) ? im.originY : 0.87),
          54,
          progress,
          0x82d745,
        );
        if (!nativeBounds) {
          const p = iso(v.x, v.y);
          this.detail.lineStyle(3, 0xe6b356, 0.7);
          this.detail.lineBetween(p.x - 12, p.y - 10, p.x - 12, p.y - 60);
          this.detail.lineBetween(p.x - 12, p.y - 50, p.x + 22, p.y - 65);
        }
      } else if (this.model.battle && v.hp < v.maxHp)
        this.bar(
          im.x,
          nativeBounds
            ? im.y + nativeBounds[1] - 6
            : im.y -
                im.displayHeight *
                  (['camp', 'xbow', 'darkstorage'].includes(v.kind) || isGoblinBuilding(v.npc)
                    ? im.originY
                    : 0.88),
          42,
          v.hp / v.maxHp,
          0xea654d,
        );
    }
    const battle = this.model.battle;
    if (battle?.buildingEffects && !battle.finished)
      for (const v of this.model.buildings) {
        const e = battle.buildingEffects[v.id];
        if (!e || v.hp <= 0) continue;
        const size = BUILDINGS[v.kind].size;
        const frozen = (e.frozenUntil ?? 0) > battle.elapsed;
        const rooted = (e.overgrownUntil ?? 0) > battle.elapsed;
        if (!frozen && !rooted) continue;
        const pts = [
          iso(v.x, v.y),
          iso(v.x + size, v.y),
          iso(v.x + size, v.y + size),
          iso(v.x, v.y + size),
        ];
        this.detail.fillStyle(rooted ? 0x3f9f45 : 0xa8e6ff, rooted ? 0.35 : 0.3);
        this.detail.fillPoints(pts, true);
        this.detail.lineStyle(2, rooted ? 0x2f7a33 : 0xe6f8ff, 0.9);
        this.detail.strokePoints(pts, true);
      }
    const teslaCues = this.teslaPresentation.render(
      this.model.buildings.filter((b) => this.model.visibleBuilding(b)),
      battle,
      battle?.elapsed ?? this.renderClock / 1000,
      this.model.state.settings.reducedMotion,
      iso,
      AIR_LIFT,
    );
    this.goblinBuildingPresentation.render(
      this.model.buildings,
      battle?.elapsed ?? 0,
      this.model.state.settings.reducedMotion,
      iso,
    );
    this.darkStoragePresentation.render(
      this.model.buildings,
      battle,
      this.model.state.dark,
      this.model.resourceCap('dark'),
      iso,
    );
    const xbowCues = this.xbowPresentation.render(
      this.model.buildings.filter((b) => this.model.visibleBuilding(b)),
      battle,
      battle?.elapsed ?? this.renderClock / 1000,
      this.model.state.settings.reducedMotion,
      iso,
      AIR_LIFT,
    );
    const mineCues = this.seekingMinePresentation.render(
      this.model.buildings.filter((b) => this.model.visibleBuilding(b)),
      battle,
      battle?.elapsed ?? this.renderClock / 1000,
      this.model.state.settings.reducedMotion,
      iso,
      AIR_LIFT,
    );
    const archerTowerCues = this.villageArcherTowers.render(
      battle && !battle.nativeArcherTowers
        ? []
        : this.model.buildings.filter((b) => this.model.visibleBuilding(b)),
      this.model.state.settings.reducedMotion ? 0 : (battle?.elapsed ?? this.renderClock / 1000),
      iso,
      battle?.elapsed ?? this.renderClock / 1000,
      this.model.state.settings.reducedMotion,
      battle,
      AIR_LIFT,
    );
    this.villageNativePresentation.render(
      this.model.buildings.filter(
        (b) =>
          this.model.visibleBuilding(b) && !this.model.wallMove?.source.some((w) => w.id === b.id),
      ),
      battle,
      this.model.state.settings.reducedMotion ? 0 : (battle?.elapsed ?? this.renderClock / 1000),
      iso,
      this.sprites,
    );
    this.nativeDefenses.render(
      this.model.buildings.filter((b) => this.model.visibleBuilding(b)),
      battle,
      battle?.elapsed ?? this.renderClock / 1000,
      this.model.state.settings.reducedMotion,
      iso,
      AIR_LIFT,
    );
    const drillCues = this.darkDrillPresentation.render(
      this.model.buildings.filter((b) => this.model.visibleBuilding(b)),
      this.model.state.settings.reducedMotion ? 0 : (battle?.elapsed ?? this.renderClock / 1000),
      iso,
      battle?.elapsed ?? this.renderClock / 1000,
      this.model.state.settings.reducedMotion,
      battle?.drillDestructions,
    );
    this.infernoPresentation.render(
      this.model.buildings.filter((b) => this.model.visibleBuilding(b)),
      this.model.state.settings.reducedMotion ? 0 : (battle?.elapsed ?? this.renderClock / 1000),
      battle ?? null,
      this.model.state.settings.reducedMotion,
      iso,
    );
    this.castlePresentation.render(
      this.model.buildings.filter((b) => this.model.visibleBuilding(b)),
      iso,
    );
    const cannonCues = this.cannonPresentation.render(
      this.model.buildings.filter((b) => this.model.visibleBuilding(b)),
      battle,
      battle?.elapsed ?? this.renderClock / 1000,
      this.model.state.settings.reducedMotion,
      iso,
    );
    const mortarCues = this.mortarPresentation.render(
      this.model.buildings.filter((b) => this.model.visibleBuilding(b)),
      battle,
      battle?.elapsed ?? this.renderClock / 1000,
      this.model.state.settings.reducedMotion,
      iso,
    );
    const sweeperCues = this.sweeperPresentation.render(
      this.model.buildings.filter((b) => this.model.visibleBuilding(b)),
      battle,
      battle?.elapsed ?? this.renderClock / 1000,
      this.model.state.settings.reducedMotion,
      iso,
    );
    const lateCues = this.lateCampaign.render({
      buildings: this.model.buildings.filter((b) => this.model.visibleBuilding(b)),
      battle,
      elapsed: battle?.elapsed ?? this.renderClock / 1000,
      reduced: this.model.state.settings.reducedMotion,
      iso,
      airLift: AIR_LIFT,
    });
    const shrinkCues = this.shrinkTrapPresentation.render(
      this.model.buildings.filter((b) => this.model.visibleBuilding(b)),
      battle,
      this.model.state.settings.reducedMotion,
      iso,
    );
    this.santaPresentation.render(
      battle,
      this.model.state.settings.reducedMotion,
      !document.hidden && !this.paused && !this.model.replay?.paused && !this.model.replay?.seeking,
      this.model.replay?.speed ?? 1,
      iso,
      [
        ...xbowCues,
        ...teslaCues,
        ...bombTowerCues,
        ...mineCues,
        ...wizardTowerCues,
        ...shrinkCues,
        ...sweeperCues,
        ...mortarCues,
        ...drillCues,
        ...archerTowerCues,
        ...cannonCues,
        ...garrisonSoundCues(battle),
        ...infernoSoundCues(battle),
        ...lateCues,
      ],
      this.renderClock / 1000,
    );
    if (battle && !battle.finished && !this.model.state.settings.reducedMotion) {
      for (const gust of battle.gusts ?? []) {
        const half = Math.min(
          SWEEPER.waveCone / 2,
          Math.asin(Math.min(1, SWEEPER.halfWidth / gust.radius)),
        );
        const alpha = 0.9 * Math.min(1, (SWEEPER.range - gust.radius) / 2);
        for (let trail = 0; trail < 3; trail++) {
          const radius = Math.max(1, gust.radius - trail * 0.24);
          const points = Array.from({ length: 21 }, (_, i) => {
            const a = Math.atan2(gust.directionY, gust.directionX) + half * (i / 10 - 1),
              p = iso(gust.x + Math.cos(a) * radius, gust.y + Math.sin(a) * radius);
            return new Phaser.Math.Vector2(p.x, p.y - AIR_LIFT);
          });
          this.detail.lineStyle(
            trail ? 2 : 4,
            trail ? 0x91dbe9 : 0xe4fbff,
            alpha * (1 - trail * 0.25),
          );
          this.detail.strokePoints(points, false);
        }
      }
    }
    if (battle) {
      for (const trap of battle.finished ? [] : battle.buildings) {
        const state = battle.traps[trap.id];
        const def = battleTrapStats(trap);
        if (!def || !state) continue;
        // Late campaign traps draw their own trigger and effect states.
        if (trap.npc === 'shrink-trap' || isLateBuilding(trap)) continue;
        if (trap.npc === 'santa-trap') {
          this.sprites
            .get(trap.id)
            ?.setFrame(
              santaTrapFrame(state, battle.elapsed, this.model.state.settings.reducedMotion),
            )
            .setAlpha(1);
          continue;
        }
        if (trap.npc === 'pumpkin-bomb') {
          this.sprites
            .get(trap.id)
            ?.setFrame(
              pumpkinFrame(state, battle.elapsed, this.model.state.settings.reducedMotion),
            );
          continue;
        }
        if (trap.kind === 'seekingairmine') continue;
        if (state.resolved || trap.kind === 'skeletontrap') continue;
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
            .image(0, 0, u.hero ? kingTexture('front-left') : `${u.kind}-walk`, 0)
            .setOrigin(0.5, u.hero ? KING_ART.baseline / KING_ART.cell : 122 / 128);
          if (u.hero) im.setDisplaySize(KING_ART.width, KING_ART.width);
          else im.setDisplaySize(d.width * art.displayScale, d.width * art.displayScale);
          this.unitSprites.set(u.id, im);
          const spawn = iso(u.x, u.y);
          im.setPosition(spawn.x, spawn.y - (TROOPS[u.kind].flying ? AIR_LIFT : 0));
        }
        const statusTime = u.hp <= 0 ? (u.defeatedAt ?? battle.elapsed) : battle.elapsed;
        // Local visual half-scale; health, collision space and projectile speed are unchanged.
        const shrinkScale = isShrunk(u, statusTime) ? 0.5 : 1;
        const width =
          (u.hero ? KING_ART.width : TROOPS[u.kind].width * art.displayScale) * shrinkScale;
        im.setDisplaySize(width, width).setData('shrinkScale', shrinkScale);
        const target = TROOPS[u.kind].healer
          ? battle.units.find((ally) => ally.id === u.healTarget)
          : (battle.defenders?.find((d) => d.id === u.defenderTarget && d.hp > 0) ??
            battle.buildings.find((b) => b.id === u.target));
        if (u.hero && battle.hero) {
          const king = kingPose(
            u,
            target,
            statusTime - (u.shrink?.timeLost ?? 0) - lateUnitTimeLost(u, statusTime),
            heroStats(battle.hero.level, battle.hero.townhall).rate,
            this.model.state.settings.reducedMotion,
            im.getData('kingDirection'),
          );
          im.setTexture(kingTexture(king.direction), king.frame)
            .setFlipX(false)
            .setData('kingDirection', king.direction)
            .setData('facing', king.facing);
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
          im.setData('dying', true)
            .setData('defeatedAt', at)
            .setTint(u.ejected ? 0xffe9ae : 0xa09482)
            .setTintMode(Phaser.TintModes.MULTIPLY)
            .setPosition(p.x + pose.x, p.y - (flying ? AIR_LIFT : 0) + pose.y)
            .setDepth(flying || u.ejected ? 7500 : p.y + 1)
            .setAngle(pose.angle)
            .setAlpha(pose.alpha)
            .setVisible(pose.visible);
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
        const pose = unitPose(u, target, im.getData('facing') ?? -1);
        if (!u.hero) im.setData('facing', pose.facing).setFlipX(pose.flipX);
        // Presentation shares battle time, so pause, playback speed and seeking agree.
        // Frozen late campaign attackers hold their current frame and hover phase.
        const animationTime =
          (battle.elapsed - (u.shrink?.timeLost ?? 0) - lateUnitTimeLost(u, battle.elapsed)) * 1000;
        if (!u.hero && im.texture.frameTotal > 2)
          im.setFrame(
            sprung || (!pose.moving && !flying) || this.model.state.settings.reducedMotion
              ? art.idleFrame
              : Math.floor(animationTime / art.frameMs + u.id) % 4,
          );
        const nativeEffects = u.native?.effects;
        const frozen = lateUnitFrozen(u, battle.elapsed);
        if (frozen) im.setTint(FROZEN_TINT);
        else if (nativeEffects && (nativeEffects.frozenUntil ?? 0) > battle.elapsed)
          im.setTint(0xa8e6ff);
        else if (nativeEffects?.poison && nativeEffects.poison.until > battle.elapsed)
          im.setTint(0xa6e57a);
        else if ((u.spellRageUntil ?? 0) > battle.elapsed) im.setTint(0xf2b3ff);
        else if (
          (u.hero && (battle.hero?.rageUntil ?? 0) > battle.elapsed) ||
          (u.summoned && (u.rageUntil ?? 0) > battle.elapsed)
        )
          im.setTint(0xffbd76);
        else im.clearTint();
        // Frozen late campaign attackers brighten toward ice; other tints multiply as before.
        im.setTintMode(frozen ? Phaser.TintModes.SCREEN : Phaser.TintModes.MULTIPLY);
        const p = iso(u.x, u.y),
          motion =
            sprung || u.hero || this.model.state.settings.reducedMotion
              ? 0
              : flying
                ? Math.sin(animationTime / 600 + u.id) * 2.2
                : pose.moving
                  ? Math.sin(animationTime / 80 + u.id) * art.bob
                  : 0;
        const lift = flying ? AIR_LIFT : springLift;
        // Air troops draw above every rooftop, with a shadow left on the ground.
        im.setPosition(p.x, p.y + motion - lift)
          .setDepth(flying || sprung ? 7500 : p.y + 1)
          .setData('springLift', springLift);
        if (flying || sprung) {
          this.detail.fillStyle(0x1f2a16, 0.28);
          this.detail.fillEllipse(p.x, p.y, 26 * shrinkScale, 13 * shrinkScale);
        }
        const rate =
          u.hero && battle.hero
            ? heroStats(battle.hero.level, battle.hero.townhall).rate
            : TROOPS[u.kind].rate;
        const phase = 1 - Math.max(0, u.cooldown) / rate;
        const impulse =
          !u.hero && u.attacking && phase < 0.28 && !this.model.state.settings.reducedMotion
            ? Math.sin((phase / 0.28) * Math.PI)
            : 0;
        const facing = pose.facing;
        im.setX(p.x + facing * impulse * 4).setAngle(flying ? impulse * 4 : facing * impulse * 9);
        if (u.hp < u.maxHp)
          this.bar(
            p.x,
            p.y - lift - (u.hero ? KING_ART.healthHeight * shrinkScale : im.displayHeight),
            22,
            u.hp / u.maxHp,
            0x8dea68,
          );
      }
    }
    this.troopNativePresentation.render(
      battle,
      this.model.state.settings.reducedMotion,
      iso,
      AIR_LIFT,
      this.unitSprites,
    );
    this.drawDefenders();
  }
  private drawDefenders() {
    const markers = this.defenderMarkers.clear();
    const battle = this.model.battle,
      reduced = this.model.state.settings.reducedMotion;
    this.garrisonPresentation.render(battle, reduced, iso, AIR_LIFT);
    const defenders = battle?.defenders ?? [];
    for (const [id, sprite] of this.defenderSprites)
      if (!defenders.some((d) => d.id === id)) {
        sprite.destroy();
        this.defenderSprites.delete(id);
      }
    for (const d of defenders) {
      if (isGarrisonDefender(d)) {
        if (battle!.elapsed >= d.spawnedAt && d.hp > 0) {
          const point = iso(d.x, d.y);
          // Garrison families: source-graph bar height; air lift only for flying troops.
          const stats = garrisonStats(d.kind, d.level);
          this.bar(
            point.x,
            point.y - (stats.flying ? AIR_LIFT : 0) - characterBarHeight(stats.animation),
            28,
            d.hp / d.maxHp,
            0xea654d,
            markers,
          );
        }
        continue;
      }
      const flying = d.mode === 'air',
        width = flying ? 68 : 40,
        p = iso(d.x, d.y),
        stats = skeletonStats(d.mode, d.kind === 'skeleton' ? d.spawnLevel : undefined);
      let sprite = this.defenderSprites.get(d.id);
      if (!sprite) {
        sprite = this.add
          .image(0, 0, `skeleton-${d.mode}`, 0)
          .setOrigin(0.5, 0.875)
          .setDisplaySize(width, width)
          .setData('defender', d.id);
        this.defenderSprites.set(d.id, sprite);
      }
      const target = battle!.units.find((u) => u.id === d.target && u.hp > 0),
        waypoint = d.path[0];
      const heading = d.attacking || flying ? target : (waypoint ?? target);
      const dx = heading ? heading.x - d.x - (heading.y - d.y) : 0,
        facing = Math.abs(dx) > 0.03 ? Math.sign(dx) : (sprite.getData('facing') ?? -1);
      sprite
        .setData('facing', facing)
        .setFlipX(facing > 0)
        .setAngle(0)
        .setAlpha(1)
        .setVisible(true)
        .setDepth(flying ? 7500 : p.y + 1.1)
        .clearTint();
      if (d.hp <= 0) {
        const pose = defeatPose(
          battle!.finished ? Infinity : battle!.elapsed - (d.defeatedAt ?? battle!.elapsed),
          flying ? 'air' : 'ground',
          facing,
          reduced,
          AIR_LIFT,
        );
        sprite
          .setPosition(p.x + pose.x, p.y - (flying ? AIR_LIFT : 0) + pose.y)
          .setAngle(pose.angle)
          .setAlpha(pose.alpha)
          .setVisible(pose.visible)
          .setTint(0xa09482);
        continue;
      }
      const moving = !!target && !d.attacking && battle!.elapsed >= d.spawnedAt + 0.5;
      const phase = stats.rate - d.cooldown;
      const frame =
        reduced || battle!.finished
          ? 1
          : d.attacking && phase < 0.15
            ? 5
            : d.attacking && d.cooldown < 0.14
              ? 4
              : moving
                ? Math.floor(battle!.elapsed / 0.11 + Math.abs(d.id)) % 4
                : 1;
      const jumping =
        !flying &&
        battle!.buildings.some(
          (b) =>
            b.kind === 'wall' && b.hp > 0 && Math.floor(d.x) === b.x && Math.floor(d.y) === b.y,
        );
      const lift = flying ? AIR_LIFT : jumping && !reduced ? 9 : 0;
      sprite
        .setFrame(frame)
        .setPosition(p.x, p.y - lift)
        .setDepth(flying ? 7500 : p.y + 1.1);
      if (flying) {
        this.detail.fillStyle(0x1f2a16, 0.25).fillEllipse(p.x, p.y, 16, 8);
      }
      this.bar(p.x, p.y - lift - width * 0.9, 22, d.hp / d.maxHp, 0xea654d, markers);
      const sy = p.y - lift - width * 0.9;
      markers
        .fillStyle(0xfff0d0)
        .fillCircle(p.x - 17, sy - 1, 3)
        .fillRect(p.x - 19, sy + 1, 4, 3);
      markers
        .fillStyle(0x594739)
        .fillCircle(p.x - 18, sy - 1, 0.7)
        .fillCircle(p.x - 16, sy - 1, 0.7);
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
  bar(x: number, y: number, w: number, p: number, color: number, graphics = this.detail) {
    graphics.fillStyle(0x292920, 0.8);
    graphics.fillRoundedRect(x - w / 2 - 2, y - 2, w + 4, 7, 3);
    graphics.fillStyle(color);
    graphics.fillRoundedRect(x - w / 2, y, Math.max(0, w * p), 3, 1);
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
    // Native defense effects carry their own geometry; record them before the drawn fallbacks.
    if (fx.type === 'defense-zap' || fx.type === 'impact' || fx.type === 'blast')
      this.nativeDefenses.note(fx, this.model.battle, iso, AIR_LIFT);
    if (
      fx.type === 'defense-zap' &&
      this.nativeDefenses.covers(
        this.model.battle?.buildings.find((b) => b.id === fx.sourceId)?.kind,
      )
    )
      return;
    if (fx.weapon === 'native' && (fx.type === 'projectile' || fx.type === 'impact')) {
      if (fx.type === 'projectile') this.drawProjectiles();
      if (this.nativeProjectiles.covers(fx.projectileId)) return;
    }
    if (
      fx.type === 'seekingairmine-pickup' ||
      fx.type === 'seekingairmine-place' ||
      fx.type === 'seekingairmine-cancel'
    ) {
      if (this.model.battle) return;
      this.seekingMinePresentation.handling(
        fx.sourceId!,
        fx.type === 'seekingairmine-pickup'
          ? 'pickup'
          : fx.type === 'seekingairmine-place'
            ? 'place'
            : 'cancel',
        this.renderClock / 1000,
        fx.x,
        fx.y,
      );
      if (fx.type !== 'seekingairmine-cancel' && this.audio.enabled) this.audio.unlock();
      return;
    }
    if (
      (fx.type === 'trap' || fx.type === 'blast') &&
      this.model.battle?.buildings.find((b) => b.id === fx.sourceId)?.kind === 'seekingairmine'
    )
      return;
    if (
      fx.type === 'destroy' &&
      fx.sourceId !== undefined &&
      (this.model.battle?.drillDestructions?.[fx.sourceId] ||
        this.model.battle?.archerTowerDestructions?.[fx.sourceId])
    ) {
      this.lastRevision = -1;
      return;
    }
    if (
      fx.type === 'archertower-pickup' ||
      fx.type === 'archertower-place' ||
      fx.type === 'archertower-cancel'
    ) {
      if (this.model.battle) return;
      this.villageArcherTowers.handling(
        fx.sourceId!,
        fx.type === 'archertower-pickup'
          ? 'pickup'
          : fx.type === 'archertower-place'
            ? 'place'
            : 'cancel',
        this.renderClock / 1000,
        fx.x,
        fx.y,
      );
      if (fx.type !== 'archertower-cancel' && this.audio.enabled) this.audio.unlock();
      return;
    }
    if (
      fx.type === 'darkdrill-pickup' ||
      fx.type === 'darkdrill-place' ||
      fx.type === 'darkdrill-cancel'
    ) {
      if (this.model.battle) return;
      this.darkDrillPresentation.handling(
        fx.sourceId!,
        fx.type === 'darkdrill-pickup'
          ? 'pickup'
          : fx.type === 'darkdrill-place'
            ? 'place'
            : 'cancel',
        this.renderClock / 1000,
        fx.x,
        fx.y,
      );
      if (fx.type !== 'darkdrill-cancel' && this.audio.enabled) this.audio.unlock();
      return;
    }
    if (fx.type === 'tesla-pickup' || fx.type === 'tesla-place' || fx.type === 'tesla-cancel') {
      if (this.model.battle) return;
      this.teslaPresentation.handling(
        fx.sourceId!,
        fx.type === 'tesla-pickup' ? 'pickup' : fx.type === 'tesla-place' ? 'place' : 'cancel',
        this.renderClock / 1000,
        fx.x,
        fx.y,
      );
      if (fx.type !== 'tesla-cancel' && this.audio.enabled) this.audio.unlock();
      return;
    }
    if (
      fx.type === 'bombtower-pickup' ||
      fx.type === 'bombtower-place' ||
      fx.type === 'bombtower-cancel'
    ) {
      if (this.model.battle) return;
      this.bombTowerPresentation.handling(
        fx.sourceId!,
        fx.type === 'bombtower-pickup'
          ? 'pickup'
          : fx.type === 'bombtower-place'
            ? 'place'
            : 'cancel',
        this.renderClock / 1000,
        fx.x,
        fx.y,
      );
      if (fx.type !== 'bombtower-cancel' && this.audio.enabled) this.audio.unlock();
      return;
    }
    if (
      (fx.weapon === 'towerbomb' || fx.weapon === 'arcane') &&
      ['projectile', 'impact', 'blast', 'destroy'].includes(fx.type)
    ) {
      if (fx.type === 'destroy') this.lastRevision = -1;
      return;
    }
    if (
      fx.type === 'wizardtower-pickup' ||
      fx.type === 'wizardtower-place' ||
      fx.type === 'wizardtower-cancel'
    ) {
      if (this.model.battle) return;
      this.wizardTowerPresentation.handling(
        fx.sourceId!,
        fx.type === 'wizardtower-pickup'
          ? 'pickup'
          : fx.type === 'wizardtower-place'
            ? 'place'
            : 'cancel',
        this.renderClock / 1000,
        fx.x,
        fx.y,
      );
      if (fx.type !== 'wizardtower-cancel' && this.audio.enabled) this.audio.unlock();
      return;
    }
    if (
      fx.type === 'airsweeper-pickup' ||
      fx.type === 'airsweeper-place' ||
      fx.type === 'airsweeper-cancel'
    ) {
      if (this.model.battle) return;
      this.sweeperPresentation.handling(
        fx.sourceId!,
        fx.type === 'airsweeper-pickup'
          ? 'pickup'
          : fx.type === 'airsweeper-place'
            ? 'place'
            : 'cancel',
        this.renderClock / 1000,
        fx.x,
        fx.y,
      );
      if (fx.type !== 'airsweeper-cancel' && this.audio.enabled) this.audio.unlock();
      return;
    }
    if (fx.type === 'cannon-pickup' || fx.type === 'cannon-place' || fx.type === 'cannon-cancel') {
      if (this.model.battle) return;
      this.cannonPresentation.handling(
        fx.sourceId!,
        fx.type === 'cannon-pickup' ? 'pickup' : fx.type === 'cannon-place' ? 'place' : 'cancel',
        this.renderClock / 1000,
        fx.x,
        fx.y,
      );
      if (fx.type !== 'cannon-cancel' && this.audio.enabled) this.audio.unlock();
      return;
    }
    if (fx.type === 'mortar-pickup' || fx.type === 'mortar-place' || fx.type === 'mortar-cancel') {
      if (this.model.battle) return;
      this.mortarPresentation.handling(
        fx.sourceId!,
        fx.type === 'mortar-pickup' ? 'pickup' : fx.type === 'mortar-place' ? 'place' : 'cancel',
        this.renderClock / 1000,
        fx.x,
        fx.y,
      );
      if (fx.type !== 'mortar-cancel' && this.audio.enabled) this.audio.unlock();
      return;
    }
    if (
      fx.type === 'destroy' &&
      this.model.buildings.some(
        (b) =>
          b.id === fx.sourceId &&
          (b.kind === 'airsweeper' || b.kind === 'mortar' || (b.kind === 'cannon' && !b.npc)),
      )
    ) {
      this.lastRevision = -1;
      return;
    }
    const p = iso(fx.x, fx.y);
    if (fx.type === 'quake') {
      this.combatEffects.quake(p, fx.radius ?? 8, this.model.state.settings.reducedMotion);
      this.audio.play('hit');
      return;
    }
    if (fx.type === 'tesla-zap' || fx.type === 'tesla-reveal') return;
    if (fx.type === 'gust') return;
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
    if (fx.type === 'spell-native') {
      if (this.model.state.settings.reducedMotion) return;
      const color = NATIVE_SPELL_COLOR[fx.text ?? ''] ?? 0xfff0c2;
      const radius = Math.max(0.6, fx.radius ?? 1) * 64;
      const ring = this.add
        .ellipse(p.x, p.y, radius * 0.5, radius * 0.25)
        .setStrokeStyle(3, color, 0.9)
        .setDepth(7200);
      this.animateEffect({
        targets: ring,
        scaleX: 4,
        scaleY: 4,
        alpha: 0,
        duration: 420,
        onComplete: () => ring.destroy(),
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
      if (fx.spell === 'lightning') {
        const bolt = this.add.graphics().setPosition(p.x, p.y).setDepth(7300);
        bolt.setData('spell', 'lightning');
        const paths = [
          [
            [-18, -310],
            [9, -251],
            [-10, -229],
            [21, -175],
            [-6, -146],
            [12, -93],
            [-9, -63],
            [0, 0],
          ],
          [
            [-10, -229],
            [-42, -199],
            [-25, -185],
            [-55, -150],
          ],
          [
            [12, -93],
            [40, -72],
            [27, -56],
            [48, -33],
          ],
        ];
        for (const [width, tint, alpha] of [
          [11, color, 0.16],
          [5, color, 0.9],
          [2, 0xffffff, 1],
        ]) {
          bolt.lineStyle(width, tint, alpha);
          for (const points of paths) {
            bolt.beginPath().moveTo(points[0][0], points[0][1]);
            for (const [x, y] of points.slice(1)) bolt.lineTo(x, y);
            bolt.strokePath();
          }
        }
        this.animateEffect({
          targets: bolt,
          alpha: 0,
          duration: 260,
          onComplete: () => bolt.destroy(),
        });
      }
      this.sparks(p.x, p.y - 20, color, 16);
      this.audio.play(fx.spell === 'lightning' ? 'destroy' : 'collect');
      if (fx.spell === 'lightning' && !this.model.state.settings.reducedMotion)
        this.cameras.main.shake(140, 0.0022);
      return;
    }
    if (fx.type === 'blast' && fx.weapon === 'cannonball') return;
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
    if (fx.type === 'mortar-fire') return;
    if (
      fx.weapon === 'cannonball' &&
      (fx.type === 'projectile' || fx.type === 'impact') &&
      this.model.buildings.some((b) => b.id === fx.sourceId && b.kind === 'cannon' && !b.npc)
    )
      return;
    if (fx.type === 'breath') {
      const { from, to } = this.projectileAnchors(fx);
      this.combatEffects.breath(from, to, this.model.state.settings.reducedMotion);
      this.audio.play('hit');
      return;
    }
    if (fx.weapon === 'xbowbolt' && (fx.type === 'projectile' || fx.type === 'impact')) return;
    if (
      fx.type === 'impact' &&
      this.model.battle?.archerTowerHits?.some((hit) => hit.id === fx.projectileId)
    )
      return;
    if (fx.type === 'projectile' && fx.projectileId) {
      this.drawProjectiles();
      if (!this.model.state.settings.reducedMotion)
        this.combatEffects.muzzle(fx.weapon!, this.projectileAnchors(fx).from);
      return;
    }
    if (
      (fx.type === 'projectile' || fx.type === 'impact' || fx.type === 'hit') &&
      fx.toX !== undefined
    ) {
      const { from, to } = this.projectileAnchors(fx);
      const reduced = this.model.state.settings.reducedMotion;
      if (fx.type === 'impact' && fx.weapon === 'bomb' && fx.radius)
        this.combatEffects.groundBlast(iso(fx.toX, fx.toY!), fx.radius, reduced, fx.weapon);
      else if (fx.type === 'impact') this.combatEffects.impact(fx.weapon!, to, reduced);
      else if (fx.type === 'hit') {
        const originalGarrison =
          fx.sourceDefender &&
          this.model.battle?.defenders?.some((d) => d.id === fx.sourceId && d.kind === 'balloon');
        if (!originalGarrison) this.combatEffects.impact('melee', to, reduced);
      } else
        this.combatEffects.projectile(
          fx.weapon ?? (fx.color === 0xff9c37 ? 'fireball' : 'cannonball'),
          from,
          to,
          reduced,
        );
      const nativeGarrison =
        fx.sourceDefender &&
        this.model.battle?.defenders?.some((d) => d.id === fx.sourceId && d.kind !== 'skeleton');
      if (!nativeGarrison && fx.weapon !== 'healing' && Math.random() < 0.2) this.audio.play('hit');
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
        x:
          canvas.left +
          (((sx - c.scrollX - c.width / 2) * c.zoomX + c.width / 2) * canvas.width) /
            this.scale.width,
        y:
          canvas.top +
          (((sy - c.scrollY - c.height / 2) * c.zoomY + c.height / 2) * canvas.height) /
            this.scale.height,
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
    if (fx.weapon === 'towerbomb') return { from: bombTowerMuzzle(p, q), to: { x: q.x, y: q.y } };
    const source =
      fx.sourceId == null
        ? undefined
        : fx.sourceDefender
          ? this.defenderSprites.get(fx.sourceId)
          : fx.targetBuilding || fx.targetDefender || fx.weapon === 'healing'
            ? this.unitSprites.get(fx.sourceId)
            : this.sprites.get(fx.sourceId);
    const target =
      fx.targetId == null
        ? undefined
        : fx.targetDefender
          ? this.defenderSprites.get(fx.targetId)
          : fx.targetBuilding
            ? this.sprites.get(fx.targetId)
            : this.unitSprites.get(fx.targetId);
    const fromY =
      p.y -
      (fx.fromAir
        ? AIR_LIFT + 6
        : source && !fx.targetBuilding && !fx.targetDefender && !fx.sourceDefender
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
              : target.displayHeight * (fx.targetDefender && fx.toAir ? 0.24 : 0.48)
            : 15));
    const bodyMuzzle =
      fx.type === 'breath'
        ? { forward: 0.32, height: 0.27 }
        : fx.weapon === 'healing'
          ? { forward: 0.25, height: 0.37 }
          : null;
    const facing = Math.sign(q.x - p.x) || source?.getData('facing') || 1;
    const from =
      source && bodyMuzzle
        ? {
            x: p.x + facing * source.displayWidth * bodyMuzzle.forward,
            y: p.y - AIR_LIFT - source.displayHeight * bodyMuzzle.height,
          }
        : { x: p.x, y: fromY };
    return { from, to: { x: q.x, y: toY } };
  }

  private drawProjectiles() {
    const b = this.model.battle;
    this.archerTowerProjectiles.render(
      b ?? null,
      this.model.state.settings.reducedMotion,
      iso,
      (p) => iso(p.x, p.y).y - this.projectileAnchors(projectileEffect(p, 'projectile')).to.y,
    );
    // Original client flight art, trails and impact effects; drawn shots keep the fallback.
    const native = this.nativeProjectiles.render(
      b ?? null,
      this.model.state.settings.reducedMotion,
      iso,
      AIR_LIFT,
    );
    const shots =
      !b || b.finished || this.model.state.settings.reducedMotion
        ? []
        : (b.projectiles ?? []).filter(
            (p) =>
              !native.has(p.id) &&
              p.weapon !== 'xbowbolt' &&
              p.weapon !== 'towerbomb' &&
              p.weapon !== 'arcane' &&
              !(p.weapon === 'arrow' && p.variant !== undefined && p.flight) &&
              !(
                p.weapon === 'cannonball' &&
                b.buildings.some(
                  (tower) => tower.id === p.sourceId && tower.kind === 'cannon' && !tower.npc,
                )
              ),
          );
    this.combatEffects.retainProjectiles(new Set(shots.map((p) => p.id)));
    for (const p of shots) {
      const { from, to } = this.projectileAnchors(projectileEffect(p, 'projectile'));
      const progress = Phaser.Math.Clamp((b!.elapsed - p.launched) / (p.impact - p.launched), 0, 1);
      this.combatEffects.poseProjectile(p.id, p.weapon, from, to, progress);
    }
  }
  private drawBombTowers() {
    return this.bombTowerPresentation.render(
      this.model.buildings.filter((v) => this.model.visibleBuilding(v)),
      this.model.battle,
      this.model.battle?.elapsed ?? this.renderClock / 1000,
      this.model.state.settings.reducedMotion,
      iso,
    );
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
    // A battle waiting for late campaign art keeps its clock, replay and deployments on hold.
    this.tick = this.lateAssetsPending() ? 0 : this.tick + dt;
    while (this.tick >= 0.05) {
      this.model.step(0.05);
      this.tick -= 0.05;
    }
    if (this.lastRevision !== this.model.revision) this.sync();
    if (this.model.battle)
      for (const b of this.model.battle.buildings) {
        const im = this.sprites.get(b.id);
        if (
          im &&
          b.hp <= 0 &&
          (b.kind === 'tesla'
            ? !im.getData('nativeTeslaRuin')
            : b.kind === 'bombtower'
              ? !im.getData('nativeBombTowerRuin')
              : b.kind === 'wizardtower'
                ? !im.getData('nativeWizardTowerRuin')
                : b.kind === 'airsweeper'
                  ? !im.getData('nativeSweeperRuin')
                  : b.kind === 'cannon' && !b.npc
                    ? !im.getData('nativeCannonRuin')
                    : b.kind === 'mortar'
                      ? !im.getData('nativeMortarRuin')
                      : !im.texture.key.startsWith('ruins-'))
        ) {
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
      c = this.cameras.main,
      rect = this.scale.canvasBounds;
    // Refresh after programmatic pan/zoom and use the same shaken transform as picking.
    c.preRender();
    const projected = c.matrixCombined.transformPoint(p.x, p.y);
    return {
      x: rect.left + projected.x / this.scale.displayScale.x,
      y: rect.top + projected.y / this.scale.displayScale.y,
    };
  }
}
