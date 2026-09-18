import type Phaser from 'phaser';
import type { AudioManager } from './audio';
import type { LatePresentation, LateRenderContext } from './late-campaign-scene';
import type { Building } from './model';
import type { SampleCue } from './sample-audio';
import { NativeSceneView } from './native-scene-view';
import { preloadNativeMeshes } from './native-mesh-scene';
import { SCATTERSHOT_ART_LEVELS, scattershotAsset, scattershotTexture } from './scattershot-art';
import {
  SCATTERSHOT_GRAPH,
  scattershotBounds,
  scattershotConePoses,
  scattershotPoses,
  scattershotProjectilePose,
  scattershotTurret,
  type ScattershotVisualState,
} from './scattershot-poses';
import {
  SCATTERSHOT_SOUNDS,
  scattershotEffectPoses,
  scattershotSample,
  scattershotSoundCues,
  scattershotTrailPoses,
} from './scattershot-effects';
import { SCATTERSHOT, SCATTERSHOT_EFFECTS, scattershotStats } from './scattershot-stats';

const PREFIX = 'scattershot';

export function preloadScattershot(scene: Phaser.Scene) {
  preloadNativeMeshes(scene, SCATTERSHOT_GRAPH, PREFIX);
  for (const level of SCATTERSHOT_ART_LEVELS)
    scene.load.image(scattershotTexture(level), scattershotAsset(level));
  for (const [path, sound] of Object.entries(SCATTERSHOT_SOUNDS))
    scene.load.binary(scattershotSample(path), '/' + sound.path);
}

