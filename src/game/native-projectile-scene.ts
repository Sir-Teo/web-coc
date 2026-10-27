import { garrisonBowlerImpactEvents } from './bowler-impact-effects';
import { superArcherEffectEvents } from './super-archer-effects';
import { fireballEffectEvents, fireballProfile } from './fireball-effects';
import { frostFlakeEffectEvents } from './frost-flake-effects';
import { electroBootsEffectEvents } from './electro-boots-effects';
import { darkOrbEffectEvents } from './dark-orb-effects';
import { heroAbilityActivation } from './hero-ability-feedback';
import { superWizardEffectEvents } from './super-wizard-effects';
import { electroDragonEffectEvents } from './electro-dragon-effects';
import { electromiteEffectEvents } from './electromite-effects';
import type Phaser from 'phaser';
import type { Battle } from './model';
import type { CombatProjectile } from './projectiles';
import { presentationLive, presentationTime } from './presentation-clock';
import { nativeProjectileAimAt, type NativeProjectileAim } from './native-projectile-aim';
import { NativeSceneView, effectSceneView } from './native-scene-view';
import { NativeArtPacks, nativePackPrefix, type NativeArtPack } from './native-art-pack';
import { NativeEffectLayer, nativeEffectPack } from './native-effect-layer';
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
  bowlerContinues?: true;
  fireballLevel?: number;
  giantArrow?: true;
  frostFlake?: true;
  spikyContinues?: true;
  seekingShield?: true;
  shieldContinues?: true;
  /** One continuous shield spin clock across its captured flight legs. */
  animationAt?: number;
  darkOrb?: true;
  fromX: number;
  fromY: number;
  x: number;
  y: number;
  launched: number;
  impact: number;
  fromAir?: boolean;
  toAir?: boolean;
  nativeAim?: NativeProjectileAim[];
  piercing?: { dirX: number; dirY: number; length: number; speed: number };
  /** Piercing shots: snapshot and line merged once for nativePiercingFlight. */
  line?: Parameters<typeof nativePiercingFlight>[1];
  /** Projected launch and landing points (the flight never changes once recorded). */
  launchPoint?: Point;
  landing?: Point;
  landingAt?: number;
}

