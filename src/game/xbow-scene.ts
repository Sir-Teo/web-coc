import Phaser from 'phaser';
import type { Battle, Building } from './model';
import type { AudioManager } from './audio';
import type { SampleCue } from './sample-audio';
import { NativeMeshView, preloadNativeMeshes } from './native-mesh-scene';
import { nativeMeshPoses, type NativeMatrix } from './native-mesh';
import { XBOW_GRAPH, XBOW_SOUNDS, xbowPoses } from './xbow-poses';
import { XBOW_ART, xbowAsset, xbowTexture, xbowDirection } from './xbow-art';
import { XBOW, XBOW_LEVELS, XBOW_PROJECTILES } from './xbow-stats';

type Point = { x: number; y: number };
const sample = (path: string) => `xbow-${path.split('/').at(-1)!.replace('.ogg', '')}`;

export function preloadXbows(scene: Phaser.Scene) {
  preloadNativeMeshes(scene, XBOW_GRAPH, 'xbow');
  for (const { level } of XBOW_LEVELS)
    for (const mode of ['ground', 'both'] as const)
      scene.load.image(xbowTexture(level, mode), xbowAsset(level, mode));
  for (const [path, sound] of Object.entries(XBOW_SOUNDS))
    scene.load.binary(sample(path), '/' + sound.path);
}

