import type Phaser from 'phaser';
import type { AudioManager } from './audio';
import type { LatePresentation, LateRenderContext } from './late-campaign-scene';
import type { Building } from './model';
import type { SampleCue } from './sample-audio';
import { NativeSceneView } from './native-scene-view';
import { preloadNativeMeshes } from './native-mesh-scene';
import type { NativeParticlePose } from './native-particles';
import { MONOLITH_ART_LEVELS, monolithAsset, monolithTexture } from './monolith-art';
import {
  MONOLITH_EFFECTS,
  MONOLITH_EMITTERS,
  MONOLITH_GRAPH,
  MONOLITH_SOUNDS,
  monolithBounds,
  monolithPose,
  monolithPoses,
  monolithProjectilePose,
  type MonolithVisualState,
} from './monolith-poses';
import { MONOLITH_PROJECTILES, monolithStats } from './monolith-stats';
import { sourceEffectPlayer } from './spell-tower-effect-player';

const PREFIX = 'monolith-native';
const sample = (path: string) => `monolith-${path.split('/').at(-1)!.replace('.ogg', '')}`;
/** Looping source trail effects re-emit continuously; one birth per 30 fps frame is local. */
const TRAIL_INTERVAL = 1 / 30;
const player = sourceEffectPlayer({
  graph: MONOLITH_GRAPH,
  effects: MONOLITH_EFFECTS,
  emitters: MONOLITH_EMITTERS,
  artScale: 1.2,
  sample,
  prefix: 'monolith',
});

export function preloadMonolith(scene: Phaser.Scene) {
  preloadNativeMeshes(scene, MONOLITH_GRAPH, PREFIX);
  for (const level of MONOLITH_ART_LEVELS)
    scene.load.image(monolithTexture(level), monolithAsset(level));
  for (const [path, sound] of Object.entries(MONOLITH_SOUNDS))
    scene.load.binary(sample(path), '/' + sound.path);
}

const visualState = (b: Building): MonolithVisualState =>
  b.hp <= 0 ? 'ruin' : b.constructing ? 'constructing' : b.upgradeEnd ? 'upgrading' : 'setup';

