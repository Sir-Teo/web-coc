import type Phaser from 'phaser';
import { BUILDINGS, TROOPS } from './data';
import { HERO_UNIT, PET_UNIT } from './native-hero-data';
import type { Battle } from './model';

export interface BakedFrame {
  image: string;
  x: number;
  y: number;
  w: number;
  h: number;
  anchorX: number;
  anchorY: number;
}
export interface BakedState {
  fps: number;
  loop: boolean;
  frames: BakedFrame[][];
}
interface Atlas {
  states: Record<string, BakedState>;
}
const KEYS: Record<string, string> = Object.fromEntries(
  [...Object.entries(HERO_UNIT), ...Object.entries(PET_UNIT)].map(([key, unit]) => [unit, key]),
);
/** The baker's direction order is screen E, SE, S, SW, W, NW, N, NE. */
export const bakedDirection = (dx: number, dy: number) =>
  ((Math.round(Math.atan2((dx + dy) / 2, dx - dy) / (Math.PI / 4)) % 8) + 8) % 8;
export function bakedFrame(state: BakedState, direction: number, seconds: number) {
  const frames = state.frames[direction % state.frames.length];
  const index = Math.max(0, Math.floor(seconds * state.fps));
  return frames[state.loop ? index % frames.length : Math.min(index, frames.length - 1)];
}

