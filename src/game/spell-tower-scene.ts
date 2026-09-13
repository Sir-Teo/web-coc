import type Phaser from 'phaser';
import type { AudioManager } from './audio';
import type { LatePresentation, LateRenderContext } from './late-campaign-scene';
import type { Building } from './model';
import type { SampleCue } from './sample-audio';
import { NativeSceneView } from './native-scene-view';
import { preloadNativeMeshes } from './native-mesh-scene';
import type { NativeParticlePose } from './native-particles';
import {
  SPELL_TOWER_ART_LEVELS,
  SPELL_TOWER_ART_WEAPONS,
  spellTowerAsset,
  spellTowerTexture,
} from './spell-tower-art';
import {
  SPELL_TOWER_EFFECTS,
  SPELL_TOWER_EMITTERS,
  SPELL_TOWER_GRAPH,
  SPELL_TOWER_SOUNDS,
  spellBottlePose,
  spellTowerBounds,
  spellTowerFrame,
  spellTowerPoses,
  type SpellTowerVisualState,
} from './spell-tower-poses';
import { SPELL_TOWER, spellTowerStats } from './spell-tower-stats';
import { sourceEffectPlayer } from './spell-tower-effect-player';

const PREFIX = 'spell-tower-native';
const sample = (path: string) => `spell-tower-${path.split('/').at(-1)!.replace('.ogg', '')}`;
/** Range markers stay visible, static and unfaded under reduced motion. */
const player = sourceEffectPlayer({
  graph: SPELL_TOWER_GRAPH,
  effects: SPELL_TOWER_EFFECTS,
  emitters: SPELL_TOWER_EMITTERS,
  artScale: 1.2,
  sample,
  prefix: 'spell-tower',
  reducedEmitters: ['rage_rangeRing3', 'Toxic_rangeRing1', 'invisibility_lvl6_ring2'],
});

export function preloadSpellTower(scene: Phaser.Scene) {
  preloadNativeMeshes(scene, SPELL_TOWER_GRAPH, PREFIX);
  for (const level of SPELL_TOWER_ART_LEVELS)
    for (const weapon of SPELL_TOWER_ART_WEAPONS)
      scene.load.image(spellTowerTexture(level, weapon), spellTowerAsset(level, weapon));
  for (const [path, sound] of Object.entries(SPELL_TOWER_SOUNDS))
    scene.load.binary(sample(path), '/' + sound.path);
}

const visualState = (b: Building): SpellTowerVisualState =>
  b.hp <= 0 ? 'ruin' : b.constructing ? 'constructing' : b.upgradeEnd ? 'upgrading' : 'setup';

