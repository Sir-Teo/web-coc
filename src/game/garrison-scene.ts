import type Phaser from 'phaser';
import type { NativeArtPack, NativeArtPacks } from './native-art-pack';
import type { Battle } from './model';
import { NativeSceneView } from './native-scene-view';
import { preloadNativeMeshes } from './native-mesh-scene';
import {
  characterArtLoaded,
  characterArt,
  characterArts,
  commonDeathArt,
  projectileArts,
  projectileGroupArts,
} from './character-art';
import { characterLayers } from './garrison-layers';
import { GARRISON_SOUNDS, garrisonSample } from './garrison-sounds';
import type { AudioManager } from './audio';
import { GARRISON_EFFECT_GRAPH, garrisonImpactPoses } from './garrison-effects';
import { garrisonShotPoses } from './garrison-projectiles';
import { garrisonStats } from './garrison-kinds';
import { GarrisonLateEffects } from './garrison-late-scene';
import { NativeEffectViews } from './native-effect-views';
import { registerCachedSample } from './sample-audio';
import { presentationLive, presentationTime } from './presentation-clock';
import { unitDepth } from './unit-depth';
import { guardRender } from './render-guard';
import { applyStatusTint } from './troop-native-scene';
import { defenderStatusTint } from './unit-status-tint';
import { defenderOpacity } from './defender-opacity';

/** Sets a data value only when it differs (every setData emits change events). */
function tag(objects: readonly Phaser.GameObjects.GameObject[], name: string, value: unknown) {
  for (const object of objects) if (object.getData(name) !== value) object.setData(name, value);
}

/** Local alpha for concealed defenders (no source transparency value is known). */
export const GARRISON_CONCEALED_ALPHA = 0.55;

/** No Flight Zone's Dragon 7 and Balloon 8 use the smaller garrison character batch. */
export const BOOT_GARRISON_CHARACTERS = ['Dragon7', 'Balloon Goblin8'] as const;
const BOOT_CHARACTERS = new Set<string>(BOOT_GARRISON_CHARACTERS);

/** Portable garrisons can need later characters without owning a late campaign building. */
export const garrisonNeedsLateArt = (garrisons: Battle['garrisons']) =>
  !!garrisons?.some((reserve) =>
    reserve.troops.some(
      (troop) => !BOOT_CHARACTERS.has(garrisonStats(troop.kind, troop.level).animation),
    ),
  );