/** World pixels around the camera view within which shots are still sampled and drawn. */
const SHOT_MARGIN = 360;
/** Stable parity of a shot id, to trail every other shot under reduced detail. */
function hashId(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return h;
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
  /** A completed or newly retryable flight pack invalidates paused presentation. */
  get artRevision() {
    return this.packs.revision;
  }
  /** Warm original troop flight art alongside the carried army, before its first shot. */
  prefetch(names: Iterable<string>) {
    const paths = new Set<string>();
    for (const name of names) {
      const path = nativeProjectilePack(name);
      if (path) paths.add(path);
    }
    for (const path of paths) this.packs.get(path);
  }
  /** Targeted effects without a projectile warm through the same shared pack loader. */
  prefetchEffects(names: Iterable<string>) {
    for (const name of names) this.layer.duration(name);
  }
  prefetchEmitters(names: Iterable<string>) {
    for (const name of names) this.layer.prefetchEmitter(name);
  }
  coversAbilityActivation(
    battle: Battle | null | undefined,
    id: string | undefined,
    reduced: boolean,
  ) {
    const activation = heroAbilityActivation(battle, id);
    return (
      !reduced &&
      !!activation &&
      this.layer.status(activation.visualEffect ?? activation.effect) === 'ready'
    );
  }
  /** True when the native presentation already shows this shot's flight. */
  covers(id: string | undefined) {
    return !!id && this.covered.has(id);
  }
  /** Flight art can arrive before the separate impact graph and its texture pages. */
  coversImpact(id: string | undefined) {
    if (!id || !this.covered.has(id)) return false;
    const shot = this.history.get(id);
    const resolved = shot ? this.row(shot) : undefined;
    if (!resolved?.row) return false;
    if (shot?.bowlerContinues) return true;
    if (shot?.shieldContinues && !resolved.row.BounceEffect) return true;
    const effect = shot?.fireballLevel
      ? fireballProfile(shot.fireballLevel)?.HitEffect
      : resolved.row.DestroyedEffect;
    return this.coversEffect(effect);
  }
  /** Sound-only contacts need no fallback; indexed final effects keep one until ready. */
  coversEffect(effect: string | undefined, reduced = false) {
    if (!effect || !nativeEffectPack(effect)) return true;
    if (reduced) return false;
    // Request a bounded retry even when the previous graph request failed.
    this.layer.duration(effect);
    return this.layer.status(effect) === 'ready';
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
      entry.view.retire();
      this.views.delete(key);
      entry = undefined;
    }
    if (!entry)
      this.views.set(key, (entry = { prefix, view: effectSceneView(this.scene, prefix) }));
    entry.view.render(poses, x, y, depth);
    return key;
  }
  /** False once a one-shot effect started at `at` has certainly finished drawing. */
  private running(effect: string, at: number, elapsed: number) {
    const duration = this.layer.duration(effect);
    return duration === undefined || elapsed - at <= duration + 1e-6;
  }
  render(
    battle: Battle | null,
    reduced: boolean,
    iso: (x: number, y: number) => Point,
    airLift: number,
    /** Presentation detail (RenderDetail): 1 trails every other shot, 2 draws no trails. */
    detail = 0,
    attachment?: (id: number, name: string) => Point | undefined,
  ) {
    const covered = new Set<string>();
    const shown = new Set<string>();
    this.layer.begin();
    const elapsed = battle && presentationLive(battle) ? presentationTime(battle) : Infinity;
    if (!battle || !Number.isFinite(elapsed) || reduced) {
      this.history.clear();
      this.covered = covered;
      for (const [key, { view }] of this.views) {
        view.retire();
        this.views.delete(key);
      }
      this.layer.end();
      return covered;
    }
    for (const event of garrisonBowlerImpactEvents(battle, iso, elapsed, (name) =>
      this.layer.duration(name),
    ))
      this.layer.play(event, elapsed, reduced);
    for (const event of electroDragonEffectEvents(battle, iso, airLift, attachment, (name) =>
      this.layer.duration(name),
    ))
      this.layer.play(event, elapsed, reduced);
    for (const event of superWizardEffectEvents(battle, iso, airLift, attachment, (name) =>
      this.layer.duration(name),
    ))
      this.layer.play(event, elapsed, reduced);
    for (const event of superArcherEffectEvents(battle, iso, airLift, (name) =>
      this.layer.duration(name),
    ))
      this.layer.play(event, elapsed, reduced);
    for (const event of electromiteEffectEvents(battle, iso, airLift))
      this.layer.play(event, elapsed, reduced);
    for (const event of fireballEffectEvents(battle, iso, airLift, (name) =>
      this.layer.duration(name, Infinity),
    ))
      this.layer.play(event, elapsed, reduced);
    for (const event of frostFlakeEffectEvents(battle, iso, (name) =>
      this.layer.duration(name, Infinity),
    ))
      this.layer.play(event, elapsed, reduced);
    for (const event of electroBootsEffectEvents(battle, iso, (name) =>
      this.layer.duration(name, Infinity),
    ))
      this.layer.play(event, elapsed, reduced);
    for (const event of darkOrbEffectEvents(battle, iso, airLift, (name) =>
      this.layer.duration(name, Infinity),
    ))
      this.layer.play(event, elapsed, reduced);
    for (const p of [
      ...(battle.nativeSeekingShieldCasts ?? [])
        .flatMap((cast) => cast.shots)
        .filter((shot) => elapsed <= shot.impact + AFTERLIFE),
      ...(battle.nativeSpikyBallCasts ?? [])
        .flatMap((cast) => cast.shots)
        .filter((shot) => elapsed <= shot.impact + AFTERLIFE),
      ...(battle.nativeFrostFlakeCasts ?? [])
        .flatMap((cast) => cast.shots)
        .filter((shot) => elapsed <= shot.impact + AFTERLIFE),
      ...(battle.nativeFireballs ?? []).filter((shot) => elapsed <= shot.impact + AFTERLIFE),
      ...(battle.nativeMeteorFlights ?? []).filter((shot) => elapsed <= shot.impact + AFTERLIFE),
      ...(battle.nativeBowlerFlights ?? []).filter((shot) => elapsed <= shot.impact + AFTERLIFE),
      ...(battle.nativeWitchFlights ?? []).filter((shot) => elapsed <= shot.impact + AFTERLIFE),
      ...(battle.projectiles ?? []),
    ]) {
      if (p.weapon !== 'native' || !p.native) continue;
      const known = this.history.get(p.id);
      // Recorded shots are immutable; keep the snapshot and its cached flight points.
      if (
        known &&
        known.launched === p.launched &&
        known.impact === p.impact &&
        known.spikyContinues === p.native.spikyBall?.continues &&
        known.shieldContinues === p.native.seekingShield?.continues &&
        known.nativeAim === p.nativeAim &&
        known.x === p.x &&
        known.y === p.y
      )
        continue;
      const packPath = nativeProjectilePack(p.native.name);
      if (!packPath) continue;
      const captured = snapshot(p, packPath, !!battle.nativeBowlerImpactArt);
      if (p.native.seekingShield) {
        const cast = battle.nativeSeekingShieldCasts?.find(
          (cast) => cast.id === p.native!.seekingShield!.castId,
        );
        if (cast) captured.animationAt = cast.launchAt;
      }
      this.history.set(p.id, captured);
    }
    for (const shot of [
      ...(battle.nativeArcherShots ?? []),
      ...(battle.nativeGiantArrows ?? []),
      ...(battle.nativeDarkOrbs ?? []),
    ]) {
      const end = shot.launched + shot.length / shot.speed;
      if (elapsed > end + AFTERLIFE || this.history.has(shot.id)) continue;
      const packPath = nativeProjectilePack(shot.projectile);
      if (!packPath) continue;
      this.history.set(shot.id, {
        id: shot.id,
        name: shot.projectile,
        packPath,
        sourceId: shot.sourceId,
        bounce: 0,
        ...(shot.projectile === 'QueenPierceProjectile' && battle.nativeGiantArrow
          ? { giantArrow: true as const }
          : {}),
        ...(shot.projectile === 'vfx_projectile_DarkOrb' && battle.nativeDarkOrb
          ? { darkOrb: true as const, fromAir: true }
          : {}),
        fromX: shot.fromX,
        fromY: shot.fromY,
        x: shot.fromX + shot.dirX * shot.length,
        y: shot.fromY + shot.dirY * shot.length,
        launched: shot.launched,
        impact: end,
        piercing: { dirX: shot.dirX, dirY: shot.dirY, length: shot.length, speed: shot.speed },
      });
    }
    for (const shot of battle.nativePiercing ?? []) {
      const seen = this.history.get(`pierce:${shot.id}`);
      if (seen?.launched === shot.launched && seen.piercing?.length === shot.length) continue;
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
      const line = snap.piercing ? (snap.line ??= { ...snap, ...snap.piercing }) : undefined;
      const options = {
        iso,
        airLift,
        ...(snap.seekingShield && snap.bounce > 0
          ? { launchHeight: snap.fromAir ? airLift : 16 }
          : {}),
      };
      const flightAt = (time: number) =>
        line
          ? nativePiercingFlight(row, line, time, iso, snap.darkOrb ? airLift : 0)
          : nativeProjectileFlight(
              row,
              snap.nativeAim ? { ...snap, ...nativeProjectileAimAt(snap, time) } : snap,
              time,
              options,
            );
      const flight = flightAt(elapsed);
      covered.add(id);
      const facing = flight.direction;
      const pointAt = (time: number) => {
        const at = flightAt(time);
        return { x: at.x, y: at.y };
      };
      const launchPoint = (snap.launchPoint ??= pointAt(snap.launched));
      if (snap.landingAt !== flight.end) {
        snap.landing = pointAt(flight.end);
        snap.landingAt = flight.end;
      }
      const landing = snap.landing!;
      // Off-screen shots keep their history (and coverage) but are neither sampled nor drawn.
      if (
        !this.layer.spans(launchPoint, landing, SHOT_MARGIN) &&
        !this.layer.visible(flight.x, flight.y, SHOT_MARGIN)
      )
        continue;
      const span = { launched: snap.launched, end: flight.end };
      if (elapsed <= flight.end) {
        const art = nativeProjectilePoses(
          pack,
          row,
          flight,
          elapsed,
          snap.animationAt ?? snap.launched,
          snap.giantArrow
            ? { staticChildClock: true }
            : snap.frostFlake
              ? { nestedTimeline: true }
              : undefined,
        );
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
      const trails = detail >= 2 ? false : detail === 1 ? (hashId(id) & 1) === 0 : true;
      if (row.ParticleEmitter && trails)
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
      if (row.Effect && trails)
        this.layer.effectTrail(
          row.Effect,
          `${id}:fx`,
          span,
          pointAt,
          elapsed,
          reduced,
          facing,
          FLIGHT_DEPTH - 1,
          !!snap.giantArrow,
        );
      if (row.SpawnEffect && this.running(row.SpawnEffect, snap.launched, elapsed))
        this.layer.play(
          {
            key: `${id}:spawn`,
            effect: row.SpawnEffect,
            at: snap.launched,
            ground: launchPoint,
            facing,
            ...(snap.darkOrb ? { nestedTimelines: true as const } : {}),
          },
          elapsed,
          reduced,
        );
      if (
        snap.bounce > 0 &&
        row.BounceEffect &&
        this.running(row.BounceEffect, snap.launched, elapsed)
      )
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
      if (
        row.DestroyedEffect &&
        !snap.spikyContinues &&
        !snap.bowlerContinues &&
        !snap.shieldContinues &&
        elapsed >= flight.end &&
        this.running(row.DestroyedEffect, flight.end, elapsed)
      ) {
        this.layer.play(
          {
            key: `${id}:hit`,
            effect: row.DestroyedEffect,
            at: flight.end,
            ground: landing,
            facing,
            ...(snap.darkOrb ? { nestedTimelines: true as const } : {}),
            depth: snap.toAir ? 7600 : undefined,
          },
          elapsed,
          reduced,
        );
      }
    }
    // A landed or culled shot parks its meshes for the next one instead of splicing them out.
    for (const [key, { view }] of this.views)
      if (!shown.has(key)) {
        view.retire();
        this.views.delete(key);
      }
    this.layer.end();
    this.covered = covered;
    return covered;
  }
}

function snapshot(p: CombatProjectile, packPath: string, bowlerArt = false): Snapshot {
  return {
    id: p.id,
    name: p.native!.name,
    packPath,
    sourceId: p.sourceId,
    bounce: p.native!.bounce ?? 0,
    ...(bowlerArt && p.native!.kind === 'bowler' && !p.native!.bounce
      ? { bowlerContinues: true as const }
      : {}),
    ...(p.native!.fireball ? { fireballLevel: p.native!.fireball.level } : {}),
    ...(p.native!.frostFlake ? { frostFlake: true as const } : {}),
    ...(p.native!.spikyBall?.continues ? { spikyContinues: true as const } : {}),
    ...(p.native!.seekingShield ? { seekingShield: true as const } : {}),
    ...(p.native!.seekingShield?.continues ? { shieldContinues: true as const } : {}),
    fromX: p.fromX,
    fromY: p.fromY,
    x: p.x,
    y: p.y,
    launched: p.launched,
    impact: p.impact,
    fromAir: p.fromAir,
    toAir: p.toAir,
    ...(p.nativeAim ? { nativeAim: p.nativeAim } : {}),
  };
}

export type { NativeProjectileRow };