/** State-driven presentation; rendering reads battle histories so replay seeks stay exact. */
export class MonolithPresentation implements LatePresentation {
  readonly towers = new Map<number, NativeSceneView>();
  readonly projectiles = new Map<string, NativeSceneView>();
  readonly effects = new Map<string, NativeSceneView>();
  private signatures = new Map<number, string>();
  constructor(
    private scene: Phaser.Scene,
    audio: AudioManager,
  ) {
    for (const path of Object.keys(MONOLITH_SOUNDS))
      audio.samples.register(sample(path), scene.cache.binary.get(sample(path)));
  }
  /** True once this family renders the building itself (the fallback sprite is hidden). */
  handles(b: Building) {
    return b.kind === 'monolith';
  }
  bounds(b: Building): readonly [number, number, number, number] | undefined {
    return b.kind === 'monolith' ? monolithBounds(b.level, visualState(b)) : undefined;
  }
  render(context: LateRenderContext): SampleCue[] {
    const { battle, elapsed, reduced, iso, airLift } = context;
    const wanted = new Set<number>(),
      flying = new Set<string>(),
      showing = new Set<string>(),
      cues: SampleCue[] = [];
    const zoom = `${this.scene.cameras.main.zoomX}:${this.scene.cameras.main.zoomY}`;
    const draw = (poses: NativeParticlePose[], tag: string) => {
      for (const fx of poses) {
        showing.add(fx.key);
        let view = this.effects.get(fx.key);
        if (!view) this.effects.set(fx.key, (view = new NativeSceneView(this.scene, PREFIX)));
        view.render(fx.poses, fx.x, fx.y, fx.depth);
        for (const object of view.objects)
          object.setData('nativeMonolithEffect', { key: fx.key, emitter: fx.emitter, tag });
      }
    };
    const live = battle && !battle.finished;
    const family = battle?.late?.monolith;
    for (const tower of context.buildings) {
      if (tower.kind !== 'monolith') continue;
      wanted.add(tower.id);
      const p = iso(tower.x + 1.5, tower.y + 1.5);
      const state = visualState(tower);
      const record = family?.towers[tower.id];
      const pose = monolithPose(tower, record, battle, elapsed, reduced);
      const ruinAge = record?.destroyedAt !== undefined ? elapsed - record.destroyedAt : Infinity;
      let view = this.towers.get(tower.id);
      if (!view) this.towers.set(tower.id, (view = new NativeSceneView(this.scene, PREFIX)));
      const signature = `${tower.level}:${state}:${pose.direction}:${pose.attack}:${pose.variant}:${Math.floor(pose.seconds * 30 + 1e-9)}:${Math.min(1, Math.floor(ruinAge * 30))}:${p.x}:${p.y}:${zoom}`;
      if (this.signatures.get(tower.id) !== signature) {
        view.render(
          monolithPoses(tower.level, state, pose, ruinAge),
          p.x,
          p.y,
          p.y + (state === 'ruin' ? -2 : 0),
        );
        for (const object of view.objects)
          object.setData('nativeMonolith', { id: tower.id, state, ...pose });
        this.signatures.set(tower.id, signature);
      }
      if (!live || !record) continue;
      const row = monolithStats(tower.level);
      if (record.targetId !== null && record.engagedAt !== undefined && tower.hp > 0)
        cues.push(
          ...player.cues(`${tower.id}:engaged:${record.engagedAt}`, row.attackEffect, record.engagedAt, tower.id, 0),
        );
      for (const shot of record.shots) {
        const projectile = MONOLITH_PROJECTILES[shot.variant - 1];
        cues.push(...player.cues(`${tower.id}:shot:${shot.index}`, projectile.spawnEffect, shot.at, tower.id, shot.index));
        const hit = record.hits.find((h) => h.index === shot.index);
        const inFlight = family.projectiles.find((q) => q.sourceId === tower.id && q.index === shot.index);
        const path = inFlight ?? (hit
          ? {
              fromX: shot.fromX,
              fromY: shot.fromY,
              x: hit.x,
              y: hit.y,
              launched: shot.at,
              impact: hit.at,
              toAir: hit.toAir,
              variant: shot.variant,
              flight: { x: shot.fromX, y: shot.fromY, at: shot.at },
            }
          : undefined);
        if (!path) continue;
        const trailRows = MONOLITH_EFFECTS[projectile.trailEffect] ?? [];
        for (const [i, trailRow] of trailRows.entries())
          if (trailRow.ParticleEmitter)
            draw(
              player.trail(
                `${tower.id}:trail:${shot.index}:${i}`,
                trailRow.ParticleEmitter,
                shot.at,
                path.impact,
                TRAIL_INTERVAL,
                elapsed,
                (at) => {
                  const pose = monolithProjectilePose(
                    { ...path, flight: { x: path.fromX, y: path.fromY, at: path.launched } },
                    at,
                    iso,
                    airLift,
                  );
                  return { x: pose.x, y: pose.y };
                },
                tower.id,
                shot.index * 8 + i,
                7999,
                reduced,
              ),
              'trail',
            );
      }
      for (const hit of record.hits) {
        const projectile = MONOLITH_PROJECTILES[hit.variant - 1];
        const ground = iso(hit.x, hit.y);
        const point = { x: ground.x, y: ground.y - 16 - (hit.toAir ? airLift : 0) };
        for (const effect of hit.struck ? [projectile.destroyedEffect, row.hitEffect] : [projectile.destroyedEffect]) {
          cues.push(...player.cues(`${tower.id}:hit:${hit.index}:${effect}`, effect, hit.at, tower.id, hit.index));
          const poses = player.poses(`${tower.id}:hit:${hit.index}:${effect}`, effect, hit.at, elapsed, point, tower.id, hit.index, reduced);
          for (const pose of poses) if (hit.toAir) pose.depth = 8000;
          draw(poses, 'hit');
        }
      }
      if (record.destroyedAt !== undefined) {
        cues.push(...player.cues(`${tower.id}:destroyed`, row.destroyEffect, record.destroyedAt, tower.id, 0));
        draw(player.poses(`${tower.id}:destroyed`, row.destroyEffect, record.destroyedAt, elapsed, p, tower.id, 0, reduced), 'destroy');
      }
    }
    if (live && !reduced)
      for (const shot of family?.projectiles ?? []) {
        flying.add(shot.id);
        const pose = monolithProjectilePose(shot, elapsed, iso, airLift);
        let view = this.projectiles.get(shot.id);
        if (!view) this.projectiles.set(shot.id, (view = new NativeSceneView(this.scene, PREFIX)));
        view.render(pose.poses, pose.x, pose.y, 8000);
        for (const object of view.objects)
          object.setData('nativeMonolithProjectile', { id: shot.id, progress: pose.t, export: pose.export });
      }
    for (const [id, view] of this.towers)
      if (!wanted.has(id)) {
        view.destroy();
        this.towers.delete(id);
        this.signatures.delete(id);
      }
    for (const [key, view] of this.projectiles)
      if (!flying.has(key)) {
        view.destroy();
        this.projectiles.delete(key);
      }
    for (const [key, view] of this.effects)
      if (!showing.has(key)) {
        view.destroy();
        this.effects.delete(key);
      }
    return cues;
  }
  clear() {
    for (const map of [this.towers, this.projectiles, this.effects]) {
      for (const view of map.values()) view.destroy();
      map.clear();
    }
    this.signatures.clear();
  }
  destroy() {
    this.clear();
  }
}
