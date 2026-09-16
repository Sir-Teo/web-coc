import type Phaser from 'phaser';
import type { Battle } from './model';
import type { CombatProjectile } from './projectiles';
import { NativeSceneView } from './native-scene-view';
import { NativeArtPacks, nativePackPrefix, type NativeArtPack } from './native-art-pack';
import { NativeEffectLayer } from './native-effect-layer';
import {
  nativeProjectileFlight,
  nativeProjectilePack,
  nativeProjectilePoses,
  nativePiercingFlight,
  type NativeProjectilePack,
  type NativeProjectileRow,
} from './native-projectile-poses';
import { weaponFor } from './native-defenses';

type Point = { x: number; y: number };
const FLIGHT_DEPTH = 8000;
const SHADOW_DEPTH = -845;
/** Keep landed shots for their impact and trail art, then forget them. */
const AFTERLIFE = 3;

interface Snapshot {
  id: string;
  name: string;
  packPath: string;
  sourceId: number;
  bounce: number;
  fromX: number;
  fromY: number;
  x: number;
  y: number;
  launched: number;
  impact: number;
  fromAir?: boolean;
  toAir?: boolean;
  piercing?: { dirX: number; dirY: number; length: number; speed: number };
}

/**
 * Draws client projectile rows with their original flight art, shadow, trail emitter and
 * spawn/impact effects. Shots whose pack is still loading keep the drawn fallback.
 */
