import type Phaser from 'phaser';
import type { AudioManager } from './audio';
import type { LatePresentation, LateRenderContext } from './late-campaign-scene';
import type { Building } from './model';
import type { SampleCue } from './sample-audio';
import { NativeSceneView } from './native-scene-view';
import { NativeMeshView, preloadNativeMeshes } from './native-mesh-scene';
import type { NativeMeshPose } from './native-mesh';
import {
  EAGLE_ARTILLERY_ART_LEVELS,
  eagleArtilleryAsset,
  eagleArtilleryTexture,
} from './eagle-artillery-art';
import {
  EAGLE_ARTILLERY_BASE_GRAPH,
  EAGLE_ARTILLERY_GRAPH,
  eagleArtilleryBasePoses,
  eagleArtilleryBeamFrame,
  eagleArtilleryBeamPoses,
  eagleArtilleryBounds,
  eagleArtilleryPivot,
  eagleArtilleryPoses,
  eagleArtilleryShellPose,
  eagleArtilleryTurretFrame,
  volleyShellIndex,
  type EagleArtilleryVisualState,
} from './eagle-artillery-poses';
import {
  EAGLE_ARTILLERY_SOUNDS,
  eagleArtilleryEffectPoses,
  eagleArtillerySample,
  eagleArtillerySoundCues,
  eagleArtilleryTrailPoses,
} from './eagle-artillery-effects';
import { EAGLE_ARTILLERY, EAGLE_ARTILLERY_EFFECTS } from './eagle-artillery-stats';

const PREFIX = 'eagle-artillery';
const BASE_PREFIX = 'eagle-artillery-base';

export function preloadEagleArtillery(scene: Phaser.Scene) {
  preloadNativeMeshes(scene, EAGLE_ARTILLERY_GRAPH, PREFIX);
  preloadNativeMeshes(scene, EAGLE_ARTILLERY_BASE_GRAPH, BASE_PREFIX);
  for (const level of EAGLE_ARTILLERY_ART_LEVELS)
    scene.load.image(eagleArtilleryTexture(level), eagleArtilleryAsset(level));
  for (const [path, sound] of Object.entries(EAGLE_ARTILLERY_SOUNDS))
    scene.load.binary(eagleArtillerySample(path), '/' + sound.path);
}

