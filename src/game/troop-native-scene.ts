import { isPetUnitKind } from './native-units';
import { nativeMiteJump } from './native-mite-jumps';
import { cancelImageDecodes } from './cancel-image-decodes';
import type Phaser from 'phaser';
import { TROOPS, type TroopKind } from './data';
import type { Battle, Building } from './model';
import { nativeScenePosesShared, nativeSceneLocator, type NativeMeshGraph } from './native-mesh';
import { nativeTroopFacingTarget } from './native-troop-facing';
import { nativeMeshTexture } from './native-mesh-scene';
import { NativeSceneView } from './native-scene-view';
import type { NativeScenePose } from './native-mesh';
import { unitAttackIntervalScale } from './native-status';
import { isShrunk } from './shrink-trap';
import { buildingIndex } from './battle-index';
import { unitDepth } from './unit-depth';
import { NATIVE_ADDITIVE_TINT_MODE } from './native-tint-modes';
import { UnitMotionTracker, unitAnimationPhase } from './unit-motion';
import {
  TINT_MULTIPLY,
  combineTint,
  unitAnimationClock,
  unitStatusTint,
  type UnitStatusTint,
} from './unit-status-tint';
interface State {
  scene: string;
  exports: string[];
  scale: number;
  actionFrame: number;
  loop: boolean;
}
interface Pack {
  levels: { level: number; states: Record<string, State> }[];
  scenes: Record<string, NativeMeshGraph>;
  /** Rows by level (first match, as `find` returned), built when the pack is decoded. */
  byLevel?: Map<number, Pack['levels'][number]>;
}
interface LevelRequest {
  pack: Pack;
  images: Set<HTMLImageElement>;
}
interface TroopView {
  kind: string;
  scene: string;
  view: NativeSceneView;
  /** Clip state drawn by the last full render: walk, idle, attack or die. */
  state: string;
  /** Origin and depth of the last render, for LOD position following. */
  x: number;
  y: number;
  depth: number;
  /** Object count when the view was last tagged with its unit id. */
  tagged: number;
  /** The last shared sample drawn, so an unchanged source frame skips the shared-cache lookup. */
  sample?: {
    graph: NativeMeshGraph;
    name: string;
    frame: number;
    scale: number;
    mirror: number;
    poses: readonly NativeScenePose[];
    attachments?: Record<string, { x: number; y: number } | undefined>;
  };
}
/** Source direction roots and native clip timing follow the deterministic battle clock. */
// Viewport culling skips mesh work for off-screen units. LOD keeps distant units visible: their
// kept views resample the pose at a reduced, staggered rate and otherwise only follow the unit.
const CULL_MARGIN = 300;
const CULL_MARGIN_KEPT = 420;
const LOD_UNIT_THRESHOLD = 180;
const LOD_RADIUS_FRACTION = 0.55;
const LOD_RADIUS_MIN = 560;
const LOD_HYSTERESIS = 1.25;
/** Density-independent view zoom (CSS pixels per world pixel) below which LOD may apply. */
const LOD_CLOSE_ZOOM = 1.15;
/** Distant units resample their pose every Nth frame (staggered by id). */
const LOD_RESAMPLE_EVERY = 4;
export class TroopNativePresentation {
  private packs = new Map<string, Pack>();
  private pending = new Map<string, AbortController>();
  private packRetryAt = new Map<string, number>();
  /**
   * Levels whose textures are uploaded, by kind, and level loads in flight. A paged pack (see
   * scripts/native-pages.mjs) tags each page with the levels that draw it, so a Level 1
   * Barbarian uploads its own art rather than all thirteen levels'.
   */
  private levelsReady = new Map<string, Set<number>>();
  private pendingLevels = new Map<string, LevelRequest>();
  private levelRetryAt = new Map<string, number>();
  private views = new Map<number, TroopView>();
  private motion = new UnitMotionTracker();
  private facings = new Map<number, { dx: number; dy: number }>();
  private alive = true;
  /** Frames rendered, for staggering reduced-rate LOD resampling across units. */
  private frame = 0;
  private wanted = new Set<number>();
  private present = new Set<number>();
  private point = { x: 0, y: 0 };
  /** Units drawn from a kept pose this frame (LOD), for probes. */
  lodFrozen = 0;
  constructor(private scene: Phaser.Scene) {}
  /** Prefetch packs and level pages for the carried army when it changes, not on first deploy. */
  prefetch(kinds: Iterable<string>, levelOf: (kind: string) => number) {
    for (const kind of kinds) void this.load(kind).then(() => this.loadLevel(kind, levelOf(kind)));
  }
  private async decodeTexture(
    key: string,
    path: string,
    current: () => boolean,
    images: Set<HTMLImageElement>,
  ) {
    if (!current() || this.scene.textures.exists(key)) return;
    // Keep a top-down image source, as Phaser's loader does. ImageBitmap uploads ignore
    // WebGL's UNPACK_FLIP_Y_WEBGL and UNPACK_PREMULTIPLY_ALPHA_WEBGL flags: the old fast
    // path sampled unrelated atlas regions, leaving troops as disconnected body fragments.
    // decode() still completes asynchronously, and the retained image also works for color
    // bakes and context restoration without a second, flipped copy of the texture page.
    const image = new Image();
    images.add(image);
    try {
      image.src = '/' + path;
      await image.decode();
      if (current() && !this.scene.textures.exists(key)) this.scene.textures.addImage(key, image);
    } finally {
      images.delete(image);
    }
  }
  private async load(kind: string) {
    if (!this.alive || this.pending.has(kind) || this.packs.has(kind)) return;
    if ((this.packRetryAt.get(kind) ?? 0) > performance.now()) return;
    const request = new AbortController();
    this.pending.set(kind, request);
    const current = () => this.alive && this.pending.get(kind) === request;
    try {
      const response = await fetch(`/assets/troops-native/${kind}/graph.json`, {
        signal: request.signal,
      });
      if (!current()) return;
      if (!response.ok) throw Error(`HTTP ${response.status}`);
      const pack = (await response.json()) as Pack;
      if (current()) {
        this.packs.set(kind, pack);
        this.packRetryAt.delete(kind);
      }
    } catch (error) {
      if (current()) {
        this.packRetryAt.set(kind, performance.now() + 5000);
        console.error('Native troop animation', kind, error);
      }
    } finally {
      if (this.pending.get(kind) === request) this.pending.delete(kind);
    }
  }
  /** Upload the pages one level of a loaded pack draws. */
  private async loadLevel(kind: string, level: number) {
    const pack = this.packs.get(kind);
    const job = `${kind}#${level}`;
    if (
      !this.alive ||
      !pack ||
      this.pendingLevels.has(job) ||
      this.levelsReady.get(kind)?.has(level)
    )
      return;
    if ((this.levelRetryAt.get(job) ?? 0) > performance.now()) return;
    const request: LevelRequest = { pack, images: new Set() };
    this.pendingLevels.set(job, request);
    const current = () =>
      this.alive && this.packs.get(kind) === pack && this.pendingLevels.get(job) === request;
    try {
      await Promise.all(
        Object.entries(pack.scenes).flatMap(([name, g]) =>
          Object.entries(g.textures)
            .filter(([, t]) => !t.levels || t.levels.includes(level))
            .map(([id, t]) =>
              this.decodeTexture(
                nativeMeshTexture(`troop:${kind}:${name}`, id),
                t.path,
                current,
                request.images,
              ),
            ),
        ),
      );
      if (current()) {
        if (!this.levelsReady.has(kind)) this.levelsReady.set(kind, new Set());
        this.levelsReady.get(kind)!.add(level);
      }
    } catch (error) {
      if (current()) {
        this.levelRetryAt.set(job, performance.now() + 5000);
        console.error('Native troop animation', job, error);
      }
    } finally {
      this.cancelLevel(job, request);
    }
  }
  private cancelLevel(job: string, request: LevelRequest) {
    if (this.pendingLevels.get(job) === request) this.pendingLevels.delete(job);
    // These images have not reached the texture manager. Retained textures keep their
    // decoded source for rendering and context restoration.
    cancelImageDecodes(request.images);
  }
  clear() {
    for (const { view } of this.views.values()) view.destroy();
    this.views.clear();
    this.motion.clear();
    this.facings.clear();
  }
  /**
   * Drop decoded packs (and their GPU textures) for kinds outside `keep`.
   * Loaded textures otherwise accumulate forever across battles. Kept kinds
   * reload through the existing prefetch path; dropped views are already gone.
   */
  releaseExcept(keep?: ReadonlySet<string>) {
    for (const [kind, request] of this.pending)
      if (!keep?.has(kind)) {
        this.pending.delete(kind);
        request.abort();
      }
    const retained = new Set<string>();
    for (const [kind, pack] of this.packs)
      if (keep?.has(kind))
        for (const [name, graph] of Object.entries(pack.scenes))
          for (const id of Object.keys(graph.textures))
            retained.add(nativeMeshTexture(`troop:${kind}:${name}`, id));
    for (const [kind, pack] of this.packs) {
      if (keep?.has(kind)) continue;
      for (const [name, graph] of Object.entries(pack.scenes))
        for (const id of Object.keys(graph.textures)) {
          const key = nativeMeshTexture(`troop:${kind}:${name}`, id);
          if (!retained.has(key) && this.scene.textures.exists(key))
            this.scene.textures.remove(key);
        }
      this.packs.delete(kind);
      this.levelsReady.delete(kind);
      for (const [job, request] of this.pendingLevels)
        if (request.pack === pack) this.cancelLevel(job, request);
    }
  }
  destroy() {
    this.alive = false;
    for (const request of this.pending.values()) request.abort();
    this.pending.clear();
    for (const [job, request] of this.pendingLevels) this.cancelLevel(job, request);
    this.clear();
  }
  /** Whether this unit's native mesh drew this frame (scene.ts skips its fallback marker). */
  drewUnit(id: number) {
    const objects = this.views.get(id)?.view.objects;
    if (!objects) return false;
    for (let i = 0; i < objects.length; i++) if (objects[i].visible) return true;
    return false;
  }
  /**
   * Whether a native view stands in for this unit: it drew or followed the unit last frame and
   * hides the fallback sprite every frame it exists, so the sprite needs no styling meanwhile.
   */
  hasView(id: number) {
    return this.views.has(id);
  }
  /** World point of a named locator in the exact pose retained by this unit's body. */
  attachment(id: number, name: string) {
    const owned = this.views.get(id);
    const sample = owned?.sample;
    if (!owned || !sample || !this.drewUnit(id)) return undefined;
    const attachments = (sample.attachments ??= {});
    if (!Object.hasOwn(attachments, name)) {
      const fps = sample.graph.clips[sample.graph.exports[sample.name]]?.fps ?? 1;
      const matrix = nativeSceneLocator(sample.graph, sample.name, sample.frame / fps, name, {}, [
        sample.scale * sample.mirror,
        0,
        0,
        0,
        sample.scale,
        0,
      ]);
      attachments[name] = matrix ? { x: matrix[2], y: matrix[5] } : undefined;
    }
    const point = attachments[name];
    return point ? { x: owned.x + point.x, y: owned.y + point.y } : undefined;
  }
  render(
    battle: Battle | null,
    reduced: boolean,
    iso: (x: number, y: number) => { x: number; y: number },
    lift: number,
    sprites: Map<number, Phaser.GameObjects.Image>,
    /** Optional prebuilt id index of `battle.buildings` (otherwise built once per sim step). */
    buildingById?: ReadonlyMap<number, Building>,
    /** Allocation-free `iso`: projects into a scratch point the loop reads before its next call. */
    projectInto?: (out: { x: number; y: number }, x: number, y: number) => void,
    /** Presentation detail (RenderDetail): reduced levels widen and strengthen the LOD. */
    detail = 0,
  ) {
    this.frame++;
    const scratch = this.point;
    this.lodFrozen = 0;
    const wanted = this.wanted;
    const present = this.present;
    wanted.clear();
    present.clear();
    const buildings = buildingById ?? (battle ? buildingIndex(battle) : undefined);
    const cam = this.scene.cameras?.main as
      | {
          worldView?: { centerX: number; centerY: number; width: number; height: number };
          zoom?: number;
          zoomX?: number;
          zoomY?: number;
        }
      | undefined;
    const view = cam?.worldView;
    const culling = !!view;
    const cx = view?.centerX ?? 0;
    const cy = view?.centerY ?? 0;
    const hw = (view?.width ?? 0) / 2;
    const hh = (view?.height ?? 0) / 2;
    const total = battle?.units.length ?? 0;
    // LOD follows the density-independent view zoom, so retina and standard displays agree.
    // Reduced detail applies it at any zoom, with a smaller close radius (none at level 2).
    const lodActive =
      culling &&
      (detail > 0 || (total > LOD_UNIT_THRESHOLD && this.viewZoom(cam) < LOD_CLOSE_ZOOM));
    const lodRadius = !lodActive
      ? 0
      : detail >= 2
        ? 0
        : Math.max(
            detail ? LOD_RADIUS_MIN / 2 : LOD_RADIUS_MIN,
            Math.min(view!.width, view!.height) *
              (detail ? LOD_RADIUS_FRACTION * 0.7 : LOD_RADIUS_FRACTION),
          );
    // Near units resample every frame, or every other one under reduced detail.
    const nearEvery = detail ? 2 : 1;
    const elapsed = battle?.elapsed ?? 0;
    for (const u of battle?.units ?? []) {
      // Booger shares the baked 3D character layer with Sneezy.
      if (u.hero || isPetUnitKind(u.kind) || u.kind === 'booger' || u.ejected) continue;
      // Recalled units are gone: drop their meshes now, or a frozen frame stays.
      if (u.native?.recalled) {
        const owned = this.views.get(u.id);
        if (owned) {
          owned.view.retire();
          this.views.delete(u.id);
        }
        sprites.get(u.id)?.setVisible(false);
        continue;
      }
      present.add(u.id);
      // Cull before pack fetch/decode so off-screen families never start loading.
      let point: { x: number; y: number };
      if (projectInto) {
        projectInto(scratch, u.x, u.y);
        point = scratch;
      } else point = iso(u.x, u.y);
      const air = !!TROOPS[u.kind].flying;
      if (culling) {
        const kept = this.views.get(u.id);
        const margin = kept ? CULL_MARGIN_KEPT : CULL_MARGIN;
        if (Math.abs(point.x - cx) > hw + margin || Math.abs(point.y - cy) > hh + margin) {
          // Off-screen: leave the (now invisible) fallback as-is; it is off screen.
          continue;
        }
        if (lodActive && kept && kept.kind === u.kind) {
          const dx = point.x - cx;
          const dy = point.y - cy;
          const radius = lodRadius * LOD_HYSTERESIS;
          const every = dx * dx + dy * dy > radius * radius ? LOD_RESAMPLE_EVERY : nearEvery;
          // A distant unit stays visible: between its staggered resamples the kept pose only
          // follows the unit's position and depth. It is never hidden.
          if (every > 1 && (this.frame + u.id) % every !== 0) {
            wanted.add(u.id);
            this.lodFrozen++;
            // The kept mesh stands in for the fallback sprite on these frames too.
            sprites.get(u.id)?.setVisible(false);
            const deathAge = elapsed - (u.defeatedAt ?? elapsed);
            if (u.hp <= 0 && deathAge > 1.5) {
              for (const object of kept.view.objects) if (object.visible) object.setVisible(false);
            } else
              follow(kept, point.x, point.y - (air ? lift : 0), unitDepth(point.y, u.id, air, 1));
            continue;
          }
        }
      }
      const pack = this.packs.get(u.kind);
      if (!pack) {
        void this.load(u.kind);
        // Keep the sprite pass's walk sheet or transparent stand-in until native art draws.
        // Artless troops already have a separate ground marker.
        continue;
      }
      const level = levelRow(pack, u.level ?? battle!.troopLevels?.[u.kind as TroopKind] ?? 1);
      if (!level) continue;
      if (!this.levelsReady.get(u.kind)?.has(level.level)) {
        void this.loadLevel(u.kind, level.level);
        continue;
      }
      // Walk/idle and travel heading follow simulation steps, not rendered frames: the sim
      // runs at 20 Hz without interpolation, so most rendered frames see no displacement.
      const motion = this.motion.update(u.id, u.x, u.y, elapsed, !u.attacking && u.path.length > 0);
      const moving = !u.attacking && motion.moving;
      const target = u.attacking ? nativeTroopFacingTarget(battle!, u, buildings) : undefined;
      let facing = this.facings.get(u.id);
      if (!facing) this.facings.set(u.id, (facing = { dx: 1, dy: 0 }));
      if (u.attacking && target) {
        facing.dx = target.x - u.x;
        facing.dy = target.y - u.y;
      } else if (moving && motion.heading) {
        facing.dx = motion.dx;
        facing.dy = motion.dy;
      }
      const dragon =
        battle?.nativeElectroDragon && u.kind === 'electrodragon'
          ? u.native?.electroDragon
          : undefined;
      const dragonPhase =
        dragon?.animAt !== undefined &&
        dragon.clock < dragon.animAt + TROOPS.electrodragon.rate - 1e-9
          ? Math.max(0, dragon.clock - dragon.animAt)
          : undefined;
      const windupOffset =
        battle?.nativeBowlerWindup && u.kind === 'bowler'
          ? u.native?.bowler?.animationOffset
          : (battle?.nativeGolemWindup && (u.kind === 'golem' || u.kind === 'golemite')) ||
              (battle?.nativePekkaWindup && u.kind === 'pekka') ||
              (battle?.nativeGiantWindup && (u.kind === 'giant' || u.kind === 'supergiant')) ||
              (battle?.nativeIceGolemWindup && u.kind === 'icegolem') ||
              (battle?.nativeRootRiderWindup && u.kind === 'rootrider') ||
              (battle?.nativeHoundWindup && (u.kind === 'lavahound' || u.kind === 'icehound')) ||
              (battle?.nativeWitchWindup && (u.kind === 'witch' || u.kind === 'superwitch')) ||
              (battle?.nativeValkyrieWindup &&
                (u.kind === 'valkyrie' || u.kind === 'supervalkyrie'))
            ? u.native?.attackWindup?.animationOffset
            : undefined;
      const requested =
        u.hp <= 0
          ? 'die'
          : dragonPhase !== undefined || windupOffset !== undefined || u.attacking
            ? 'attack'
            : moving
              ? 'walk'
              : 'idle';
      const state = level.states[requested] ?? level.states.idle ?? level.states.walk;
      if (!state) continue;
      const deathAge = elapsed - (u.defeatedAt ?? elapsed);
      if (u.hp <= 0 && deathAge > 1.5) {
        sprites.get(u.id)?.setVisible(false);
        continue;
      }
      const sx = facing.dx - facing.dy,
        sy = (facing.dx + facing.dy) / 2,
        slope = sy / Math.max(1e-9, Math.abs(sx));
      const bucket =
        state.exports.length === 3
          ? slope < -0.414
            ? 0
            : slope > 0.414
              ? 2
              : 1
          : Math.min(
              state.exports.length - 1,
              Math.floor(
                ((Math.atan2(sy, Math.abs(sx)) + Math.PI / 2) / Math.PI) * state.exports.length,
              ),
            );
      const name = state.exports[bucket],
        graph = pack.scenes[state.scene],
        clip = graph.clips[graph.exports[name]];
      let seconds: number;
      if (reduced) seconds = 0;
      else if (u.hp <= 0) seconds = deathAge;
      else if (dragonPhase !== undefined) seconds = dragonPhase;
      else if (windupOffset !== undefined)
        seconds = Math.max(0, Math.max(0, state.actionFrame - 1) / (clip?.fps ?? 1) + windupOffset);
      else if (u.attacking) {
        // Cooldowns reset to the scaled attack interval (boosts, poison, chill), as for heroes.
        const interval = Math.max(
          TROOPS[u.kind].rate * unitAttackIntervalScale(u, elapsed),
          u.cooldown,
        );
        seconds =
          battle &&
          (nativeMiteJump(battle, u.kind) ||
            (battle.nativeElectromites && u.kind === 'electromite')) &&
          u.native?.targetAt !== undefined
            ? Math.max(0, elapsed - u.native.targetAt)
            : Math.max(0, interval - u.cooldown);
      } else
        seconds =
          // Shrink and late campaign freezes hold the clock; loops get a per-unit phase.
          unitAnimationClock(u, elapsed) +
          (state.loop && clip ? unitAnimationPhase(u.id, clipSeconds(clip)) : 0);
      if (!state.loop && clip) seconds = Math.min(seconds, (clip.timeline.length - 1) / clip.fps);
      const scale = 0.6 * state.scale * (isShrunk(u, elapsed) ? 0.5 : 1);
      const mirror = sx < 0 ? -1 : 1;
      let owned = this.views.get(u.id);
      if (owned && (owned.scene !== state.scene || owned.kind !== u.kind)) {
        owned.view.retire();
        this.views.delete(u.id);
        owned = undefined;
      }
      // Shared, read-only: units of one kind on the same frame reuse a single sample. The
      // sample only changes with the integer source frame (the sim's 20 Hz clock), so a view
      // keeps its last one and skips even the shared-cache key on the frames between ticks.
      const frame = Math.floor(
        (Number.isFinite(seconds) ? Math.max(0, seconds) : 0) * (clip?.fps ?? 1) + 1e-9,
      );
      const last = owned?.sample;
      let poses: readonly NativeScenePose[];
      if (
        last &&
        last.graph === graph &&
        last.name === name &&
        last.frame === frame &&
        last.scale === scale &&
        last.mirror === mirror
      )
        poses = last.poses;
      else
        poses = nativeScenePosesShared(graph, name, seconds, {}, [
          scale * mirror,
          0,
          0,
          0,
          scale,
          0,
        ]);
      if (!owned) {
        const view = new NativeSceneView(this.scene, `troop:${u.kind}:${state.scene}`);
        // Disjoint screen/additive groups draw as plain leaves: exact, and no buffer per group.
        view.flattenDisjoint = true;
        // Group colors ride on the buffer image as a tint: no filter framebuffer per group.
        view.gpuGroupColor = true;
        // Under reduced detail, saturating leaf colors (hit flashes) clamp on the GPU after
        // filtering instead of baking a recolored texture copy per color step.
        view.gpuSaturate = detail > 0;
        // Blinking groups (fire, glows) keep their buffers between appearances.
        view.parkGroups = true;
        // A unit's parts that share one draw state are one mesh: a fraction of the display list.
        view.mergeLeaves = true;
        // Hit-flash texel bakes spread over frames instead of stalling the one they land on.
        view.bakeBudget = true;
        owned = {
          kind: u.kind,
          scene: state.scene,
          view,
          state: requested,
          x: 0,
          y: 0,
          depth: 0,
          tagged: -1,
        };
        this.views.set(u.id, owned);
      }
      owned.state = requested;
      if (poses !== last?.poses) owned.sample = { graph, name, frame, scale, mirror, poses };
      owned.view.gpuSaturate = detail > 0;
      wanted.add(u.id);
      sprites.get(u.id)?.setVisible(false);
      owned.x = point.x;
      owned.y = point.y - (air ? lift : 0);
      // Unique per-unit depth: parts of overlapping units never interleave.
      owned.depth = unitDepth(point.y, u.id, air, 1);
      owned.view.render(
        poses,
        owned.x,
        owned.y,
        owned.depth,
        (u.hp <= 0 ? Math.max(0, 1 - deathAge / 1.5) : 1) *
          ((u.native?.effects?.invisibleUntil ?? 0) > elapsed ? 0.35 : 1),
      );
      applyStatusTint(owned.view, u.hp > 0 ? unitStatusTint(u, battle!) : undefined);
      // Tag every drawn object: recycled meshes may arrive from another unit's view.
      for (const object of owned.view.objects)
        if (object.getData('nativeTroop') !== u.id) object.setData('nativeTroop', u.id);
      owned.tagged = owned.view.objects.length;
    }
    // Views of units that left the screen or died park their meshes for the next view: a
    // camera pan across the army used to destroy and rebuild hundreds of meshes.
    for (const [id, { view }] of this.views)
      if (!wanted.has(id)) {
        view.retire();
        this.views.delete(id);
      }
    this.motion.prune(present);
    for (const id of this.facings.keys()) if (!present.has(id)) this.facings.delete(id);
  }
  private viewZoom(cam: { zoom?: number; zoomX?: number; zoomY?: number } | undefined) {
    const own = (this.scene as unknown as { viewZoom?: unknown }).viewZoom;
    if (typeof own === 'number' && Number.isFinite(own)) return own;
    const zoom = cam?.zoom ?? Math.max(cam?.zoomX ?? 1, cam?.zoomY ?? 1);
    const density =
      (this.scene as unknown as { scale?: { displayScale?: { x?: number } } }).scale?.displayScale
        ?.x ?? 1;
    return zoom / (density > 0 ? density : 1);
  }
}

