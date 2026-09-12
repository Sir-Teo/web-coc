import Phaser from 'phaser';
import type { Battle, Building } from './model';
import type { AudioManager } from './audio';
import type { SampleCue } from './sample-audio';
import { NativeSceneView } from './native-scene-view';
import { NativeMeshView, preloadNativeMeshes } from './native-mesh-scene';
import { nativeMeshPoses } from './native-mesh';
import { TESLA_GRAPH, TESLA_APPEAR_SOUND, teslaPoses, type TeslaVisualState } from './tesla-poses';
import { TESLA_ART, TESLA_ART_LEVELS, teslaAsset, teslaTexture } from './tesla-art';

const APPEAR_SAMPLE = 'tesla-appear';
export function preloadTeslas(scene: Phaser.Scene) {
  preloadNativeMeshes(scene, TESLA_GRAPH, 'tesla');
  for (const level of TESLA_ART_LEVELS) scene.load.image(teslaTexture(level), teslaAsset(level));
  scene.load.binary(APPEAR_SAMPLE, '/' + TESLA_APPEAR_SOUND.path);
}

export class TeslaPresentation {
  readonly towers = new Map<number, NativeSceneView>();
  readonly reveals = new Map<number, NativeMeshView>();
  private signatures = new Map<number, string>();
  constructor(
    private scene: Phaser.Scene,
    audio: AudioManager,
  ) {
    audio.samples.register(APPEAR_SAMPLE, scene.cache.binary.get(APPEAR_SAMPLE));
  }
  clear() {
    for (const view of [...this.towers.values(), ...this.reveals.values()]) view.destroy();
    this.towers.clear();
    this.reveals.clear();
    this.signatures.clear();
  }
  destroy() {
    this.clear();
  }
  render(
    buildings: Building[],
    battle: Battle | null,
    elapsed: number,
    reduced: boolean,
    iso: (x: number, y: number) => { x: number; y: number },
  ): SampleCue[] {
    const wanted = new Set<number>(),
      revealing = new Set<number>();
    const cues: SampleCue[] = [];
    const revealClip = TESLA_GRAPH.clips[TESLA_GRAPH.exports.tesla_appear_fx];
    const duration = revealClip.timeline.length / revealClip.fps;
    for (const tower of buildings) {
      if (tower.kind !== 'tesla') continue;
      wanted.add(tower.id);
      const at = battle?.revealedTeslas?.[tower.id];
      const state: TeslaVisualState =
        tower.hp <= 0
          ? 'ruin'
          : tower.constructing
            ? 'constructing'
            : tower.upgradeEnd
              ? 'upgrading'
              : at !== undefined
                ? 'reveal'
                : 'setup';
      const age = at === undefined ? elapsed : Math.max(0, elapsed - at);
      const p = iso(tower.x + 1, tower.y + 1);
      let view = this.towers.get(tower.id);
      if (!view) {
        view = new NativeSceneView(this.scene, 'tesla');
        this.towers.set(tower.id, view);
      }
      const camera = this.scene.cameras.main;
      const frame =
        !reduced && (state === 'setup' || state === 'reveal') ? Math.floor(age * 24 + 1e-9) : 0;
      const signature = `${tower.level}:${state}:${frame}:${reduced}:${p.x}:${p.y}:${camera.zoomX}:${camera.zoomY}`;
      if (this.signatures.get(tower.id) !== signature) {
        view.render(
          teslaPoses(tower.level, state, age, reduced),
          p.x,
          p.y,
          p.y + (state === 'ruin' ? -2 : 0),
        );
        for (const object of view.objects)
          object.setData('nativeTesla', { id: tower.id, level: tower.level, state });
        this.signatures.set(tower.id, signature);
      }
      if (at !== undefined && battle && !battle.finished) {
        cues.push({
          key: `tesla:${tower.id}:appear`,
          sample: APPEAR_SAMPLE,
          at,
          volume: 0.7,
          pitch: 1,
        });
        if (!reduced && age < duration) {
          revealing.add(tower.id);
          let reveal = this.reveals.get(tower.id);
          if (!reveal) {
            reveal = new NativeMeshView(this.scene, 'tesla');
            this.reveals.set(tower.id, reveal);
          }
          const s = TESLA_ART.scale;
          reveal.render(
            nativeMeshPoses(TESLA_GRAPH, 'tesla_appear_fx', age, {}, [s, 0, 0, 0, s, 0]),
            p.x,
            p.y,
            p.y - 0.01,
          );
        }
      }
    }
    for (const [id, view] of this.towers)
      if (!wanted.has(id)) {
        view.destroy();
        this.towers.delete(id);
        this.signatures.delete(id);
      }
    for (const [id, view] of this.reveals)
      if (!revealing.has(id)) {
        view.destroy();
        this.reveals.delete(id);
      }
    return cues;
  }
}
