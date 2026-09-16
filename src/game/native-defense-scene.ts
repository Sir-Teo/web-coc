import type Phaser from 'phaser';
import defenseArt from '../../reference/full-client/defense-art.json';
import { BUILDINGS } from './data';
import type { Battle, Building, FX } from './model';
import { nativeScenePoses, type NativeMatrix, type NativeMeshGraph } from './native-mesh';
import { NativeSceneView } from './native-scene-view';
import {
  NativeArtPacks,
  nativePackPrefix,
  type NativeArtPack,
  type NativeRow,
} from './native-art-pack';
import { NativeEffectLayer } from './native-effect-layer';
import {
  NATIVE_ALTITUDE,
  NATIVE_ART_SCALE,
  nativeClipDuration,
  type NativeEffectEvent,
} from './native-effects';
import { nativeDirectionRoot } from './native-projectile-poses';
import { nativeDefenseTarget, nativeLabels } from './native-defense-poses';
import { weaponFor } from './native-defenses';
import { nativeRow, text } from './native-data';

type Point = { x: number; y: number };
interface DefenderState {
  scene: string;
  exports: string[];
  scale: number;
  actionFrame: number;
  loop: boolean;
}
interface DefenseLevel extends Record<string, string | number | undefined> {
  level: number;
}
export interface NativeDefensePack extends NativeArtPack {
  kind: string;
  levels: DefenseLevel[];
  weapons: Record<string, NativeRow[]>;
  spells: Record<string, NativeRow[]>;
  abilities: Record<string, (NativeRow & { animation: NativeRow[] })[]>;
  defenders: Record<string, Record<string, DefenderState>>;
  beams: Record<string, string>;
}
const index = defenseArt as unknown as { kinds: Record<string, { path: string }> };
export const nativeDefensePack = (kind: string) =>
  Object.hasOwn(index.kinds, kind) ? index.kinds[kind].path : undefined;

/** Local layout: several rooftop defenders stand a source pace apart across the platform. */
const DEFENDER_SPREAD = 22;
/** Recorded effect events are dropped once nothing can still be drawing them. */
const EVENT_LIFE = 6;

const center = (b: Building) => ({
  x: b.x + BUILDINGS[b.kind].size / 2,
  y: b.y + BUILDINGS[b.kind].size / 2,
});

/** Effect columns of a defense at its current level, weapon level and mode. */
export function nativeDefenseEffects(pack: NativeDefensePack, tower: Building) {
  const level = pack.levels.find((row) => row.level === tower.level) ?? pack.levels.at(-1);
  const columns: Record<string, string> = {};
  for (const [key, value] of Object.entries(level ?? {}))
    if (typeof value === 'string') columns[key] = value;
  const weapon = weaponFor(tower);
  const weaponName =
    tower.kind === 'spelltower'
      ? `SpellTower${(tower.spellMode ?? 'rage').replace(/^./, (c) => c.toUpperCase())}`
      : (level?.Weapon as string | undefined);
  const rows = weaponName ? pack.weapons[weaponName] : undefined;
  const weaponRow = rows
    ? rows[
        Math.max(
          0,
          Math.min(
            rows.length - 1,
            (tower.kind === 'townhall' ? (tower.weaponLevel ?? 1) : tower.level) - 1,
          ),
        )
      ]
    : undefined;
  return {
    level,
    weapon,
    attack: weaponRow?.AttackEffect ?? columns.AttackEffect,
    attack2: weaponRow?.AttackEffect2 ?? columns.AttackEffect2,
    attackAlt: columns.AttackEffectAlt,
    hit: weaponRow?.HitEffect ?? columns.HitEffect,
    activation: weaponRow?.ActivationEffect ?? columns.CombatActivationEffect,
    death: weaponRow?.DieDamageEffect ?? columns.DieDamageEffect,
    beamStart: columns.ExportNameBeamStart,
    beamEnd: columns.ExportNameBeamEnd,
    defender: columns.DefenderCharacter,
    defenderCount: Number(columns.DefenderCount ?? 0) || 0,
    defenderZ: Number(columns.DefenderZ ?? 0) || 0,
  };
}