/** The pack row for a level (first match, as `find` returned), through a map built on first use. */
function levelRow(pack: Pack, level: number) {
  let rows = pack.byLevel;
  if (!rows) {
    rows = pack.byLevel = new Map();
    for (const row of pack.levels) if (!rows.has(row.level)) rows.set(row.level, row);
  }
  return rows.get(level);
}

const clipSeconds = (clip: { timeline: unknown[]; fps: number }) =>
  Math.max(1, clip.timeline.length) / Math.max(1, clip.fps);

/**
 * Moves a kept (LOD) view to a new origin without resampling: every drawn object shifts by the
 * origin delta, depth included. The next full render reassigns exact values.
 */
function follow(owned: TroopView, x: number, y: number, depth: number) {
  const dx = x - owned.x,
    dy = y - owned.y,
    dd = depth - owned.depth;
  for (const object of owned.view.objects) {
    if (dx || dy) object.setPosition(object.x + dx, object.y + dy);
    if (dd) object.setDepth(object.depth + dd);
    if (!object.visible) object.setVisible(true);
  }
  owned.x = x;
  owned.y = y;
  owned.depth = depth;
}

/**
 * Status tints on a native mesh, in the fallback sprite's order (see unitStatusTint). The mesh
 * renderer has just tinted each leaf with its own per-pose shading (darkened Pekka, Golem,
 * Giant, Healer and Dragon parts), so a multiply status combines with that tint instead of
 * replacing it, and the no-status path leaves it alone. Blend-group images carry no per-object
 * shading (it is baked into their buffer), so they take the status tint directly. The late
 * campaign freeze brightens every part toward ice with the SCREEN tint mode.
 */