export class NativeProjectilePresentation {
  private packs: NativeArtPacks<NativeProjectilePack>;
  private layer: NativeEffectLayer;
  private views = new Map<string, { prefix: string; view: NativeSceneView }>();
  private history = new Map<string, Snapshot>();
  private covered = new Set<string>();
  constructor(
    private scene: Phaser.Scene,
    effects: NativeArtPacks<NativeArtPack>,
  ) {
    this.packs = new NativeArtPacks<NativeProjectilePack>(scene);
    this.layer = new NativeEffectLayer(scene, effects, 'projectile');
  }
  /** True when the native presentation already shows this shot's flight and impact. */
  covers(id: string | undefined) {
    return !!id && this.covered.has(id);
  }
  clear() {
    for (const { view } of this.views.values()) view.destroy();
    this.views.clear();
    this.layer.clear();
    this.history.clear();
    this.covered.clear();
  }
  destroy() {
    this.clear();
    this.packs.destroy();
  }
  private row(snapshot: Snapshot) {
    const pack = this.packs.get(snapshot.packPath);
    return pack ? { pack, row: pack.projectiles[snapshot.name] } : undefined;
  }
  private draw(
    key: string,
    prefix: string,
    poses: Parameters<NativeSceneView['render']>[0],
    x: number,
    y: number,
    depth: number,
  ) {
    let entry = this.views.get(key);
    if (entry && entry.prefix !== prefix) {
      entry.view.destroy();
      this.views.delete(key);
      entry = undefined;
    }
    if (!entry)
      this.views.set(key, (entry = { prefix, view: new NativeSceneView(this.scene, prefix) }));
    entry.view.render(poses, x, y, depth);
    return key;
  }
  render(
    battle: Battle | null,
    reduced: boolean,
    iso: (x: number, y: number) => Point,
    airLift: number,
  ) {
    const covered = new Set<string>();
    const shown = new Set<string>();
    this.layer.begin();
    const elapsed = battle?.elapsed ?? 0;
    if (!battle || battle.finished || reduced) {
      this.history.clear();
      this.covered = covered;
      for (const [key, { view }] of this.views) {
        view.destroy();
        this.views.delete(key);
      }
      this.layer.end();
      return covered;
    }
    for (const p of battle.projectiles ?? []) {
      if (p.weapon !== 'native' || !p.native) continue;
      const packPath = nativeProjectilePack(p.native.name);
      if (!packPath) continue;
      this.history.set(p.id, snapshot(p, packPath));
    }
    for (const shot of battle.nativePiercing ?? []) {
      const tower = battle.buildings.find((b) => b.id === shot.sourceId);
      const name = tower ? weaponFor(tower)?.projectile : undefined;
      const packPath = nativeProjectilePack(name);
      if (!name || !packPath) continue;
      this.history.set(`pierce:${shot.id}`, {
        id: `pierce:${shot.id}`,
        name,
        packPath,
        sourceId: shot.sourceId,
        bounce: 0,
        fromX: shot.fromX,
        fromY: shot.fromY,
        x: shot.fromX + shot.dirX * shot.length,
        y: shot.fromY + shot.dirY * shot.length,
        launched: shot.launched,
        impact: shot.launched + shot.length / Math.max(1e-6, shot.speed),
        piercing: { dirX: shot.dirX, dirY: shot.dirY, length: shot.length, speed: shot.speed },
      });
    }
    for (const [id, snap] of this.history) {
      if (elapsed < snap.launched || elapsed > snap.impact + AFTERLIFE) {
        this.history.delete(id);
        continue;
      }
      const resolved = this.row(snap);
      if (!resolved?.row) continue;
      const { pack, row } = resolved;
      const flight = snap.piercing
        ? nativePiercingFlight(row, { ...snap, ...snap.piercing }, elapsed, iso)
        : nativeProjectileFlight(row, snap, elapsed, { iso, airLift });
      covered.add(id);
      const facing = flight.direction;
      const pointAt = (time: number) => {
        const at = snap.piercing
          ? nativePiercingFlight(row, { ...snap, ...snap.piercing }, time, iso)
          : nativeProjectileFlight(row, snap, time, { iso, airLift });
        return { x: at.x, y: at.y };
      };
      const span = { launched: snap.launched, end: flight.end };
      if (elapsed <= flight.end) {
        const art = nativeProjectilePoses(pack, row, flight, elapsed, snap.launched);
        if (art.poses.length)
          shown.add(
            this.draw(
              id,
              nativePackPrefix(snap.packPath, art.scene),
              art.poses,
              flight.x,
              flight.y,
              FLIGHT_DEPTH,
            ),
          );
        if (art.shadow?.poses.length)
          shown.add(
            this.draw(
              `${id}:shadow`,
              nativePackPrefix(snap.packPath, art.shadow.scene),
              art.shadow.poses,
              flight.ground.x,
              flight.ground.y,
              SHADOW_DEPTH,
            ),
          );
      }
      if (row.ParticleEmitter)
        this.layer.emitterTrail(
          row.ParticleEmitter,
          `${id}:trail`,
          span,
          pointAt,
          elapsed,
          reduced,
          facing,
          FLIGHT_DEPTH - 1,
        );
      if (row.Effect)
        this.layer.effectTrail(
          row.Effect,
          `${id}:fx`,
          span,
          pointAt,
          elapsed,
          reduced,
          facing,
          FLIGHT_DEPTH - 1,
        );
      const launchPoint = pointAt(snap.launched);
      if (row.SpawnEffect)
        this.layer.play(
          {
            key: `${id}:spawn`,
            effect: row.SpawnEffect,
            at: snap.launched,
            ground: launchPoint,
            facing,
          },
          elapsed,
          reduced,
        );
      if (snap.bounce > 0 && row.BounceEffect)
        this.layer.play(
          {
            key: `${id}:bounce`,
            effect: row.BounceEffect,
            at: snap.launched,
            ground: launchPoint,
            facing,
          },
          elapsed,
          reduced,
        );
      if (row.DestroyedEffect && elapsed >= flight.end) {
        const landing = pointAt(flight.end);
        this.layer.play(
          {
            key: `${id}:hit`,
            effect: row.DestroyedEffect,
            at: flight.end,
            ground: landing,
            facing,
            depth: snap.toAir ? 7600 : undefined,
          },
          elapsed,
          reduced,
        );
      }
    }
    for (const [key, { view }] of this.views)
      if (!shown.has(key)) {
        view.destroy();
        this.views.delete(key);
      }
    this.layer.end();
    this.covered = covered;
    return covered;
  }
}

function snapshot(p: CombatProjectile, packPath: string): Snapshot {
  return {
    id: p.id,
    name: p.native!.name,
    packPath,
    sourceId: p.sourceId,
    bounce: p.native!.bounce ?? 0,
    fromX: p.fromX,
    fromY: p.fromY,
    x: p.x,
    y: p.y,
    launched: p.launched,
    impact: p.impact,
    fromAir: p.fromAir,
    toAir: p.toAir,
  };
}

export type { NativeProjectileRow };