/** State-driven presentation; rendering reads battle histories so replay seeks stay exact. */
export class SpellTowerPresentation implements LatePresentation {
  readonly towers = new Map<number, NativeSceneView>();
  readonly bottles = new Map<number, NativeSceneView>();
  readonly effects = new Map<string, NativeSceneView>();
  private signatures = new Map<number, string>();
  constructor(
    private scene: Phaser.Scene,
    audio: AudioManager,
  ) {
    for (const path of Object.keys(SPELL_TOWER_SOUNDS))
      audio.samples.register(sample(path), scene.cache.binary.get(sample(path)));
  }
  /** True once this family renders the building itself (the fallback sprite is hidden). */
  handles(b: Building) {
    return b.kind === 'spelltower';
  }
  bounds(b: Building): readonly [number, number, number, number] | undefined {
    return b.kind === 'spelltower'
      ? spellTowerBounds(b.level, b.spellTowerWeapon ?? 'rage', visualState(b))
      : undefined;
  }
  render(context: LateRenderContext): SampleCue[] {
    const { battle, elapsed, reduced, iso } = context;
    const wanted = new Set<number>(),
      flying = new Set<number>(),
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
          object.setData('nativeSpellTowerEffect', { key: fx.key, emitter: fx.emitter, tag });
      }
    };
    const family = battle?.late?.spellTower;
    for (const tower of context.buildings) {
      if (tower.kind !== 'spelltower') continue;
      wanted.add(tower.id);
      const weapon = tower.spellTowerWeapon ?? 'rage';
      const p = iso(tower.x + 1, tower.y + 1);
      const state = visualState(tower);
      const record = family?.towers[tower.id];
      const frame = spellTowerFrame(tower, record, elapsed, reduced);
      const seconds = reduced ? 0 : elapsed;
      const ruinAge = record?.destroyedAt !== undefined ? elapsed - record.destroyedAt : Infinity;
      let view = this.towers.get(tower.id);
      if (!view) this.towers.set(tower.id, (view = new NativeSceneView(this.scene, PREFIX)));
      const signature = `${tower.level}:${weapon}:${state}:${frame}:${Math.floor(seconds * 30 + 1e-9)}:${Math.min(1, Math.floor(ruinAge * 30))}:${p.x}:${p.y}:${zoom}`;
      if (this.signatures.get(tower.id) !== signature) {
        view.render(
          spellTowerPoses(tower.level, weapon, state, frame, seconds, ruinAge),
          p.x,
          p.y,
          p.y + (state === 'ruin' ? -2 : 0),
        );
        for (const object of view.objects)
          object.setData('nativeSpellTower', { id: tower.id, weapon, state, frame });
        this.signatures.set(tower.id, signature);
      }
      if (battle && !battle.finished && record?.destroyedAt !== undefined) {
        const effect = spellTowerStats(tower.level).destroyEffect;
        cues.push(...player.cues(`${tower.id}:destroyed`, effect, record.destroyedAt, tower.id, 0));
        draw(player.poses(`${tower.id}:destroyed`, effect, record.destroyedAt, elapsed, p, tower.id, 0, reduced), 'destroy');
      }
    }
    if (battle && !battle.finished && family)
      for (const entry of family.casts) {
        if (elapsed < entry.at) continue;
        const weapon = SPELL_TOWER[entry.weapon];
        const seed = entry.sourceId * 7 + entry.index;
        if (elapsed < entry.deployAt && !reduced) {
          flying.add(entry.index);
          const pose = spellBottlePose(entry, elapsed, iso);
          let view = this.bottles.get(entry.index);
          if (!view) this.bottles.set(entry.index, (view = new NativeSceneView(this.scene, PREFIX)));
          view.render(pose.poses, pose.x, pose.y, pose.depth);
          for (const object of view.objects)
            object.setData('nativeSpellBottle', { cast: entry.index, weapon: entry.weapon, progress: pose.t });
        }
        if (weapon.projectile.particleEmitter)
          draw(
            player.trail(
              `cast:${entry.index}:trail`,
              weapon.projectile.particleEmitter,
              entry.at,
              entry.deployAt,
              undefined,
              elapsed,
              (at) => {
                const pose = spellBottlePose(entry, at, iso);
                return { x: pose.x, y: pose.y };
              },
              seed,
              0,
              8000,
              reduced,
            ),
            'bottle-trail',
          );
        const center = iso(entry.x, entry.y);
        const effects = [weapon.projectile.destroyedEffect, weapon.spell.deployEffect, weapon.spell.deployEffect2].filter(
          (name): name is string => !!name,
        );
        for (const effect of effects) {
          if (elapsed >= entry.deployAt + player.duration(effect) + 0.05) continue;
          cues.push(...player.cues(`cast:${entry.index}:${effect}`, effect, entry.deployAt, seed, 1));
          draw(player.poses(`cast:${entry.index}:${effect}`, effect, entry.deployAt, elapsed, center, seed, 1, reduced), entry.weapon);
        }
      }
    for (const [id, view] of this.towers)
      if (!wanted.has(id)) {
        view.destroy();
        this.towers.delete(id);
        this.signatures.delete(id);
      }
    for (const [key, view] of this.bottles)
      if (!flying.has(key)) {
        view.destroy();
        this.bottles.delete(key);
      }
    for (const [key, view] of this.effects)
      if (!showing.has(key)) {
        view.destroy();
        this.effects.delete(key);
      }
    return cues;
  }
  clear() {
    for (const map of [this.towers, this.bottles, this.effects]) {
      for (const view of map.values()) view.destroy();
      map.clear();
    }
    this.signatures.clear();
  }
  destroy() {
    this.clear();
  }
}