export function applyStatusTint(
  view: Pick<NativeSceneView, 'objects'>,
  status: UnitStatusTint | undefined,
) {
  const mode = status?.mode ?? TINT_MULTIPLY;
  for (const object of view.objects) {
    const tinted = object as unknown as {
      tint: number;
      tintMode?: number;
      vertices?: unknown;
      /** A blend-group image carrying its group color as a tint (native-scene-view). */
      nativeColored?: boolean;
      /** Set on parts drawn through the additive tint mode: their real additive blend slot. */
      nativeAdditiveBlend?: number;
      setTint(color: number): void;
      setTintMode?(mode: number): void;
      setBlendMode?(mode: number): void;
      clearTint(): void;
    };
    // Additive parts keep their mode (it is their blend) under a multiply status; a screen
    // status replaces the tint mode, so they go back to the real additive blend for it.
    const additive = tinted.tintMode === NATIVE_ADDITIVE_TINT_MODE;
    if (mode !== TINT_MULTIPLY) {
      if (additive && tinted.nativeAdditiveBlend !== undefined)
        tinted.setBlendMode?.(tinted.nativeAdditiveBlend);
      if (tinted.tint !== status!.color) tinted.setTint(status!.color);
      if (tinted.tintMode !== mode) tinted.setTintMode?.(mode);
      continue;
    }
    if (tinted.tintMode !== undefined && tinted.tintMode !== TINT_MULTIPLY && !additive)
      tinted.setTintMode?.(TINT_MULTIPLY);
    // Leaf meshes (Mesh2D, which own vertices) and colored group images carry a renderer tint.
    if (tinted.vertices !== undefined || tinted.nativeColored) {
      if (!status) continue;
      const final = combineTint(tinted.tint ?? 0xffffff, status.color);
      if (tinted.tint === final) continue;
      if (final === 0xffffff) tinted.clearTint();
      else tinted.setTint(final);
    } else if (!status) {
      if (tinted.tint !== 0xffffff) tinted.clearTint();
    } else if (tinted.tint !== status.color) tinted.setTint(status.color);
  }
}