/** Lazy loads baked atlases; existing sprites stay visible until all textures are ready. */
export class HeroNativePresentation {
  private packs = new Map<string, Atlas>();
  private pending = new Set<string>();
  private sprites = new Map<number, Phaser.GameObjects.Image>();
  private positions = new Map<
    number,
    { x: number; y: number; direction: number; state: string; since: number }
  >();
  private alive = true;
  constructor(private scene: Phaser.Scene) {}
  private async load(key: string) {
    if (this.pending.has(key)) return;
    this.pending.add(key);
    try {
      const response = await fetch(`/assets/${key}/atlas.json`);
      if (!response.ok) throw Error(`HTTP ${response.status}`);
      const pack = (await response.json()) as Atlas;
      const images = new Set(
        Object.values(pack.states).flatMap((s) => s.frames.flat().map((f) => f.image)),
      );
      await Promise.all(
        [...images].map(async (file) => {
          const texture = `baked:${key}/${file}`;
          if (this.scene.textures.exists(texture)) return;
          const image = new Image();
          image.src = `/assets/${key}/${file}`;
          await image.decode();
          if (!this.alive) return;
          const loaded = this.scene.textures.exists(texture)
            ? this.scene.textures.get(texture)
            : this.scene.textures.addImage(texture, image);
          if (!loaded) throw Error(`Could not load ${texture}`);
          for (const state of Object.values(pack.states))
            for (const frame of state.frames.flat()) {
              const name = `${frame.x}:${frame.y}:${frame.w}:${frame.h}`;
              if (frame.image === file && !loaded.has(name))
                loaded.add(name, 0, frame.x, frame.y, frame.w, frame.h);
            }
        }),
      );
      if (this.alive) this.packs.set(key, pack);
    } catch (error) {
      console.error('Baked character animation', key, error);
    }
  }
  clear() {
    for (const sprite of this.sprites.values()) sprite.destroy();
    this.sprites.clear();
    this.positions.clear();
  }
  destroy() {
    this.alive = false;
    this.clear();
  }
  render(
    battle: Battle | null,
    reduced: boolean,
    iso: (x: number, y: number) => { x: number; y: number },
    lift: number,
    units: Map<number, Phaser.GameObjects.Image>,
    defenders: Map<number, Phaser.GameObjects.Image>,
  ) {
    const wanted = new Set<number>();
    if (battle) {
      const actors = [
        ...battle.units.flatMap((u) => {
          const key = KEYS[u.kind] ?? (u.hero ? 'king' : undefined);
          if (!key || u.ejected || (u.spawnedAt ?? 0) > battle.elapsed) return [];
          const target = battle.buildings.find((b) => b.id === u.target);
          const enemy = battle.defenders?.find((d) => d.id === u.defenderTarget);
          return [
            {
              ...u,
              key: `heroes-native/${key}`,
              flying: !!TROOPS[u.kind].flying,
              targetPoint:
                enemy ??
                (target
                  ? {
                      x: target.x + BUILDINGS[target.kind].size / 2,
                      y: target.y + BUILDINGS[target.kind].size / 2,
                    }
                  : undefined),
              fallback: units.get(u.id),
              rate: TROOPS[u.kind].rate,
            },
          ];
        }),
        ...(battle.defenders ?? []).flatMap((d) =>
          d.kind === 'guardian' || d.kind === 'hero'
            ? [
                {
                  ...d,
                  key:
                    d.kind === 'hero'
                      ? `heroes-native/${d.hero}`
                      : `guardians-native/${d.guardian}`,
                  flying: d.mode === 'air',
                  targetPoint: battle.units.find((u) => u.id === d.target),
                  fallback: defenders.get(d.id),
                  rate: 1,
                },
              ]
            : [],
        ),
      ];
      for (const actor of actors) {
        const pack = this.packs.get(actor.key);
        if (!pack) {
          void this.load(actor.key);
          continue;
        }
        const old = this.positions.get(actor.id);
        const dx = actor.x - (old?.x ?? actor.x),
          dy = actor.y - (old?.y ?? actor.y);
        const moving = Math.abs(dx) + Math.abs(dy) > 1e-6;
        const heading = actor.attacking ? actor.targetPoint : undefined;
        const direction = heading
          ? bakedDirection(heading.x - actor.x, heading.y - actor.y)
          : moving
            ? bakedDirection(dx, dy)
            : (old?.direction ?? 2);
        const stateName =
          actor.hp <= 0
            ? 'die'
            : 'phase' in actor && actor.phase === 'leaping'
              ? 'jump'
              : actor.attacking
                ? 'attack'
                : moving
                  ? 'walk'
                  : 'idle';
        const since = old?.state === stateName ? old.since : battle.elapsed;
        this.positions.set(actor.id, {
          x: actor.x,
          y: actor.y,
          direction,
          state: stateName,
          since,
        });
        const state =
          pack.states[(actor.flying ? 'alt_' : '') + stateName] ??
          pack.states[stateName] ??
          pack.states.idle;
        if (!state) continue;
        const deathAge = battle.elapsed - (actor.defeatedAt ?? battle.elapsed);
        actor.fallback?.setVisible(false);
        if (actor.hp <= 0 && deathAge > 1.5) continue;
        const seconds = reduced
          ? 0
          : actor.hp <= 0
            ? deathAge
            : actor.attacking && actor.kind !== 'guardian'
              ? Math.max(0, actor.rate - actor.cooldown)
              : battle.elapsed - since;
        const frame = bakedFrame(state, direction, seconds);
        const texture = `baked:${actor.key}/${frame.image}`,
          name = `${frame.x}:${frame.y}:${frame.w}:${frame.h}`;
        let sprite = this.sprites.get(actor.id);
        if (!sprite) {
          sprite = this.scene.add.image(0, 0, texture, name).setData('nativeHero', actor.id);
          this.sprites.set(actor.id, sprite);
        }
        const point = iso(actor.x, actor.y);
        const scale = 'shrink' in actor && (actor.shrink?.until ?? 0) > battle.elapsed ? 0.5 : 1;
        const invisible =
          'native' in actor && (actor.native?.effects?.invisibleUntil ?? 0) > battle.elapsed;
        sprite
          .setTexture(texture, name)
          .setOrigin(frame.anchorX / frame.w, frame.anchorY / frame.h)
          .setPosition(point.x, point.y - (actor.flying ? lift : 0))
          .setScale(0.6 * scale)
          .setDepth(actor.flying ? 7500 : point.y + 1.2)
          .setAlpha(actor.hp <= 0 ? Math.max(0, 1 - deathAge / 1.5) : invisible ? 0.35 : 1);
        wanted.add(actor.id);
      }
    }
    for (const [id, sprite] of this.sprites)
      if (!wanted.has(id)) {
        sprite.destroy();
        this.sprites.delete(id);
      }
  }
}