/** State-driven presentation; rendering reads battle histories so replay seeks stay exact. */
export class EagleArtilleryPresentation implements LatePresentation {
  private bodies = new Map<number, NativeSceneView>();
  private bases = new Map<number, NativeMeshView>();
  private views = new Map<string, NativeSceneView>();
  private signatures = new Map<number, string>();
  constructor(
    private scene: Phaser.Scene,
    audio: AudioManager,
  ) {
    for (const path of Object.keys(EAGLE_ARTILLERY_SOUNDS))
      audio.samples.register(eagleArtillerySample(path), scene.cache.binary.get(eagleArtillerySample(path)));
  }
  /** True once this family renders the building itself (the fallback sprite is hidden). */
  handles(b: Building) {
    return b.kind === 'eagleartillery';
  }
  bounds(b: Building): readonly [number, number, number, number] | undefined {
    return this.handles(b) ? eagleArtilleryBounds(b.level) : undefined;
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
    const state = battle?.late?.eagleArtillery;
    const live = !!battle && !battle.finished;
    const show = (key: string, poses: Parameters<NativeSceneView['render']>[0], x: number, y: number, depth: number, data?: unknown) => {
      showing.add(key);
      const view = this.view(key);
      view.render(poses, x, y, depth);
      if (data !== undefined) for (const object of view.objects) object.setData('eagleArtillery', data);
    };
    const effect = (id: number, event: string, index: number, name: string, at: number, point: { x: number; y: number }) => {
      if (!live) return;
      cues.push(...eagleArtillerySoundCues(id, event, index, name, at));
      for (const fx of eagleArtilleryEffectPoses(id, event, index, name, at, elapsed, point, reduced))
        show(fx.key, fx.poses, fx.x, fx.y, fx.depth, { effect: name, emitter: fx.emitter });
    };
    const zoom = `${this.scene.cameras.main.zoomX}:${this.scene.cameras.main.zoomY}`;
    for (const b of context.buildings) {
      if (!this.handles(b)) continue;
      wanted.add(b.id);
      const p = iso(b.x + EAGLE_ARTILLERY.size / 2, b.y + EAGLE_ARTILLERY.size / 2);
      const tower = state?.towers[b.id];
      const visual: EagleArtilleryVisualState =
        b.hp <= 0 ? 'ruin' : b.constructing || b.upgradeEnd ? 'upgrading' : 'active';
      const frame = visual === 'active' ? eagleArtilleryTurretFrame(b.level, tower, reduced ? elapsed : elapsed) : 0;
      let base = this.bases.get(b.id);
      if (!base) this.bases.set(b.id, (base = new NativeMeshView(this.scene, BASE_PREFIX)));
      if (visual === 'ruin') base.clear();
      else base.render(eagleArtilleryBasePoses() as NativeMeshPose[], p.x, p.y, -880);
      let body = this.bodies.get(b.id);
      if (!body) this.bodies.set(b.id, (body = new NativeSceneView(this.scene, PREFIX)));
      const signature = `${b.level}:${visual}:${frame}:${p.x}:${p.y}:${zoom}`;
      if (this.signatures.get(b.id) !== signature) {
        body.render(eagleArtilleryPoses(b.level, visual, frame), p.x, p.y, p.y + (visual === 'ruin' ? -2 : 0), b.constructing ? 0.58 : 1);
        for (const object of body.objects)
          object.setData('eagleArtillery', { id: b.id, level: b.level, state: visual, frame, ammunition: tower?.ammunition ?? EAGLE_ARTILLERY.ammunition, awake: tower?.awakeAt !== undefined });
        this.signatures.set(b.id, signature);
      }
      if (!battle || !tower) continue;
      if (tower.destroyedAt !== undefined) effect(b.id, 'destroy', 0, EAGLE_ARTILLERY_EFFECTS.destroy, tower.destroyedAt, p);
      if (!live) continue;
      if (tower.emptyAt !== undefined) effect(b.id, 'empty', 0, EAGLE_ARTILLERY_EFFECTS.noAmmo, tower.emptyAt, p);
      const pivot = eagleArtilleryPivot(b.level, frame);
      for (const volley of tower.volleys) {
        effect(b.id, 'preattack', volley.index, EAGLE_ARTILLERY_EFFECTS.preAttack, volley.startedAt, p);
        for (const [i, at] of volley.launches.entries())
          effect(b.id, 'attack', volleyShellIndex(volley, i), EAGLE_ARTILLERY_EFFECTS.attack, at, p);
        if (reduced) continue;
        // Beam up: from the barrel pivot until the burst ends; beam down: the reticle until landing.
        const upFrame = eagleArtilleryBeamFrame('ExportNameBeamStart', volley.startedAt, volley.endedAt, elapsed);
        if (upFrame !== undefined && b.hp > 0)
          show(`beam-up:${b.id}:${volley.index}`, eagleArtilleryBeamPoses('ExportNameBeamStart', upFrame), p.x + pivot.x, p.y + pivot.y, p.y + 0.5, { beam: 'up', frame: upFrame });
        const shells = state!.shells.filter((s) => s.towerId === b.id && s.index > volley.index && s.index <= volley.index + volley.launches.length);
        const impacts = state!.impacts.filter((s) => s.towerId === b.id && s.index > volley.index && s.index <= volley.index + volley.launches.length);
        const landing = volley.launches.length
          ? shells.length
            ? undefined
            : impacts.at(-1)?.at
          : volley.endedAt;
        const current = volley === tower.volleys.at(-1) && tower.reticle;
        const target = current
          ? { x: tower.reticle![0] / 512 - 1, y: tower.reticle![1] / 512 - 1 }
          : (shells.at(-1) ?? impacts.at(-1));
        const downFrame = eagleArtilleryBeamFrame('ExportNameBeamEnd', volley.startedAt, landing, elapsed);
        if (downFrame !== undefined && target) {
          const g = iso(target.x, target.y);
          show(`beam-down:${b.id}:${volley.index}`, eagleArtilleryBeamPoses('ExportNameBeamEnd', downFrame), g.x, g.y, g.y + 1, { beam: 'down', frame: downFrame });
        }
      }
    }
    if (state && live) {
      for (const impact of state.impacts) {
        const ground = iso(impact.x, impact.y);
        effect(impact.towerId, 'hit', impact.index, EAGLE_ARTILLERY_EFFECTS.hit, impact.at, ground);
        effect(impact.towerId, 'spell', impact.index, EAGLE_ARTILLERY_EFFECTS.spellHit, impact.spellAt, impact.air ? { x: ground.x, y: ground.y - airLift } : ground);
      }
      if (!reduced)
        for (const shell of state.shells) {
          if (shell.arrivedAt !== undefined || elapsed + 1e-9 < shell.launchedAt) continue;
          const tower = context.buildings.find((b) => b.id === shell.towerId);
          const pivot = tower ? eagleArtilleryPivot(shell.level, eagleArtilleryTurretFrame(shell.level, state.towers[shell.towerId], elapsed)) : { x: 0, y: -96 };
          const pose = eagleArtilleryShellPose(shell, elapsed, iso, pivot, airLift);
          show(`shell:${shell.id}`, pose.poses, pose.x, pose.y, 8000, { shell: shell.id, u: pose.u });
          for (const fx of eagleArtilleryTrailPoses(shell.towerId, shell.index, shell.launchedAt, shell.arrivesAt, elapsed, (at) => {
            const point = eagleArtilleryShellPose(shell, at, iso, pivot, airLift);
            return { x: point.x, y: point.y };
          }, reduced))
            show(fx.key, fx.poses, fx.x, fx.y, fx.depth);
        }
    }
    for (const [id, view] of this.bodies)
      if (!wanted.has(id)) {
        view.destroy();
        this.bodies.delete(id);
        this.signatures.delete(id);
      }
    for (const [id, view] of this.bases)
      if (!wanted.has(id)) {
        view.destroy();
        this.bases.delete(id);
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
    for (const view of this.bases.values()) view.destroy();
    this.bodies.clear();
    this.bases.clear();
    this.views.clear();
    this.signatures.clear();
  }
  destroy() {
    this.clear();
  }
}