interface Recorded extends NativeEffectEvent {
  expires: number;
}

/**
 * Battle presentation for the Town Hall 11-18 defenses: rooftop defenders, Eagle Artillery beams,
 * Giga Inferno beams and every declared attack, hit, activation, death and spell effect.
 */
export class NativeDefensePresentation {
  private packs: NativeArtPacks<NativeDefensePack>;
  private layer: NativeEffectLayer;
  private views = new Map<string, { prefix: string; view: NativeSceneView }>();
  private events: Recorded[] = [];
  private fired = new Map<number, number>();
  private awake = new Map<number, number>();
  private beams = new Map<string, number>();
  private pierced = new Map<string, number>();
  private sequence = 0;
  constructor(
    private scene: Phaser.Scene,
    effects: NativeArtPacks<NativeArtPack>,
  ) {
    this.packs = new NativeArtPacks<NativeDefensePack>(scene);
    this.layer = new NativeEffectLayer(scene, effects, 'defense');
  }
  pack(kind: string) {
    const path = nativeDefensePack(kind);
    return path ? this.packs.get(path) : undefined;
  }
  clear() {
    for (const { view } of this.views.values()) view.destroy();
    this.views.clear();
    this.layer.clear();
    this.events = [];
    this.fired.clear();
    this.awake.clear();
    this.beams.clear();
    this.pierced.clear();
  }
  destroy() {
    this.clear();
    this.packs.destroy();
  }
  /** True when this defense's own effect art replaces a drawn zap or impact flash. */
  covers(kind: string | undefined) {
    return !!kind && !!this.pack(kind);
  }
  private record(event: NativeEffectEvent, duration = EVENT_LIFE) {
    if (this.events.some((e) => e.key === event.key)) return;
    this.events.push({ ...event, expires: event.at + duration });
    if (this.events.length > 96) this.events.shift();
  }
  /**
   * Model effects that carry their own geometry: chained zaps and native projectile impacts.
   * Positions are map coordinates; they are projected when the frame is drawn.
   */
  note(fx: FX, battle: Battle | null, iso: (x: number, y: number) => Point, airLift: number) {
    if (!battle || battle.finished) return;
    const at = battle.elapsed;
    const tower = battle.buildings.find((b) => b.id === fx.sourceId);
    if (fx.type === 'defense-zap' && tower) {
      const pack = this.pack(tower.kind);
      if (!pack) return;
      const effects = nativeDefenseEffects(pack, tower);
      const chain = fx.text === 'chain';
      const effect = chain ? (effects.attackAlt ?? effects.attack) : effects.attack;
      const from = chain
        ? { x: iso(fx.x, fx.y).x, y: iso(fx.x, fx.y).y - airLift * 0.5 }
        : iso(tower.x + BUILDINGS[tower.kind].size / 2, tower.y + BUILDINGS[tower.kind].size / 2);
      const target = iso(fx.toX ?? fx.x, fx.toY ?? fx.y);
      const key = `${tower.id}:zap:${++this.sequence}`;
      if (effect)
        this.record({
          key,
          effect,
          at,
          ground: from,
          target: { x: target.x, y: target.y - (fx.toAir ? airLift : 12) },
          facing: { x: (fx.toX ?? 0) - fx.x, y: (fx.toY ?? 0) - fx.y },
          depth: 7700,
        });
      if (effects.attack2 && !chain)
        this.record({ key: `${key}:2`, effect: effects.attack2, at, ground: from, depth: 7700 });
      if (effects.hit)
        this.record({
          key: `${key}:hit`,
          effect: effects.hit,
          at,
          ground: target,
          lift: fx.toAir ? airLift : 0,
          depth: fx.toAir ? 7600 : undefined,
        });
      return;
    }
    if (fx.type === 'impact' && fx.weapon === 'native' && tower) {
      const pack = this.pack(tower.kind);
      const effects = pack ? nativeDefenseEffects(pack, tower) : undefined;
      if (!effects?.hit || fx.toX === undefined || fx.toY === undefined) return;
      const target = iso(fx.toX, fx.toY);
      this.record({
        key: `${fx.projectileId ?? tower.id}:hit`,
        effect: effects.hit,
        at,
        ground: target,
        lift: fx.toAir ? airLift : 0,
        facing: { x: fx.toX - fx.x, y: fx.toY - fx.y },
        depth: fx.toAir ? 7600 : undefined,
      });
      return;
    }
    if (fx.type === 'blast') {
      // Death bombs and Giga Bomb explosions carry no source id; match the structure they came from.
      const source = battle.buildings.find(
        (b) =>
          Math.abs(b.x + BUILDINGS[b.kind].size / 2 - fx.x) < 0.01 &&
          Math.abs(b.y + BUILDINGS[b.kind].size / 2 - fx.y) < 0.01,
      );
      const pack = source ? this.pack(source.kind) : undefined;
      if (!source || !pack) return;
      const effects = nativeDefenseEffects(pack, source);
      const ground = iso(fx.x, fx.y);
      for (const [i, effect] of [
        effects.death,
        effects.level?.Effect as string | undefined,
        effects.level?.Effect2 as string | undefined,
      ].entries())
        if (effect)
          this.record({ key: `${source.id}:death:${i}:${at.toFixed(2)}`, effect, at, ground });
    }
  }
  private effectsCache = new Map<string, ReturnType<typeof nativeDefenseEffects>>();
  render(
    buildings: readonly Building[],
    battle: Battle | null,
    elapsed: number,
    reduced: boolean,
    iso: (x: number, y: number) => Point,
    airLift: number,
  ) {
    this.layer.begin();
    const shown = new Set<string>();
    const live = battle && !battle.finished;
    const cam = (this.scene as unknown as { cameras?: { main?: { worldView?: { centerX: number; centerY: number; width: number; height: number } } } }).cameras?.main;
    const view = cam?.worldView;
    for (const tower of buildings) {
      const pack = this.pack(tower.kind);
      if (!pack) continue;
      const point = iso(center(tower).x, center(tower).y);
      // Same worldView early-out the village natives use; never derive tables for culled towers.
      if (
        view &&
        (Math.abs(point.x - view.centerX) > view.width / 2 + 420 ||
          Math.abs(point.y - view.centerY) > view.height / 2 + 420)
      )
        continue;
      const effectsKey = `${tower.kind}:${tower.level}:${tower.weaponLevel ?? ''}:${tower.spellMode ?? ''}:${tower.gearMode ?? ''}`;
      let effects = this.effectsCache.get(effectsKey);
      if (!effects) {
        effects = nativeDefenseEffects(pack, tower);
        // Bound the cache; tower variety per battle is small.
        if (this.effectsCache.size > 64) this.effectsCache.clear();
        this.effectsCache.set(effectsKey, effects);
      }
      const state = battle?.nativeDefenses?.[tower.id];
      const target = live ? nativeDefenseTarget(battle, tower) : undefined;
      const aim = target
        ? { x: target.x - center(tower).x, y: target.y - center(tower).y }
        : undefined;
      if (live && state) {
        if (state.awakeAt !== undefined && this.awake.get(tower.id) !== state.awakeAt) {
          this.awake.set(tower.id, state.awakeAt);
          if (effects.activation)
            this.record({
              key: `${tower.id}:activate:${state.awakeAt.toFixed(2)}`,
              effect: effects.activation,
              at: state.awakeAt,
              ground: point,
            });
        }
        if (state.firedAt !== undefined && this.fired.get(tower.id) !== state.firedAt) {
          this.fired.set(tower.id, state.firedAt);
          const effect =
            tower.kind === 'multigeartower' && (tower.gearMode ?? 'long') === 'fast'
              ? (effects.attackAlt ?? effects.attack)
              : effects.attack;
          // Beam weapons keep their attack effect alive from state.beams instead.
          if (effect && !state.beams?.length)
            this.record({
              key: `${tower.id}:attack:${state.firedAt.toFixed(3)}`,
              effect,
              at: state.firedAt,
              ground: point,
              facing: aim,
            });
        }
        this.renderBeams(tower, pack, effects, battle!, elapsed, point, iso, airLift, reduced);
      }
      if (effects.defender && pack.defenders[effects.defender])
        this.renderDefenders(tower, pack, effects, battle, elapsed, point, shown, reduced);
      this.renderArtilleryBeams(tower, pack, effects, battle, elapsed, point, iso, shown);
    }
    if (live) this.renderPiercingHits(battle!, iso);
    if (live) this.renderSpells(battle!, elapsed, iso, reduced);
    this.events = this.events.filter(
      (event) => event.at <= elapsed + 1e-6 && event.expires > elapsed,
    );
    for (const event of this.events) this.layer.play(event, elapsed, reduced);
    for (const [key, { view }] of this.views)
      if (!shown.has(key)) {
        view.destroy();
        this.views.delete(key);
      }
    this.layer.end();
  }
  /** Giga Inferno beams: one continuous attack effect per held beam target. */
  private renderBeams(
    tower: Building,
    pack: NativeDefensePack,
    effects: ReturnType<typeof nativeDefenseEffects>,
    battle: Battle,
    elapsed: number,
    point: Point,
    iso: (x: number, y: number) => Point,
    airLift: number,
    reduced: boolean,
  ) {
    const state = battle.nativeDefenses?.[tower.id];
    const held = new Set((state?.beams ?? []).map((id) => `${tower.id}:${id}`));
    for (const key of this.beams.keys())
      if (key.startsWith(`${tower.id}:`) && !held.has(key)) this.beams.delete(key);
    if (!effects.attack || !state?.beams?.length) return;
    for (const id of state.beams) {
      const unit = battle.units.find((u) => u.id === id && u.hp > 0);
      if (!unit) continue;
      const key = `${tower.id}:${id}`;
      const since = this.beams.get(key) ?? elapsed;
      this.beams.set(key, since);
      const target = iso(unit.x, unit.y);
      this.layer.play(
        {
          key: `beam:${key}:${since.toFixed(2)}`,
          effect: effects.attack,
          at: since,
          ground: point,
          target: { x: target.x, y: target.y - 16 },
          until: elapsed,
          depth: 7700,
        },
        elapsed,
        reduced,
      );
      if (effects.attack2)
        this.layer.play(
          {
            key: `beam2:${key}:${since.toFixed(2)}`,
            effect: effects.attack2,
            at: since,
            ground: target,
            until: elapsed,
            depth: 7600,
          },
          elapsed,
          reduced,
        );
    }
  }
  /** Eagle Artillery launch and landing beams, played while its shells are in the air. */
  private renderArtilleryBeams(
    tower: Building,
    pack: NativeDefensePack,
    effects: ReturnType<typeof nativeDefenseEffects>,
    battle: Battle | null,
    elapsed: number,
    point: Point,
    iso: (x: number, y: number) => Point,
    shown: Set<string>,
  ) {
    if (!battle || battle.finished || (!effects.beamStart && !effects.beamEnd)) return;
    for (const shot of battle.projectiles ?? []) {
      if (shot.sourceId !== tower.id || shot.weapon !== 'native') continue;
      const age = elapsed - shot.launched;
      if (age < 0) continue;
      for (const [role, name] of [
        ['start', effects.beamStart],
        ['end', effects.beamEnd],
      ] as const) {
        if (!name) continue;
        const sceneName = pack.beams[name];
        const graph = sceneName ? pack.scenes[sceneName] : undefined;
        if (!graph || graph.exports[name] === undefined) continue;
        const labels = nativeLabels(graph, graph.exports[name]);
        const clip = graph.clips[graph.exports[name]];
        const fps = clip?.fps ?? 24;
        const warm = labels.WarmUpEnd ?? Math.min(clip?.timeline.length ?? 1, 99);
        const loopStart = labels.Loop ?? warm;
        const loopEnd = labels.LoopEnd ?? (clip?.timeline.length ?? 1) - 1;
        const fade = labels.FadeStart ?? labels.fadeStart ?? loopEnd;
        const last = labels.FadeEnd ?? labels.fadeEnd ?? (clip?.timeline.length ?? 1) - 1;
        const flight = Math.max(0.001, shot.impact - shot.launched);
        let frame: number;
        if (elapsed <= shot.impact) {
          const warmup = warm / fps;
          frame =
            age < warmup
              ? age * fps
              : loopStart + (((age - warmup) * fps) % Math.max(1, loopEnd - loopStart + 1));
        } else {
          const after = elapsed - shot.impact;
          frame = fade + after * fps;
          if (frame > last) continue;
        }
        if (age > flight + 3) continue;
        const key = `${tower.id}:beam-${role}:${shot.id}`;
        const target = iso(shot.x, shot.y);
        const at = role === 'start' ? point : target;
        shown.add(
          this.draw(
            key,
            nativePackPrefix(nativeDefensePack(tower.kind)!, sceneName),
            nativeScenePoses(graph, name, frame / fps, {}, [
              NATIVE_ART_SCALE,
              0,
              0,
              0,
              NATIVE_ART_SCALE,
              0,
            ]),
            at.x,
            at.y,
            role === 'start' ? 7900 : -860,
          ),
        );
      }
    }
  }
  /** Rooftop defenders (Multi-Archer Tower archers, Super Wizard) at their declared height. */
  private renderDefenders(
    tower: Building,
    pack: NativeDefensePack,
    effects: ReturnType<typeof nativeDefenseEffects>,
    battle: Battle | null,
    elapsed: number,
    point: Point,
    shown: Set<string>,
    reduced: boolean,
  ) {
    if (tower.hp <= 0 || tower.constructing) return;
    const states = pack.defenders[effects.defender!];
    const count = Math.max(1, effects.defenderCount);
    const state = battle?.nativeDefenses?.[tower.id];
    const path = nativeDefensePack(tower.kind)!;
    for (let i = 0; i < count; i++) {
      const targetId = state?.targets?.[i] ?? state?.target ?? state?.targets?.[0];
      const unit =
        battle && !battle.finished
          ? battle.units.find((u) => u.id === targetId && u.hp > 0)
          : undefined;
      const aim = unit
        ? { x: unit.x - center(tower).x, y: unit.y - center(tower).y }
        : { x: 1, y: 1 };
      const fired = state?.firedAt;
      const attack = states.attack;
      const idle = states.idle;
      const clip = attack ? pack.scenes[attack.scene] : undefined;
      const root = nativeDirectionRoot(attack?.exports ?? [], aim.x, aim.y);
      const duration = clip && root.name ? nativeClipDuration(clip, root.name) : 0;
      const attacking =
        !!attack &&
        fired !== undefined &&
        elapsed - fired >= -attack.actionFrame / 24 &&
        elapsed - fired < duration;
      const source = attacking ? attack : idle;
      if (!source) continue;
      const graph = pack.scenes[source.scene];
      const chosen = nativeDirectionRoot(source.exports, aim.x, aim.y);
      if (!graph || !chosen.name || graph.exports[chosen.name] === undefined) continue;
      const clipDuration = nativeClipDuration(graph, chosen.name);
      let seconds = reduced
        ? 0
        : attacking
          ? Math.max(0, elapsed - fired! + source.actionFrame / 24)
          : Math.max(0, elapsed);
      if (!source.loop) seconds = Math.min(seconds, Math.max(0, clipDuration - 1e-3));
      const s = NATIVE_ART_SCALE * source.scale;
      const offset = (i - (count - 1) / 2) * DEFENDER_SPREAD;
      const matrix: NativeMatrix = [chosen.flip ? -s : s, 0, 0, 0, s, 0];
      shown.add(
        this.draw(
          `${tower.id}:defender:${i}`,
          nativePackPrefix(path, source.scene),
          nativeScenePoses(graph, chosen.name, seconds, {}, matrix),
          point.x + offset,
          point.y - effects.defenderZ * NATIVE_ALTITUDE,
          point.y + 3,
        ),
      );
    }
  }
  /** Firespitter balls report their hits through the shot record; each new one plays the hit effect. */
  private renderPiercingHits(battle: Battle, iso: (x: number, y: number) => Point) {
    const live = new Set<string>();
    for (const shot of battle.nativePiercing ?? []) {
      live.add(shot.id);
      const tower = battle.buildings.find((b) => b.id === shot.sourceId);
      const pack = tower ? this.pack(tower.kind) : undefined;
      if (!tower || !pack) continue;
      const effects = nativeDefenseEffects(pack, tower);
      const seen = this.pierced.get(shot.id) ?? 0;
      if (shot.hit.length <= seen) continue;
      this.pierced.set(shot.id, shot.hit.length);
      if (!effects.hit) continue;
      for (const id of shot.hit.slice(seen)) {
        const unit = battle.units.find((u) => u.id === id);
        if (!unit) continue;
        const ground = iso(unit.x, unit.y);
        this.record({
          key: `${shot.id}:hit:${id}`,
          effect: effects.hit,
          at: battle.elapsed,
          ground,
        });
      }
    }
    for (const id of this.pierced.keys()) if (!live.has(id)) this.pierced.delete(id);
  }
  /** Deploy and per-hit effects of the spells these defenses and traps cast. */
  private renderSpells(
    battle: Battle,
    elapsed: number,
    iso: (x: number, y: number) => Point,
    reduced: boolean,
  ) {
    for (const cast of battle.nativeSpells ?? []) {
      if (cast.side !== 'defense') continue;
      let rows: NativeRow[] | undefined;
      for (const kind of Object.keys(index.kinds)) {
        const pack = this.pack(kind);
        if (pack?.spells[cast.name]) {
          rows = pack.spells[cast.name];
          break;
        }
      }
      const row = rows?.[Math.max(0, Math.min(rows.length - 1, cast.level - 1))];
      if (!row) continue;
      const ground = iso(cast.x, cast.y);
      const duration =
        Math.max(0, cast.firstHit - cast.castAt) + cast.total * Math.max(0, cast.interval);
      for (const [i, effect] of [row.DeployEffect, row.DeployEffect2].entries())
        if (effect)
          this.layer.play(
            {
              key: `spell:${cast.id}:${i}`,
              effect,
              at: cast.castAt,
              ground,
              until: cast.castAt + duration,
            },
            elapsed,
            reduced,
          );
      if (row.HitEffect)
        for (let hit = 0; hit < Math.min(cast.hits, 12); hit++)
          this.layer.play(
            {
              key: `spell:${cast.id}:hit:${hit}`,
              effect: row.HitEffect,
              at: cast.firstHit + hit * Math.max(0, cast.interval),
              ground,
            },
            elapsed,
            reduced,
          );
    }
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
}

/** Spell records a defense or trap can cast, for callers that only have the client name. */
export const nativeDefenseSpellRow = (name: string, level: number) =>
  nativeRow('spells', name, level);
export const nativeDefenseSpellEffect = (name: string, level: number, column: string) =>
  text(nativeDefenseSpellRow(name, level), column);

export type { NativeMeshGraph };
