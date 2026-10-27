import fieldSpellArt from '../../reference/field-spells/effects.json' with { type: 'json' };
import fireballArt from '../../reference/fireball/effects.json' with { type: 'json' };
import frostFlakeArt from '../../reference/frost-flake/effects.json' with { type: 'json' };
import darkOrbArt from '../../reference/dark-orb/effects.json' with { type: 'json' };
import recallUnitArt from '../../reference/recall/effects.json' with { type: 'json' };
import reviveTargetArt from '../../reference/revive/effects.json' with { type: 'json' };
import jumpSpellArt from '../../reference/jump-spell/effects.json' with { type: 'json' };
import freezeSpellArt from '../../reference/freeze-spell/effects.json' with { type: 'json' };
import overgrowthArt from '../../reference/overgrowth/effects.json' with { type: 'json' };
import superArcherArt from '../../reference/super-archer/effects.json' with { type: 'json' };
import superWizardArt from '../../reference/super-wizard/effects.json' with { type: 'json' };
import electroDragonArt from '../../reference/electro-dragon/effects.json' with { type: 'json' };
import electromiteArt from '../../reference/electromite/effects.json' with { type: 'json' };
import type Phaser from 'phaser';
import effectArt from '../../reference/full-client/effect-art.json' with { type: 'json' };
import { NativeSceneView, effectSceneView } from './native-scene-view';
import type { NativeMatrix, NativeScenePose } from './native-mesh';
import { NativeArtPacks, nativePackPrefix, type NativeArtPack } from './native-art-pack';
import {
  nativeEffectDuration,
  nativeEffectPoses,
  nativeTrailBirths,
  nativeTrailPoses,
  type NativeEffectEvent,
  type NativeEffectPose,
} from './native-effects';

type Point = { x: number; y: number };
type EffectIndex = {
  effects: Record<string, string>;
  emitters: Record<string, string>;
  packs: Record<string, { path: string }>;
};
const index = effectArt as unknown as EffectIndex;
const catalogs = [
  index,
  fireballArt,
  frostFlakeArt,
  darkOrbArt,
  electromiteArt,
  electroDragonArt,
  superWizardArt,
  superArcherArt,
  overgrowthArt,
  freezeSpellArt,
  jumpSpellArt,
  fieldSpellArt,
  recallUnitArt,
  reviveTargetArt,
] as unknown as EffectIndex[];
/** Pack of an effects.csv record, or undefined for sound-only and unreferenced records. */
export function nativeEffectPack(effect: string | undefined) {
  if (!effect) return undefined;
  for (const catalog of catalogs)
    if (Object.hasOwn(catalog.effects, effect)) return catalog.packs[catalog.effects[effect]].path;
  return undefined;
}
export const nativeEmitterPack = (emitter: string | undefined) =>
  emitter && Object.hasOwn(index.emitters, emitter)
    ? index.packs[index.emitters[emitter]].path
    : undefined;

/** World-pixel margins around the camera view: effect origins spread further than one particle. */
const EFFECT_MARGIN = 420;
const PARTICLE_MARGIN = 260;

type NativeObject = NativeSceneView['objects'][number];
const tagObjects = (objects: readonly NativeObject[], emitter: string) => {
  // setData emits change events: only write when the value differs.
  for (const object of objects)
    if (object.data?.values.nativeEffect !== emitter) object.setData('nativeEffect', emitter);
};

const shift = (m: NativeMatrix, dx: number, dy: number): NativeMatrix => [
  m[0],
  m[1],
  m[2] + dx,
  m[3],
  m[4],
  m[5] + dy,
];
function shiftGroup(poses: readonly NativeScenePose[], dx: number, dy: number): NativeScenePose[] {
  return poses.map((pose) =>
    'group' in pose
      ? { ...pose, group: shiftGroup(pose.group, dx, dy) }
      : { ...pose, matrix: shift(pose.matrix, dx, dy) },
  );
}

/**
 * Draws sampled original effect particles with retained native meshes. Each owner keeps its own
 * layer (views live between begin() and end()); packs are shared through one loader. Effects,
 * trail births and particles outside the camera view (plus a margin) are neither sampled nor drawn.
 */