/** State-driven presentation; rendering reads battle histories so replay seeks stay exact. */
export class ScattershotPresentation implements LatePresentation {
  private bodies = new Map<number, NativeSceneView>();
  private views = new Map<string, NativeSceneView>();
  private signatures = new Map<number, string>();
  constructor(
    private scene: Phaser.Scene,
    audio: AudioManager,
  ) {
    for (const path of Object.keys(SCATTERSHOT_SOUNDS))
      audio.samples.register(scattershotSample(path), scene.cache.binary.get(scattershotSample(path)));
  }
  /** True once this family renders the building itself (the fallback sprite is hidden). */
  handles(b: Building) {
    return b.kind === 'scattershot';
  }
  bounds(b: Building): readonly [number, number, number, number] | undefined {
    return this.handles(b) ? scattershotBounds(b.level) : undefined;
  }
  private view(key: string) {
    let view = this.views.get(key);
    if (!view) this.views.set(key, (view = new NativeSceneView(this.scene, PREFIX)));
    return view;
  }
  render(context: LateRenderContext): SampleCue[] {
    const { battle, elapsed, reduced, iso, airLift } = context;
    const cues: SampleCue[] = [],
      wanted = new Set<number>(),
      showing = new Set<string>();
    const state = battle?.late?.scattershot;
    const live = !!battle && !battle.finished;
    const show = (key: string, poses: Parameters<NativeSceneView['render']>[0], x: number, y: number, depth: number, data?: unknown) => {
      showing.add(key);
      const view = this.view(key);
      view.render(poses, x, y, depth);
      if (data !== undefined) for (const object of view.objects) object.setData('scattershot', data);
    };
    const effect = (id: number, event: string, index: number, name: string, at: number, point: { x: number; y: number }, facing?: { x: number; y: number }) => {
      if (!live) return;
      cues.push(...scattershotSoundCues(id, event, index, name, at));
      for (const fx of scattershotEffectPoses(id, event, index, name, at, elapsed, point, reduced, facing))
        show(fx.key, fx.poses, fx.x, fx.y, fx.depth, { effect: name, emitter: fx.emitter });
    };
    const zoom = `${this.scene.cameras.main.zoomX}:${this.scene.cameras.main.zoomY}`;
    for (const b of context.buildings) {
      if (!this.handles(b)) continue;
      wanted.add(b.id);
      const p = iso(b.x + SCATTERSHOT.size / 2, b.y + SCATTERSHOT.size / 2);
      const tower = state?.towers[b.id];
      const visual: ScattershotVisualState =
        b.hp <= 0 ? 'ruin' : b.constructing || b.upgradeEnd ? 'upgrading' : 'active';
      const turret = visual === 'ruin' ? 0 : scattershotTurret(tower, b.level, elapsed, reduced);
      let body = this.bodies.get(b.id);
      if (!body) this.bodies.set(b.id, (body = new NativeSceneView(this.scene, PREFIX)));
      const signature = `${b.level}:${visual}:${turret}:${p.x}:${p.y}:${zoom}`;
      if (this.signatures.get(b.id) !== signature) {
        body.render(scattershotPoses(b.level, visual, turret), p.x, p.y, p.y + (visual === 'ruin' ? -2 : 0), b.constructing ? 0.58 : 1);
        for (const object of body.objects)
          object.setData('scattershot', { id: b.id, level: b.level, state: visual, turret, ammunition: tower?.ammunition ?? SCATTERSHOT.ammunition });
        this.signatures.set(b.id, signature);
      }
      if (!battle || !tower) continue;
      if (tower.destroyedAt !== undefined) effect(b.id, 'destroy', 0, SCATTERSHOT_EFFECTS.destroy, tower.destroyedAt, p);
      for (const shot of tower.shots)
        effect(b.id, 'attack', shot.index, SCATTERSHOT_EFFECTS.attack, shot.at, p, { x: shot.dirX, y: shot.dirY });
    }
    if (state && live) {
      for (const impact of state.impacts) {
        const apex = iso(impact.x, impact.y);
        const ground = impact.air ? { x: apex.x, y: apex.y - airLift } : apex;
        const facing = { x: impact.dirX, y: impact.dirY };
        effect(impact.towerId, 'hit', impact.index, SCATTERSHOT_EFFECTS.hit, impact.spellAt, ground, facing);
        if (!reduced) {
          const cone = scattershotConePoses(impact.dirX, impact.dirY, elapsed - impact.spellAt);
          if (cone.length) show(`cone:${impact.id}`, cone, ground.x, ground.y, 8000, { cone: impact.id });
        }
      }
      if (!reduced)
        for (const p of state.projectiles) {
          if (p.arrivedAt !== undefined || elapsed <= p.launchedAt + 1e-9) continue;
          const pose = scattershotProjectilePose(p, iso, airLift, elapsed);
          // Above flying units (7500) like every other projectile type.
          show(`projectile:${p.id}`, pose.poses, pose.x, pose.y, 7700, { projectile: p.id, u: pose.u });
          show(`shadow:${p.id}`, pose.shadow, pose.ground.x, pose.ground.y, -869);
          const span = Math.max(1e-6, elapsed - p.launchedAt);
          const trail = scattershotTrailPoses(p.towerId, p.index, scattershotStats(p.level).trailEmitter, p.launchedAt, elapsed, (at) => {
            const f = Math.max(0, Math.min(1, (at - p.launchedAt) / span));
            const past = { ...p, x: p.fromX + (p.x - p.fromX) * f, y: p.fromY + (p.y - p.fromY) * f };
            const point = scattershotProjectilePose(past, iso, airLift, at);
            return { x: point.x, y: point.y };
          }, reduced);
          for (const fx of trail) show(fx.key, fx.poses, fx.x, fx.y, fx.depth);
        }
    }
    for (const [id, view] of this.bodies)
      if (!wanted.has(id)) {
        view.destroy();
        this.bodies.delete(id);
        this.signatures.delete(id);
      }
    for (const [key, view] of this.views)
      if (!showing.has(key)) {
        view.destroy();
        this.views.delete(key);
      }
    return cues;
  }
  clear() {
    for (const view of [...this.bodies.values(), ...this.views.values()]) view.destroy();
    this.bodies.clear();
    this.views.clear();
    this.signatures.clear();
  }
  destroy() {
    this.clear();
  }
}