/** Boot-time garrison art: effects and sounds. The shared death comes with the characters. */
export function preloadGarrisonTroops(scene: Phaser.Scene) {
  preloadNativeMeshes(scene, GARRISON_EFFECT_GRAPH, 'garrison-effects');
  for (const [path, sound] of Object.entries(GARRISON_SOUNDS))
    scene.load.binary(garrisonSample(path), '/' + sound.path);
}
/** Shared by foundation and later defenders, whichever batch reaches it first. */
export function preloadGarrisonDeath(scene: Phaser.Scene) {
  const death = commonDeathArt();
  preloadNativeMeshes(scene, death.graph, death.prefix);
}
export function preloadGarrisonCharacter(
  scene: Phaser.Scene,
  name: (typeof BOOT_GARRISON_CHARACTERS)[number],
) {
  const art = characterArt(name);
  preloadNativeMeshes(scene, art.graph, art.prefix);
}
/** Explicit callers retain the complete foundation character preload. */
export function preloadGarrisonCharacters(scene: Phaser.Scene) {
  preloadGarrisonDeath(scene);
  for (const name of BOOT_GARRISON_CHARACTERS) preloadGarrisonCharacter(scene, name);
}
/** Selected defender bodies and shared projectiles; explicit callers can still preload all. */
export function preloadLateGarrisonTroops(scene: Phaser.Scene, animations?: ReadonlySet<string>) {
  if (animations?.size === 0) return;
  const bodies = animations
    ? [...animations].filter((name) => !BOOT_CHARACTERS.has(name)).map(characterArt)
    : Object.entries(characterArts()).flatMap(([name, art]) =>
        BOOT_CHARACTERS.has(name) ? [] : [art],
      );
  for (const art of [
    commonDeathArt(),
    ...bodies,
    ...Object.values(projectileArts()),
    ...Object.values(projectileGroupArts()),
  ])
    preloadNativeMeshes(scene, art.graph, art.prefix);
}
export class GarrisonPresentation {
  readonly defenders = new Map<number, NativeSceneView>();
  readonly shadows = new Map<number, NativeSceneView>();
  private fx: NativeEffectViews;
  /** Live particle views by key (pooled; see NativeEffectViews). */
  readonly effects: Map<string, NativeSceneView>;
  readonly shots = new Map<string, NativeSceneView>();
  private families = new Map<number, string>();
  /** Later families: native chain lightning, death bolts, aura pulses and summon glows. */
  private late: GarrisonLateEffects;
  constructor(
    private scene: Phaser.Scene,
    audio: AudioManager,
    effects: NativeArtPacks<NativeArtPack>,
  ) {
    this.fx = new NativeEffectViews(scene, 'garrison-effects', 'nativeGarrisonEffect');
    this.effects = this.fx.views;
    for (const path of Object.keys(GARRISON_SOUNDS))
      registerCachedSample(scene, audio.samples, garrisonSample(path));
    this.late = new GarrisonLateEffects(scene, effects);
  }
  clear() {
    this.late.clear();
    for (const view of this.defenders.values()) view.destroy();
    this.defenders.clear();
    for (const view of this.shadows.values()) view.destroy();
    this.shadows.clear();
    this.families.clear();
    this.fx.clear();
    for (const view of this.shots.values()) view.destroy();
    this.shots.clear();
  }
  render(
    battle: Battle | null,
    reduced: boolean,
    iso: (x: number, y: number) => { x: number; y: number },
    lift: number,
  ) {
    // Defenders draw once their graphs are in; a battle with a garrison waits for them.
    if (!characterArtLoaded()) return;
    // Bursts sample the presentation clock: they play out for the grace window after the
    // finish, then clear, instead of freezing at the final battle time.
    if (battle && presentationLive(battle))
      for (const p of garrisonImpactPoses(battle, reduced, iso, lift, presentationTime(battle)))
        this.fx.show(p);
    this.fx.sweep();
    this.renderShots(battle, reduced, iso, lift);
    this.late.render(battle, reduced, iso, lift);
    const wanted = new Set<number>();
    for (const defender of battle?.defenders ?? []) {
      if (
        defender.kind === 'skeleton' ||
        defender.kind === 'guardian' ||
        defender.kind === 'repairer' ||
        defender.kind === 'hero'
      )
        continue;
      wanted.add(defender.id);
      const guard = `garrison ${defender.kind} level ${defender.level}`;
      const layers = guardRender(
        guard,
        () => characterLayers(defender, battle!, reduced),
        undefined,
      );
      const family =
        layers?.prefix ??
        this.families.get(defender.id) ??
        (defender.kind === 'dragon' && defender.hp <= 0 ? commonDeathArt().prefix : `unborn`);
      if (this.families.get(defender.id) !== family) {
        this.defenders.get(defender.id)?.destroy();
        this.defenders.delete(defender.id);
        this.shadows.get(defender.id)?.destroy();
        this.shadows.delete(defender.id);
        this.families.set(defender.id, family);
      }
      let view = this.defenders.get(defender.id);
      if (!view) this.defenders.set(defender.id, (view = new NativeSceneView(this.scene, family)));
      const point = iso(defender.x, defender.y);
      let shadow = this.shadows.get(defender.id);
      if (!shadow)
        this.shadows.set(defender.id, (shadow = new NativeSceneView(this.scene, family)));
      const flying = guardRender(
        guard,
        () => garrisonStats(defender.kind, defender.level).flying,
        false,
      );
      // Original shadows stay on the ground; flyers receive the local air lift and draw above
      // rooftops, while ground troops sort with buildings by their projected ground point.
      shadow.render(layers?.shadow ?? [], point.x, point.y, flying ? -839 : point.y + 1.05);
      tag(shadow.objects, 'nativeGarrisonShadow', defender.id);
      view.render(
        layers?.body ?? [],
        point.x,
        point.y - (flying ? lift : 0),
        // Flyers sort inside the shared air band with the attacking air troops.
        flying ? unitDepth(point.y, defender.id, true) : point.y + 1.1,
        // Spell Tower concealment and Royal Ghost stealth share the strongest local cue.
        Math.min(
          defenderOpacity(battle!, defender),
          (defender.stealthUntil ?? 0) > battle!.elapsed ? GARRISON_CONCEALED_ALPHA : 1,
        ),
      );
      applyStatusTint(view, defenderStatusTint(defender, battle!.elapsed));
      tag(view.objects, 'nativeGarrisonDefender', defender.id);
    }
    for (const [id, view] of this.defenders)
      if (!wanted.has(id)) {
        view.destroy();
        this.defenders.delete(id);
        this.families.delete(id);
        this.shadows.get(id)?.destroy();
        this.shadows.delete(id);
      }
  }
  private renderShots(
    battle: Battle | null,
    reduced: boolean,
    iso: (x: number, y: number) => { x: number; y: number },
    lift: number,
  ) {
    const wanted = new Set<string>();
    for (const shot of garrisonShotPoses(
      battle,
      reduced,
      iso,
      lift,
      battle ? presentationTime(battle) : undefined,
    )) {
      const layers = [{ ...shot }];
      if (shot.shadow)
        layers.push({ ...shot, ...shot.shadow, key: `${shot.key}:shadow`, depth: -838 });
      for (const { key, prefix, poses, x, y, depth } of layers) {
        wanted.add(key);
        let view = this.shots.get(key);
        if (!view) this.shots.set(key, (view = new NativeSceneView(this.scene, prefix)));
        view.render(poses, x, y, depth);
        tag(view.objects, 'nativeGarrisonShot', key);
      }
    }
    for (const [key, view] of this.shots)
      if (!wanted.has(key)) {
        view.destroy();
        this.shots.delete(key);
      }
  }
}