export class NativeEffectLayer {
  /** Warm a source trail's graph and texture pages before its first launch. */
  prefetchEmitter(name: string) {
    const path = nativeEmitterPack(name);
    if (path) this.packs.get(path);
  }
  private views = new Map<string, NativeSceneView>();
  private used = new Set<string>();
  /** Ground point of each trail birth, computed once per birth instead of once per frame. */
  private trailPoints = new Map<string, Map<number, Point>>();
  private usedTrails = new Set<string>();
  private bounds = { left: -Infinity, top: -Infinity, right: Infinity, bottom: Infinity };
  constructor(
    private scene: Phaser.Scene,
    private packs: NativeArtPacks<NativeArtPack>,
    private tag: string,
  ) {}
  begin() {
    this.used.clear();
    this.usedTrails.clear();
    const world = this.scene.cameras.main.worldView;
    const b = this.bounds;
    // A camera that has not rendered yet has an empty world view: draw everything, not nothing.
    if (world.width > 0 && world.height > 0) {
      b.left = world.x;
      b.top = world.y;
      b.right = world.x + world.width;
      b.bottom = world.y + world.height;
    } else {
      b.left = b.top = -Infinity;
      b.right = b.bottom = Infinity;
    }
  }
  /** True when a point lies within the camera view grown by `margin` world pixels. */
  visible(x: number, y: number, margin: number) {
    const b = this.bounds;
    return (
      x >= b.left - margin && x <= b.right + margin && y >= b.top - margin && y <= b.bottom + margin
    );
  }
  /** True when the box spanned by two points meets the grown camera view (beams, flights). */
  spans(a: Point, c: Point, margin: number) {
    const b = this.bounds;
    return (
      Math.max(a.x, c.x) >= b.left - margin &&
      Math.min(a.x, c.x) <= b.right + margin &&
      Math.max(a.y, c.y) >= b.top - margin &&
      Math.min(a.y, c.y) <= b.bottom + margin
    );
  }
  /** 'ready' once the record's art is drawable, 'loading' while fetching, 'none' without art. */
  status(effect: string | undefined): 'ready' | 'loading' | 'none' {
    const path = nativeEffectPack(effect);
    if (!path || this.packs.unavailable(path)) return 'none';
    return this.packs.get(path) ? 'ready' : 'loading';
  }
  duration(effect: string, maximum = 30) {
    const path = nativeEffectPack(effect);
    const pack = path ? this.packs.get(path) : undefined;
    return pack ? nativeEffectDuration(pack, effect, maximum) : undefined;
  }
  play(event: NativeEffectEvent, elapsed: number, reduced: boolean) {
    const path = nativeEffectPack(event.effect);
    const pack = path ? this.packs.get(path) : undefined;
    if (!path || !pack) return false;
    const origin = event.ground;
    const lifted = { x: origin.x, y: origin.y - (event.lift ?? 0) };
    if (
      !this.visible(origin.x, origin.y, EFFECT_MARGIN) &&
      !this.visible(lifted.x, lifted.y, EFFECT_MARGIN) &&
      !(event.target && this.spans(lifted, event.target, EFFECT_MARGIN))
    )
      return true;
    this.draw(path, nativeEffectPoses(pack, event, elapsed, reduced));
    return true;
  }
  /** Particles an emitter leaves along a flight; each birth keeps the point where it was emitted. */
  emitterTrail(
    emitter: string,
    key: string,
    span: { launched: number; end: number },
    pointAt: (time: number) => Point,
    elapsed: number,
    reduced: boolean,
    facing?: Point,
    depth?: number,
  ) {
    const path = nativeEmitterPack(emitter);
    const pack = path ? this.packs.get(path) : undefined;
    if (!path || !pack) return false;
    this.trailPoses(path, pack, emitter, key, span, pointAt, elapsed, reduced, facing, depth);
    return true;
  }
  /** An AttachToParent effect (e.g. Artillery Trail): every emitter row trails the moving parent. */
  effectTrail(
    effect: string,
    key: string,
    span: { launched: number; end: number },
    pointAt: (time: number) => Point,
    elapsed: number,
    reduced: boolean,
    facing?: Point,
    depth?: number,
    sourceRows = false,
  ) {
    const path = nativeEffectPack(effect);
    const pack = path ? this.packs.get(path) : undefined;
    if (!path || !pack) return false;
    const rows = pack.effects[effect] ?? [];
    for (const [i, own] of rows.entries()) {
      const row = sourceRows ? { ...rows[0], ...own } : own;
      if (row.ParticleEmitter)
        this.trailPoses(
          path,
          pack,
          row.ParticleEmitter,
          `${key}:${i}`,
          span,
          pointAt,
          elapsed,
          reduced,
          facing,
          depth,
          sourceRows
            ? {
                scale: Number(row.Scale || 100) / 100,
                timeScale: Math.max(0.01, Number(row.LifeTimeScale || 100) / 100),
              }
            : undefined,
        );
    }
    return true;
  }
  private trailPoses(
    path: string,
    pack: NativeArtPack,
    emitter: string,
    key: string,
    span: { launched: number; end: number },
    pointAt: (time: number) => Point,
    elapsed: number,
    reduced: boolean,
    facing?: Point,
    depth?: number,
    options?: { scale: number; timeScale: number },
  ) {
    const rows = pack.emitters[emitter];
    if (!rows || reduced) return;
    let points = this.trailPoints.get(key);
    if (!points) this.trailPoints.set(key, (points = new Map()));
    this.usedTrails.add(key);
    const births: { index: number; at: number; ground: Point }[] = [];
    let oldest = Infinity;
    const timing = options
      ? {
          ...rows[0],
          EmissionTime: String(Number(rows[0].EmissionTime || 0) * options.timeScale),
          MinLife: String(Number(rows[0].MinLife || 0) * options.timeScale),
          MaxLife: String(Number(rows[0].MaxLife || 0) * options.timeScale),
        }
      : rows[0];
    for (const birth of nativeTrailBirths(timing, span.launched, span.end, elapsed)) {
      if (birth.index < oldest) oldest = birth.index;
      let ground = points.get(birth.index);
      if (!ground) points.set(birth.index, (ground = pointAt(birth.at)));
      if (this.visible(ground.x, ground.y, PARTICLE_MARGIN))
        births.push({ index: birth.index, at: birth.at, ground });
    }
    // Births older than the oldest live one never come back.
    for (const index of points.keys()) if (index < oldest) points.delete(index);
    if (!births.length) return;
    const poses = nativeTrailPoses(
      pack,
      emitter,
      key,
      births,
      elapsed,
      reduced,
      facing,
      depth,
      options,
    );
    if (depth === undefined) this.draw(path, poses);
    else this.drawBatched(path, key, poses);
  }
  private sceneView(key: string, prefix: string) {
    this.used.add(key);
    let view = this.views.get(key);
    if (!view) this.views.set(key, (view = effectSceneView(this.scene, prefix)));
    return view;
  }
  private draw(path: string, poses: NativeEffectPose[]) {
    for (const pose of poses) {
      const view = this.sceneView(`${this.tag}:${pose.key}`, nativePackPrefix(path, pose.scene));
      view.render(pose.poses, pose.x, pose.y, pose.depth);
      tagObjects(view.objects, pose.emitter);
    }
  }
  /**
   * One view per (trail, scene, depth) instead of one per particle: particles sharing a depth
   * are translated into one pose list, keyed by birth, and drawn in birth order.
   */
  private drawBatched(path: string, key: string, poses: NativeEffectPose[]) {
    const batches = new Map<string, NativeEffectPose[]>();
    for (const pose of poses) {
      const batch = `${pose.scene}|${pose.depth}`;
      const list = batches.get(batch);
      if (list) list.push(pose);
      else batches.set(batch, [pose]);
    }
    for (const [batch, list] of batches) {
      const first = list[0];
      const view = this.sceneView(
        `${this.tag}:${key}:batch:${batch}`,
        nativePackPrefix(path, first.scene),
      );
      const combined: NativeScenePose[] = [];
      for (const pose of list) {
        const dx = pose.x - first.x,
          dy = pose.y - first.y,
          prefix = pose.key + '|';
        for (const p of pose.poses)
          combined.push(
            'group' in p
              ? { ...p, key: prefix + p.key, group: shiftGroup(p.group, dx, dy) }
              : { ...p, key: prefix + p.key, matrix: shift(p.matrix, dx, dy) },
          );
      }
      view.render(combined, first.x, first.y, first.depth);
      tagObjects(view.objects, first.emitter);
    }
  }
  end() {
    // Finished particles park their meshes in the scene pool for the next birth.
    for (const [key, view] of this.views)
      if (!this.used.has(key)) {
        view.retire();
        this.views.delete(key);
      }
    for (const key of this.trailPoints.keys())
      if (!this.usedTrails.has(key)) this.trailPoints.delete(key);
  }
  clear() {
    for (const view of this.views.values()) view.destroy();
    this.views.clear();
    this.used.clear();
    this.trailPoints.clear();
    this.usedTrails.clear();
  }
}