/** Native clips and samples use simulation time; calibrated world projection is local. */
export class XbowPresentation {
  readonly towers = new Map<number, NativeMeshView>();
  readonly bolts = new Map<string, NativeMeshView>();
  readonly shadows = new Map<string, NativeMeshView>();
  constructor(
    private scene: Phaser.Scene,
    private audio: AudioManager,
  ) {
    this.bindAudio();
  }
  /** Heavy art bundles in after boot; sounds bind when the binaries arrive. */
  bindAudio() {
    for (const path of Object.keys(XBOW_SOUNDS)) {
      const key = sample(path);
      if (this.scene.cache.binary.exists(key))
        this.audio.samples.register(key, this.scene.cache.binary.get(key));
    }
  }
  /** Heavy textures arrive after boot; the fallback sprite covers until then. */
  artReady = false;
  clear() {
    for (const view of [...this.towers.values(), ...this.bolts.values(), ...this.shadows.values()])
      view.destroy();
    this.towers.clear();
    this.bolts.clear();
    this.shadows.clear();
  }
  destroy() {
    this.clear();
  }
  render(
    buildings: Building[],
    battle: Battle | null,
    elapsed: number,
    reduced: boolean,
    iso: (x: number, y: number) => Point,
    airLift: number,
  ): SampleCue[] {
    if (!this.artReady) return [];
    const wanted = new Set<number>(),
      flights = new Set<string>();
    for (const tower of buildings) {
      if (tower.kind !== 'xbow' || tower.hp <= 0) continue;
      wanted.add(tower.id);
      let view = this.towers.get(tower.id);
      if (!view) {
        view = new NativeMeshView(this.scene, 'xbow');
        this.towers.set(tower.id, view);
      }
      const state = battle?.xbows?.[tower.id];
      const direction = state ? xbowDirection(state.aimX, state.aimY) : 0;
      const ammunition = state?.ammunition ?? XBOW.ammunition;
      const p = iso(tower.x + 1.5, tower.y + 1.5);
      view.render(
        xbowPoses(
          tower.level,
          tower.xbowMode ?? 'ground',
          direction,
          reduced ? 0 : elapsed,
          ammunition,
          !!tower.upgradeEnd || !!tower.constructing,
        ),
        p.x,
        p.y,
        p.y,
        tower.constructing ? 0.58 : 1,
      );
      for (const mesh of view.meshes.values())
        mesh.setData('xbow', { id: tower.id, direction, ammunition });
    }
    if (battle && !battle.finished && !reduced)
      for (const p of battle.projectiles ?? []) {
        if (p.weapon !== 'xbowbolt') continue;
        flights.add(p.id);
        let view = this.bolts.get(p.id);
        if (!view) {
          view = new NativeMeshView(this.scene, 'xbow');
          this.bolts.set(p.id, view);
        }
        const source = XBOW_PROJECTILES[p.variant! - 1];
        const age = Math.max(0, elapsed - p.launched);
        const progress = Math.min(1, age / Math.max(0.01, p.impact - p.launched));
        const flight = p.flight ?? { x: p.fromX, y: p.fromY, at: p.launched };
        const distance = Math.hypot(p.x - flight.x, p.y - flight.y);
        const f = distance
          ? Math.min(1, (Math.max(0, elapsed - flight.at) * source.speed) / distance)
          : 1;
        const ground = iso(flight.x + (p.x - flight.x) * f, flight.y + (p.y - flight.y) * f);
        const from = iso(p.fromX, p.fromY),
          to = iso(p.x, p.y);
        const length = Math.hypot(p.x - p.fromX, p.y - p.fromY) || 1;
        const forward = iso(
          p.fromX + (0.85 * (p.x - p.fromX)) / length,
          p.fromY + (0.85 * (p.y - p.fromY)) / length,
        );
        // Art registration and vertical projection are calibrated separately from tile-space physics.
        const muzzleLift = source.height * 0.8,
          hitLift = 18 + (p.toAir ? airLift : 0);
        const x = ground.x + (forward.x - from.x) * (1 - progress);
        const y =
          ground.y +
          (forward.y - from.y) * (1 - progress) -
          muzzleLift * (1 - progress) -
          hitLift * progress;
        const angle = Math.atan2(to.y - hitLift - y, to.x - x) - Math.PI / 2;
        const c = Math.cos(angle) * XBOW_ART.scale,
          s = Math.sin(angle) * XBOW_ART.scale;
        const root: NativeMatrix = [c, -s, 0, s, c, 0];
        let shadowView = this.shadows.get(p.id);
        if (!shadowView) {
          shadowView = new NativeMeshView(this.scene, 'xbow');
          this.shadows.set(p.id, shadowView);
        }
        const shadow = nativeMeshPoses(
          XBOW_GRAPH,
          'bolt_projectile_shadow',
          age,
          {},
          [0.6, 0, 0, 0, 0.6, 0],
        );
        shadowView.render(shadow, ground.x, ground.y, -839);
        const poses = nativeMeshPoses(XBOW_GRAPH, source.export, age, {}, root);
        // Above flying units (7500) like every other projectile type.
        view.render(poses, x, y, 7700);
        for (const mesh of view.meshes.values()) mesh.setData('xbowBolt', p.id);
      }
    for (const [id, view] of this.towers)
      if (!wanted.has(id)) {
        view.destroy();
        this.towers.delete(id);
      }
    for (const [id, view] of this.bolts)
      if (!flights.has(id)) {
        view.destroy();
        this.bolts.delete(id);
      }
    for (const [id, view] of this.shadows)
      if (!flights.has(id)) {
        view.destroy();
        this.shadows.delete(id);
      }
    const cues: SampleCue[] = [];
    if (battle && !battle.finished)
      for (const [id, state] of Object.entries(battle.xbows ?? {})) {
        // Stable variation keeps the source pitch range identical through replay seeks.
        const pitch = (index: number) =>
          1.1 + (((Number(id) * 31 + index * 17) >>> 0) % 101) / 1000;
        for (const shot of state.shots)
          cues.push({
            key: `xbow:${id}:shot:${shot.index}`,
            sample: 'xbow-bow_attack',
            at: shot.at,
            volume: 0.7,
            pitch: pitch(shot.index),
          });
        for (const hit of state.hits)
          cues.push({
            key: `xbow:${id}:hit:${hit.index}`,
            sample: 'xbow-generic_hit_01',
            at: hit.at,
            volume: 0.3,
            pitch: pitch(hit.index) - 0.15,
          });
        if (state.emptyAt !== undefined)
          cues.push({
            key: `xbow:${id}:empty`,
            sample: 'xbow-bow_out_of_ammo',
            at: state.emptyAt,
            volume: 0.8,
            pitch: 1.1,
          });
      }
    return cues;
  }
}
