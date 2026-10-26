import fs from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { makeBuilding, type Battle, type Unit } from '../src/game/model';
import { defendingHero, stepDefendingHeroes } from '../src/game/defending-heroes';
import { HERO_UNIT, PET_UNIT } from '../src/game/native-hero-data';
import { nativeUnitStats } from '../src/game/native-units';
import { createGuardian, guardianStats, stepGuardian } from '../src/game/native-guardians';
import type { NativeTroopContext } from '../src/game/native-troops';

// Scene views are Phaser objects; record what the presentations ask them to draw instead.
vi.mock('../src/game/native-scene-view', () => {
  class FakeObject {
    x = 0;
    y = 0;
    depth = 0;
    visible = true;
    tint = 0xffffff;
    tintMode = 0;
    data: Record<string, unknown> = {};
    setPosition(x: number, y: number) {
      this.x = x;
      this.y = y;
      return this;
    }
    setDepth(depth: number) {
      this.depth = depth;
      return this;
    }
    setVisible(visible: boolean) {
      this.visible = visible;
      return this;
    }
    setTint(tint: number) {
      this.tint = tint;
      return this;
    }
    setTintMode(mode: number) {
      this.tintMode = mode;
      return this;
    }
    clearTint() {
      this.tint = 0xffffff;
      this.tintMode = 0;
      return this;
    }
    getData(key: string) {
      return this.data[key];
    }
    setData(key: string, value: unknown) {
      this.data[key] = value;
      return this;
    }
  }
  class NativeSceneView {
    objects: FakeObject[] = [];
    meshes = new Map();
    renders = 0;
    last?: { x: number; y: number; depth: number };
    constructor(
      public scene: unknown,
      public prefix: string,
    ) {}
    render(_poses: unknown[], x: number, y: number, depth: number) {
      this.renders++;
      this.last = { x, y, depth };
      if (!this.objects.length) this.objects = [new FakeObject(), new FakeObject()];
      this.objects.forEach((o, i) =>
        o
          .setPosition(x, y)
          .setDepth(depth + i * 1e-6)
          .setVisible(true),
      );
    }
    destroy() {
      this.objects = [];
    }
  }
  return { NativeSceneView, quantizedDensity: (d: number) => Math.max(1, Math.round(d * 2) / 2) };
});
vi.mock('../src/game/native-mesh-scene', () => ({
  nativeMeshTexture: (prefix: string, id: string) => `${prefix}:${id}`,
}));

const { UnitMotionTracker, unitAnimationPhase } = await import('../src/game/unit-motion');
const { TroopNativePresentation } = await import('../src/game/troop-native-scene');
const { HeroNativePresentation, heroArtDirectory } = await import('../src/game/hero-native-scene');
const { NativeDefenseEventLog, NativeDefensePresentation, NATIVE_DEFENSE_SPELL_KIND } =
  await import('../src/game/native-defense-scene');
const { NativeProjectilePresentation } = await import('../src/game/native-projectile-scene');
const { unitDepth } = await import('../src/game/unit-depth');

const iso = (x: number, y: number) => ({ x: (x - y) * 32, y: (x + y) * 16 });
const unit = (id: number, x: number, y: number, extra: Partial<Unit> = {}): Unit => ({
  id,
  kind: 'archer',
  x,
  y,
  hp: 100,
  maxHp: 100,
  cooldown: 0,
  target: null,
  path: [{ x: x + 10, y }],
  pathAt: 0,
  attacking: false,
  ...extra,
});
const battleOf = (units: Unit[]) =>
  ({ units, buildings: [], elapsed: 1, troopLevels: { archer: 1 } }) as unknown as Battle;
const fakeScene = (
  viewZoom = 2,
  worldView = { centerX: 0, centerY: 400, width: 1400, height: 900 },
) =>
  ({
    viewZoom,
    cameras: { main: { worldView, zoom: viewZoom * 2, zoomX: viewZoom * 2, zoomY: viewZoom * 2 } },
    scale: { displayScale: { x: 2, y: 2 } },
    textures: { exists: () => true, get: () => ({ has: () => true }) },
    add: {
      image: () => {
        const sprite = {
          x: 0,
          y: 0,
          depth: 0,
          scaleX: 1,
          scaleY: 1,
          alpha: 1,
          angle: 0,
          visible: true,
          tintTopLeft: 0xffffff,
          tintMode: 0,
          texture: { key: '' },
          frame: { name: '' },
          setData: () => sprite,
          setTexture: (key: string, name: string) => {
            sprite.texture.key = key;
            sprite.frame.name = name;
            return sprite;
          },
          setOrigin: () => sprite,
          setPosition: (x: number, y: number) => ((sprite.x = x), (sprite.y = y), sprite),
          setScale: (value: number) => ((sprite.scaleX = sprite.scaleY = value), sprite),
          setAlpha: (value: number) => ((sprite.alpha = value), sprite),
          setAngle: (value: number) => ((sprite.angle = value), sprite),
          setTint: (t: number) => ((sprite.tintTopLeft = t), sprite),
          setTintMode: (m: number) => ((sprite.tintMode = m), sprite),
          clearTint: () => ((sprite.tintTopLeft = 0xffffff), (sprite.tintMode = 0), sprite),
          setDepth: (d: number) => ((sprite.depth = d), sprite),
          setVisible: (value: boolean) => ((sprite.visible = value), sprite),
          destroy: () => {},
        };
        return sprite;
      },
    },
  }) as never;
const archerPack = JSON.parse(
  fs.readFileSync('public/assets/troops-native/archer/graph.json', 'utf8'),
);
const troops = (scene = fakeScene()) => {
  const p = new TroopNativePresentation(scene);
  const internals = p as unknown as {
    packs: Map<string, unknown>;
    levelsReady: Map<string, Set<number>>;
  };
  internals.packs.set('archer', archerPack);
  // Its textures count as uploaded for every level, as a finished level load leaves them.
  internals.levelsReady.set(
    'archer',
    new Set(archerPack.levels.map((row: { level: number }) => row.level)),
  );
  return p;
};
type Views = Map<
  number,
  { state: string; view: { objects: { visible: boolean; depth: number }[]; renders: number } }
>;
const viewsOf = (p: object) => (p as unknown as { views: Views }).views;

describe('unit motion tracker', () => {
  it('keeps walking across rendered frames between 20 Hz simulation steps', () => {
    const motion = new UnitMotionTracker();
    const states: boolean[] = [];
    let x = 0;
    for (let frame = 0; frame < 30; frame++) {
      // Three rendered frames per sim step: position and clock change on every third frame.
      if (frame % 3 === 0) x += 0.1;
      states.push(motion.update(1, x, 0, Math.floor(frame / 3) * 0.05).moving);
    }
    expect(states.slice(3)).toEqual(states.slice(3).map(() => true));
  });
  it('holds the walk state while the clock is paused and stops after the unit halts', () => {
    const motion = new UnitMotionTracker();
    motion.update(1, 0, 0, 1);
    expect(motion.update(1, 0.1, 0, 1.05).moving).toBe(true);
    for (let i = 0; i < 20; i++) expect(motion.update(1, 0.1, 0, 1.05).moving).toBe(true);
    // Standing still for longer than the grace window reads as idle.
    motion.update(1, 0.1, 0, 1.1);
    expect(motion.update(1, 0.1, 0, 1.2).moving).toBe(false);
  });
  it('restarts history on a backward seek', () => {
    const motion = new UnitMotionTracker();
    motion.update(1, 0, 0, 10);
    motion.update(1, 1, 0, 10.05);
    // Seek back to 2 s: the unit is elsewhere and later standing still.
    motion.update(1, 5, 5, 2);
    expect(motion.update(1, 5, 5, 2.5).moving).toBe(false);
  });
  it('gives deterministic, spread-out phases', () => {
    expect(unitAnimationPhase(7, 1)).toBe(unitAnimationPhase(7, 1));
    const phases = new Set(
      Array.from({ length: 20 }, (_, id) => unitAnimationPhase(id, 1).toFixed(3)),
    );
    expect(phases.size).toBeGreaterThan(15);
  });
});

describe('troop native presentation', () => {
  it.each([false, true])(
    'attaches the Inferno Dragon beam to its drawn mouth, reduced=%s',
    (reduced) => {
      const p = troops();
      const pack = JSON.parse(
        fs.readFileSync('public/assets/troops-native/infernodragon/graph.json', 'utf8'),
      );
      const internals = p as unknown as {
        packs: Map<string, unknown>;
        levelsReady: Map<string, Set<number>>;
        views: Map<number, { x: number; y: number; sample: { name: string; mirror: number } }>;
      };
      internals.packs.set('infernodragon', pack);
      internals.levelsReady.set('infernodragon', new Set([1]));
      const u = unit(7, 5, 5, {
        kind: 'infernodragon',
        attacking: true,
        path: [],
        target: 2,
        defenderTarget: -1,
        native: {},
      });
      const battle = battleOf([u]);
      battle.buildings = [makeBuilding(2, 'goldstorage', 0, 12, 1)];
      const d = defendingHero({ kind: 'king', level: 1, x: 10, y: 5 }, 0);
      d.id = -1;
      battle.defenders = [d];
      const project = (x: number, y: number) => ({ x: x * 10, y: y * 10 });
      const draw = () => p.render(battle, reduced, project, 46, new Map());
      const original = JSON.stringify(battle);
      draw();
      const view = internals.views.get(u.id)!;
      expect(view.sample.mirror).toBe(1);
      expect(view.sample.name).toBe(pack.levels[0].states.attack.exports[2]);
      const mouth = p.attachment(u.id, 'attack_pivot')!;
      expect(Number.isFinite(mouth.x) && Number.isFinite(mouth.y)).toBe(true);
      expect(p.attachment(u.id, 'attack_pivot')).toEqual(mouth);
      expect(p.attachment(u.id, 'missing')).toBeUndefined();
      draw();
      expect(p.attachment(u.id, 'attack_pivot')).toEqual(mouth);
      expect(JSON.stringify(battle)).toBe(original);
      u.x += 1;
      battle.elapsed += 0.05;
      draw();
      expect(p.attachment(u.id, 'attack_pivot')!.x).toBeCloseTo(mouth.x + 10, 8);
      p.clear();
      expect(p.attachment(u.id, 'attack_pivot')).toBeUndefined();
    },
  );
  for (const stage of ['graph', 'textures'] as const) {
    it(`keeps the sprite pass visible until native ${stage} load, then hands off once`, () => {
      const p = troops();
      const internals = p as unknown as {
        packs: Map<string, unknown>;
        levelsReady: Map<string, Set<number>>;
        load(kind: string): Promise<void>;
        loadLevel(kind: string, level: number): Promise<void>;
      };
      vi.spyOn(internals, 'load').mockResolvedValue(undefined);
      vi.spyOn(internals, 'loadLevel').mockResolvedValue(undefined);
      if (stage === 'graph') internals.packs.clear();
      else internals.levelsReady.clear();
      const fallback = {
        visible: true,
        setVisible(value: boolean) {
          this.visible = value;
          return this;
        },
      };
      const sprites = new Map([[1, fallback]]) as never;
      const battle = battleOf([unit(1, 10, 10)]);
      p.render(battle, false, iso, 70, sprites);
      expect(fallback.visible).toBe(true);
      expect(p.drewUnit(1)).toBe(false);
      // The sprite pass may cull a unit or use a transparent stand-in: never force it on.
      fallback.visible = false;
      p.render(battle, false, iso, 70, sprites);
      expect(fallback.visible).toBe(false);
      internals.packs.set('archer', archerPack);
      internals.levelsReady.set('archer', new Set([1]));
      fallback.visible = true;
      p.render(battle, false, iso, 70, sprites);
      expect(p.drewUnit(1)).toBe(true);
      expect(fallback.visible).toBe(false);
    });
  }

  it('draws walking troops with the walk clip on every frame, not only on sim steps', () => {
    const p = troops();
    const u = unit(1, 10, 10);
    const battle = battleOf([u]);
    const drawn: string[] = [];
    for (let frame = 0; frame < 18; frame++) {
      if (frame % 3 === 0) {
        battle.elapsed = 1 + (frame / 3) * 0.05;
        u.x += 0.05;
      }
      p.render(battle, false, iso, 70, new Map());
      drawn.push(viewsOf(p).get(1)!.state);
    }
    expect(new Set(drawn.slice(3))).toEqual(new Set(['walk']));
  });
  it('holds the walk clip while a replay is paused', () => {
    const p = troops();
    const u = unit(1, 10, 10);
    const battle = battleOf([u]);
    p.render(battle, false, iso, 70, new Map());
    battle.elapsed += 0.05;
    u.x += 0.05;
    for (let frame = 0; frame < 30; frame++) {
      p.render(battle, false, iso, 70, new Map());
      expect(viewsOf(p).get(1)!.state).toBe('walk');
    }
  });
  it('gives overlapping units distinct depths', () => {
    const p = troops();
    const a = unit(1, 10, 10),
      b = unit(2, 10, 10);
    p.render(battleOf([a, b]), false, iso, 70, new Map());
    const depthA = viewsOf(p).get(1)!.view.objects[0].depth;
    const depthB = viewsOf(p).get(2)!.view.objects[0].depth;
    expect(depthA).not.toBe(depthB);
    expect(depthA).toBeCloseTo(unitDepth(iso(10, 10).y, 1, false, 1), 9);
    expect(depthB).toBeCloseTo(unitDepth(iso(10, 10).y, 2, false, 1), 9);
  });
  it('keeps distant LOD troops visible at retina density and resamples them at a reduced rate', () => {
    // viewZoom 0.5 (camera zoom 1 at display density 2) activates LOD; 200 units exceed the cap.
    const worldView = { centerX: 0, centerY: 900, width: 4000, height: 2400 };
    const p = troops(fakeScene(0.5, worldView));
    const units = Array.from({ length: 200 }, (_, i) =>
      unit(i + 1, 2 + (i % 20) * 3, 2 + Math.floor(i / 20) * 6),
    );
    const battle = battleOf(units);
    const frames = 8;
    for (let frame = 0; frame < frames; frame++) {
      battle.elapsed += 0.05;
      for (const u of units) u.x += 0.02;
      p.render(battle, false, iso, 70, new Map());
    }
    const views = viewsOf(p);
    expect(views.size).toBe(200);
    for (const { view } of views.values()) expect(view.objects.every((o) => o.visible)).toBe(true);
    const lod = p.lodFrozen;
    expect(lod).toBeGreaterThan(0);
    const renders = [...views.values()].map(({ view }) => view.renders);
    // Distant units were resampled on only some frames.
    expect(Math.min(...renders)).toBeLessThan(frames);
  });
});

describe('hero native presentation', () => {
  it.each([false, true])(
    'draws the source Phoenix Egg ground pose without a synthetic idle clip, reduced=%s',
    (reduced) => {
      const p = new HeroNativePresentation(fakeScene());
      const atlas = JSON.parse(
        fs.readFileSync('public/assets/heroes-native/phoenixegg/atlas.json', 'utf8'),
      );
      (p as unknown as { packs: Map<string, unknown> }).packs.set(
        'heroes-native/phoenixegg',
        atlas,
      );
      const egg = unit(99, 10, 10, { kind: 'phoenixegg', level: 1, path: [], native: {} });
      const battle = battleOf([egg]);
      const original = JSON.stringify(battle);
      const project = (x: number, y: number) => ({ x: x * 10, y: y * 10 });
      p.render(battle, reduced, project, 46, new Map(), new Map());
      const sprite = (p as unknown as { sprites: Map<number, any> }).sprites.get(egg.id);
      expect(sprite.visible).toBe(true);
      expect(sprite.texture.key).toBe('baked:heroes-native/phoenixegg/walk.png');
      expect(sprite.y).toBe(100);
      expect(atlas.states.idle).toBeUndefined();
      p.render(battle, reduced, project, 46, new Map(), new Map());
      expect(JSON.stringify(battle)).toBe(original);
    },
  );
  it.each(['hero', 'guardian'] as const)(
    'shows native Invisibility on a defending %s through expiry and backward redraws',
    (kind) => {
      const p = new HeroNativePresentation(fakeScene());
      const key = kind === 'hero' ? 'heroes-native/king' : 'guardians-native/longshot';
      const file =
        kind === 'hero'
          ? 'public/assets/characters/king-v1/atlas.json'
          : 'public/assets/guardians-native/longshot/atlas.json';
      (p as unknown as { packs: Map<string, unknown> }).packs.set(
        key,
        JSON.parse(fs.readFileSync(file, 'utf8')),
      );
      const battle = battleOf([]);
      battle.nativeRoster = true;
      const d =
        kind === 'hero'
          ? defendingHero({ kind: 'king', level: 1, x: 10, y: 10 }, 0)
          : createGuardian(battle, makeBuilding(1, 'townhall', 10, 10, 18), -1001)!;
      d.spawnedAt = 0;
      d.invisibleUntil = 2;
      battle.defenders = [d];
      for (const [at, alpha] of [
        [1, 0.35],
        [2, 1],
        [0.5, 0.35],
      ]) {
        battle.elapsed = at;
        for (const reduced of [false, true]) {
          const before = JSON.stringify(battle);
          p.render(battle, reduced, iso, 70, new Map(), new Map());
          const sprite = (p as unknown as { sprites: Map<number, { alpha: number }> }).sprites.get(
            d.id,
          )!;
          expect(sprite.alpha).toBe(alpha);
          expect(JSON.stringify(battle)).toBe(before);
        }
      }
    },
  );
  for (const destination of ['building', 'defender'] as const) {
    it.each([undefined, 2, 999])(
      `faces the actual Wall before its ${destination} destination, wall id=%s`,
      (wallId) => {
        const p = new HeroNativePresentation(fakeScene());
        const atlas = JSON.parse(
          fs.readFileSync('public/assets/characters/king-v1/atlas.json', 'utf8'),
        );
        (p as unknown as { packs: Map<string, unknown> }).packs.set('heroes-native/king', atlas);
        const king = unit(1, 10, 10, {
          kind: 'barbarianking',
          hero: 'king',
          target: 3,
          path: [],
          attacking: true,
          cooldown: 1.2,
          native: wallId === undefined ? {} : { wallTarget: wallId },
        });
        const battle = battleOf([king]);
        battle.townhall = 18;
        battle.buildings = [
          makeBuilding(2, 'wall', 10, 12, 18),
          makeBuilding(3, 'townhall', 16, 4, 18),
        ];
        battle.nativeHeroes = [{ kind: 'king', level: 1, items: [], unitId: king.id }];
        if (destination === 'defender') {
          const enemy = defendingHero({ kind: 'king', level: 1, x: 16, y: 10 }, 0);
          battle.defenders = [enemy];
          king.defenderTarget = enemy.id;
        }
        // These three points occupy distinct atlas directions: Wall SW, building E, enemy SE.
        const direction = wallId === 2 ? 3 : destination === 'building' ? 0 : 1;
        const sprites = (
          p as unknown as {
            sprites: Map<number, { frame: { name: string } }>;
          }
        ).sprites;
        for (const at of [1, 1, 0.5]) {
          battle.elapsed = at;
          const before = JSON.stringify(battle);
          p.render(battle, false, iso, 70, new Map(), new Map());
          const frame = atlas.states.attack.frames[direction][0];
          expect(sprites.get(1)!.frame.name).toBe(`${frame.x}:${frame.y}:${frame.w}:${frame.h}`);
          expect(JSON.stringify(battle)).toBe(before);
          p.render(battle, true, iso, 70, new Map(), new Map());
          const reduced = (atlas.normalizedAttack ? atlas.states.idle : atlas.states.attack).frames[
            direction
          ][0];
          expect(sprites.get(1)!.frame.name).toBe(
            `${reduced.x}:${reduced.y}:${reduced.w}:${reduced.h}`,
          );
          expect(JSON.stringify(battle)).toBe(before);
        }
      },
    );
  }
  it.each([
    { level: 1, scale: 1.7, until: 14 },
    { level: 3, scale: 1.75, until: 14.5 },
    { level: 6, scale: 1.8, until: 15 },
    { level: 9, scale: 1.85, until: 15.5 },
    { level: 12, scale: 1.9, until: 16 },
    { level: 15, scale: 1.95, until: 16.5 },
    { level: 18, scale: 2, until: 17 },
    { level: 21, scale: 2.05, until: 17.5 },
    { level: 24, scale: 2.1, until: 18 },
    { level: 27, scale: 2.15, until: 19 },
  ])(
    'draws source Gauntlet growth at level $level and restores size at expiry',
    ({ level, scale, until }) => {
      const p = new HeroNativePresentation(fakeScene());
      const atlas = JSON.parse(
        fs.readFileSync('public/assets/characters/king-v1/atlas.json', 'utf8'),
      );
      (p as unknown as { packs: Map<string, unknown> }).packs.set('heroes-native/king', atlas);
      const king = unit(1, 10, 10, {
        kind: 'barbarianking',
        hero: 'king',
        native: { effects: { splash: { until, radius: 2.5 } } },
      });
      const battle = battleOf([king]);
      battle.nativeHeroes = [
        {
          kind: 'king',
          level: 1,
          unitId: 1,
          items: [{ slug: 'giant-gauntlet', level }],
          abilityAt: 0,
          abilityUsed: true,
        },
      ];
      const before = JSON.stringify(battle);
      p.render(battle, false, iso, 70, new Map(), new Map());
      const sprites = (p as unknown as { sprites: Map<number, { scaleX: number; alpha: number }> })
        .sprites;
      expect(sprites.get(1)!.scaleX).toBeCloseTo(atlas.scale * scale, 12);
      expect(JSON.stringify(battle)).toBe(before);
      p.render(battle, true, iso, 70, new Map(), new Map());
      expect(sprites.get(1)!.scaleX).toBeCloseTo(atlas.scale * scale, 12);
      king.shrink = { since: 0, until: 10, timeLost: 0 };
      p.render(battle, false, iso, 70, new Map(), new Map());
      expect(sprites.get(1)!.scaleX).toBeCloseTo(atlas.scale * scale * 0.5, 12);
      delete king.shrink;
      battle.elapsed = until;
      p.render(battle, false, iso, 70, new Map(), new Map());
      expect(sprites.get(1)!.scaleX).toBe(atlas.scale);
    },
  );

  it.each([false, true])(
    'holds the enlarged Gauntlet knockout before fading, reduced=%s',
    (reduced) => {
      const p = new HeroNativePresentation(fakeScene());
      const atlas = JSON.parse(
        fs.readFileSync('public/assets/characters/king-v1/atlas.json', 'utf8'),
      );
      (p as unknown as { packs: Map<string, unknown> }).packs.set('heroes-native/king', atlas);
      const king = unit(1, 10, 10, {
        kind: 'barbarianking',
        hero: 'king',
        hp: 0,
        defeatedAt: 2,
        native: { effects: { splash: { until: 14, radius: 2.5 } } },
      });
      const battle = battleOf([king]);
      battle.nativeHeroes = [
        {
          kind: 'king',
          level: 1,
          unitId: 1,
          items: [{ slug: 'giant-gauntlet', level: 1 }],
          abilityAt: 0,
          abilityUsed: true,
        },
      ];
      const sprites = (
        p as unknown as {
          sprites: Map<
            number,
            { scaleX: number; alpha: number; angle: number; frame: { name: string } }
          >;
        }
      ).sprites;
      battle.elapsed = 5;
      p.render(battle, reduced, iso, 70, new Map(), new Map());
      expect(sprites.get(1)?.alpha).toBe(1);
      expect(sprites.get(1)?.angle).toBe(-70);
      expect(sprites.get(1)!.scaleX).toBeCloseTo(atlas.scale * 1.7, 12);
      const frame = atlas.states.die.frames[2].at(-1);
      expect(sprites.get(1)!.frame.name).toBe(`${frame.x}:${frame.y}:${frame.w}:${frame.h}`);
      battle.elapsed = 14.75;
      p.render(battle, reduced, iso, 70, new Map(), new Map());
      expect(sprites.get(1)!.scaleX).toBe(atlas.scale);
      expect(sprites.get(1)!.alpha).toBeCloseTo(0.5, 12);
      battle.elapsed = 15.55;
      p.render(battle, reduced, iso, 70, new Map(), new Map());
      expect(sprites.has(1)).toBe(false);
      battle.elapsed = 5;
      p.render(battle, reduced, iso, 70, new Map(), new Map());
      expect(sprites.get(1)?.alpha).toBe(1);
    },
  );
  for (const effect of ['poison', 'chill', 'boost'] as const)
    it.each([
      { pet: 'frosty' as const, frame: 2 },
      { pet: 'lassi' as const, frame: 4 },
      { pet: 'owl' as const, frame: 4 },
      { pet: 'yak' as const, frame: 2 },
    ])(`draws $pet 150 ms after a hit with ${effect}`, ({ pet, frame }) => {
      const p = new HeroNativePresentation(fakeScene());
      const atlas = JSON.parse(
        fs.readFileSync(`public/assets/heroes-native/${pet}/atlas.json`, 'utf8'),
      );
      (p as unknown as { packs: Map<string, unknown> }).packs.set(`heroes-native/${pet}`, atlas);
      const u = unit(1, 10, 10, { kind: PET_UNIT[pet], attacking: true, path: [], target: 2 });
      u.native = {
        effects:
          effect === 'poison'
            ? { poison: { until: 10, speed: -0.5, attackSpeed: -0.5, dps: 0, since: 0 } }
            : effect === 'chill'
              ? { chill: { until: 10, percent: 0.5 } }
              : { boost: { until: 10, speed: 0, damage: 0, attackSpeed: 1 } },
      };
      u.cooldown = nativeUnitStats(u.kind, 1).rate * (effect === 'boost' ? 0.5 : 2) - 0.15;
      const battle = battleOf([u]);
      battle.elapsed = 0.15;
      battle.buildings = [makeBuilding(2, 'wall', 11, 10, 1)];
      p.render(battle, false, iso, 70, new Map(), new Map());
      const sprite = (
        p as unknown as { sprites: Map<number, { frame: { name: string } }> }
      ).sprites.get(u.id)!;
      const f = atlas.states.attack.frames[1][frame];
      expect(sprite.frame.name).toBe(`${f.x}:${f.y}:${f.w}:${f.h}`);
    });
  it.each([
    { kind: 'guardian', attackerId: 1000 },
    { kind: 'hero', attackerId: 9999 },
  ])(
    'keeps $kind bodies distinct from attacker $attackerId through removal',
    ({ kind, attackerId }) => {
      const p = new HeroNativePresentation(fakeScene());
      const packs = (p as unknown as { packs: Map<string, unknown> }).packs;
      for (const [key, path] of [
        ['heroes-native/king', 'public/assets/characters/king-v1/atlas.json'],
        ['heroes-native/queen', 'public/assets/characters/hero-redesign-v1/queen/atlas.json'],
        ['guardians-native/longshot', 'public/assets/guardians-native/longshot/atlas.json'],
      ])
        packs.set(key, JSON.parse(fs.readFileSync(path, 'utf8')));
      const king = unit(attackerId, 10, 10, { kind: 'barbarianking', path: [] });
      const battle = battleOf([king]);
      battle.nativeRoster = true;
      const defender =
        kind === 'hero'
          ? defendingHero({ kind: 'queen', level: 1, x: 10.5, y: 10 }, 0)
          : createGuardian(
              battle,
              { ...makeBuilding(1, 'townhall', 10, 10, 18), guardian: 'longshot' },
              -1001,
            )!;
      Object.assign(defender, { x: 10.5, y: 10, spawnedAt: 0 });
      battle.defenders = [defender];
      p.render(battle, false, iso, 70, new Map(), new Map());
      const sprites = (p as unknown as { sprites: Map<number, { texture: { key: string } }> })
        .sprites;
      expect(sprites.size).toBe(2);
      expect(sprites.get(attackerId)).not.toBe(sprites.get(defender.id));
      expect(sprites.get(attackerId)!.texture.key).toContain('baked:heroes-native/king/');
      expect(sprites.get(defender.id)!.texture.key).toContain(
        kind === 'hero' ? 'baked:heroes-native/queen/' : 'baked:guardians-native/longshot/',
      );
      battle.units = [];
      p.render(battle, false, iso, 70, new Map(), new Map());
      expect(p.drewUnit(attackerId)).toBe(false);
      expect(sprites.size).toBe(1);
      expect(sprites.has(defender.id)).toBe(true);
      battle.defenders = [];
      p.render(battle, false, iso, 70, new Map(), new Map());
      expect(sprites.size).toBe(0);
    },
  );
  for (const slow of ['normal', 'poison', 'frost'])
    it.each(['longshot', 'smasher', 'logger'] as const)(
      `restarts %s windups on its action clock with ${slow} speed`,
      (kind) => {
        const p = new HeroNativePresentation(fakeScene());
        const atlas = JSON.parse(
          fs.readFileSync(`public/assets/guardians-native/${kind}/atlas.json`, 'utf8'),
        );
        (p as unknown as { packs: Map<string, unknown> }).packs.set(
          `guardians-native/${kind}`,
          atlas,
        );
        const target = unit(1, 10.5, 10, { hp: 1e9, maxHp: 1e9, path: [] });
        const battle = battleOf([target]);
        battle.nativeRoster = true;
        battle.elapsed = 0;
        const th = { ...makeBuilding(1, 'townhall', 10, 10, 18), guardian: kind };
        battle.buildings = [th];
        const g = createGuardian(battle, th, -20000)!;
        Object.assign(g, { phase: 'fighting', spawnedAt: 0, x: 10, y: 10 });
        if (slow === 'poison') g.poison = { since: 0, until: 100, speed: -0.4, attack: -0.55 };
        if (slow === 'frost') g.frost = { until: 100, percent: 0.5 };
        battle.defenders = [g];
        const ctx: NativeTroopContext = {
          battle,
          buildings: battle.buildings,
          buildingsById: new Map([[1, th]]),
          passableWalls: new Set(),
          nextId: () => 1000,
          troopLevel: () => 1,
          damageBuilding: () => {},
          effect: () => {},
        };
        let tick = 0;
        const step = () => {
          battle.elapsed = ++tick * 0.05;
          stepGuardian(ctx, g, 0.05);
          p.render(battle, false, iso, 70, new Map(), new Map());
        };
        step();
        const start = g.clock!;
        const drawn = () =>
          (p as unknown as { sprites: Map<number, { frame: { name: string } }> }).sprites.get(g.id)!
            .frame.name;
        const frameName = (frame: number) => {
          const f = atlas.states.attack.frames[1][frame];
          return `${f.x}:${f.y}:${f.w}:${f.h}`;
        };
        expect(drawn()).toBe(frameName(0));
        const sample = (cycle: number) => {
          const at = start + cycle * guardianStats(kind, 1).interval + 0.25;
          for (let remaining = 300; g.clock! < at - 1e-9; remaining--) {
            if (!remaining) throw Error('Guardian action clock did not advance');
            step();
          }
          const age = g.clock! - start - cycle * guardianStats(kind, 1).interval;
          const expected = frameName(Math.floor(age * atlas.states.attack.fps));
          expect(drawn()).toBe(expected);
          p.render(battle, false, iso, 70, new Map(), new Map());
          expect(drawn()).toBe(expected);
          return expected;
        };
        sample(0);
        sample(1);
        sample(2);
      },
    );
  it.each([
    { kind: 'king' as const, at: 0.45, frame: 2, slow: 'normal' },
    { kind: 'queen' as const, at: 0.1, frame: 0, slow: 'normal' },
    { kind: 'warden' as const, at: 0.45, frame: 1, slow: 'normal' },
    { kind: 'champion' as const, at: 0.45, frame: 2, slow: 'normal' },
    { kind: 'prince' as const, at: 0.1, frame: 0, slow: 'normal' },
    { kind: 'duke' as const, at: 0.45, frame: 2, slow: 'normal' },
    { kind: 'king' as const, at: 0.5, frame: 1, slow: 'poison' },
    { kind: 'queen' as const, at: 0.5, frame: 1, slow: 'poison' },
    { kind: 'king' as const, at: 0.4, frame: 1, slow: 'frost' },
    { kind: 'queen' as const, at: 0.4, frame: 2, slow: 'frost' },
  ])(
    'draws defending $kind at its source phase after $at seconds with $slow speed',
    ({ kind, at, frame, slow }) => {
      const p = new HeroNativePresentation(fakeScene());
      const atlas = JSON.parse(
        fs.readFileSync(`public${heroArtDirectory(`heroes-native/${kind}`)}/atlas.json`, 'utf8'),
      );
      (p as unknown as { packs: Map<string, unknown> }).packs.set(`heroes-native/${kind}`, atlas);
      const target = unit(1, 10.5, 10, { hp: 10000, maxHp: 10000, path: [] });
      const battle = battleOf([target]);
      const defender = defendingHero({ kind, level: 1, x: 10, y: 10 }, 0);
      defender.cooldown = nativeUnitStats(HERO_UNIT[kind], 1).rate;
      battle.nativeDefendingHeroPoison = true;
      if (slow === 'poison') defender.poison = { since: 0, until: 5, speed: -0.4, attack: -0.55 };
      if (slow === 'frost') defender.frost = { until: 5, percent: 0.25 };
      battle.defenders = [defender];
      battle.elapsed = at;
      stepDefendingHeroes(battle, at, () => {});
      expect(defender.attacking).toBe(true);
      p.render(battle, false, iso, 70, new Map(), new Map());
      const sprite = (
        p as unknown as {
          sprites: Map<number, { texture: { key: string }; frame: { name: string } }>;
        }
      ).sprites.get(defender.id)!;
      const state =
        atlas.states[defender.mode === 'air' ? 'alt_attack' : 'attack'] ?? atlas.states.attack;
      const expected = state.frames[1][frame];
      expect(sprite.texture.key).toBe(`baked:heroes-native/${kind}/${expected.image}`);
      expect(sprite.frame.name).toBe(`${expected.x}:${expected.y}:${expected.w}:${expected.h}`);
      // Paused redraws preserve the pose; reduced motion selects a static idle frame.
      p.render(battle, false, iso, 70, new Map(), new Map());
      expect(sprite.frame.name).toBe(`${expected.x}:${expected.y}:${expected.w}:${expected.h}`);
      p.render(battle, true, iso, 70, new Map(), new Map());
      const idle = (
        atlas.states[defender.mode === 'air' ? 'alt_idle' : 'idle'] ?? atlas.states.idle
      ).frames[1][0];
      expect(sprite.frame.name).toBe(`${idle.x}:${idle.y}:${idle.w}:${idle.h}`);
    },
  );
  it('advances the walk clip between sim steps instead of restarting it', () => {
    const scene = fakeScene();
    const p = new HeroNativePresentation(scene);
    const atlas = JSON.parse(
      fs.readFileSync('public/assets/characters/king-v1/atlas.json', 'utf8'),
    );
    (p as unknown as { packs: Map<string, unknown> }).packs.set('heroes-native/king', atlas);
    const king = unit(1, 10, 10, { kind: 'barbarianking' as never, hero: 'king' as never });
    const battle = battleOf([king]);
    const frames = new Set<string>();
    const states: string[] = [];
    for (let frame = 0; frame < 60; frame++) {
      if (frame % 3 === 0) {
        battle.elapsed = 1 + (frame / 3) * 0.05;
        king.x += 0.05;
      }
      p.render(battle, false, iso, 70, new Map(), new Map());
      const sprite = (
        p as unknown as { sprites: Map<number, { frame: { name: string } }> }
      ).sprites.get(1)!;
      frames.add(sprite.frame.name);
      states.push(
        (p as unknown as { positions: Map<number, { state: string }> }).positions.get(1)!.state,
      );
    }
    expect(new Set(states.slice(3))).toEqual(new Set(['walk']));
    // One second of walking at the atlas frame rate shows several distinct frames.
    expect(frames.size).toBeGreaterThan(3);
  });
  it('prunes state for heroes that left the battle', () => {
    const p = new HeroNativePresentation(fakeScene());
    (p as unknown as { packs: Map<string, unknown> }).packs.set(
      'heroes-native/king',
      JSON.parse(fs.readFileSync('public/assets/characters/king-v1/atlas.json', 'utf8')),
    );
    const battle = battleOf([
      unit(1, 10, 10, { kind: 'barbarianking' as never, hero: 'king' as never }),
    ]);
    p.render(battle, false, iso, 70, new Map(), new Map());
    const positions = (p as unknown as { positions: Map<number, unknown> }).positions;
    expect(positions.size).toBe(1);
    battle.units = [];
    p.render(battle, false, iso, 70, new Map(), new Map());
    expect(positions.size).toBe(0);
  });
});

describe('native defense effect log', () => {
  it('keeps a Town Hall activation recorded at its future wake time until it has played', () => {
    const log = new NativeDefenseEventLog(() => 1.5);
    const ground = { x: 0, y: 0 };
    log.record({ key: '7:activate:12.00', effect: 'TH Activation', at: 12, ground }, 10);
    log.prune(10);
    expect([...log.started(10)]).toHaveLength(0);
    expect(log.events).toHaveLength(1);
    log.prune(12.5);
    expect([...log.started(12.5)].map((e) => e.key)).toEqual(['7:activate:12.00']);
    log.prune(13.6);
    expect(log.events).toHaveLength(0);
  });
  it('uses the effect duration once known and drops expired events before live ones', () => {
    let known: number | undefined;
    const log = new NativeDefenseEventLog((effect) => (effect === 'Hit' ? 0.5 : known));
    const ground = { x: 0, y: 0 };
    log.record({ key: 'long', effect: 'Long', at: 0, ground }, 0);
    for (let i = 0; i < 150; i++) log.record({ key: `old:${i}`, effect: 'Hit', at: 1, ground }, 1);
    known = 10;
    log.prune(7);
    // Unknown at record time (6 s fallback) but resolved to 10 s before expiring.
    expect(log.events.map((e) => e.key)).toEqual(['long']);
    for (let i = 0; i < 150; i++) log.record({ key: `a:${i}`, effect: 'Hit', at: 7, ground }, 7);
    // Overflow at 8 s: the expired hits go first; the still-playing long effect survives.
    for (let i = 0; i < 100; i++) log.record({ key: `b:${i}`, effect: 'Hit', at: 8, ground }, 8);
    expect(log.events.some((e) => e.key === 'long')).toBe(true);
    expect(log.events.some((e) => e.key === 'b:99')).toBe(true);
    expect(log.events.length).toBeLessThanOrEqual(192);
  });
  it('indexes every defense-cast spell by the pack that declares it', () => {
    const declared: Record<string, string> = {};
    for (const kind of fs.readdirSync('public/assets/defenses-native')) {
      const pack = JSON.parse(
        fs.readFileSync(`public/assets/defenses-native/${kind}/graph.json`, 'utf8'),
      );
      for (const name of Object.keys(pack.spells ?? {})) declared[name] ??= kind;
    }
    expect(NATIVE_DEFENSE_SPELL_KIND).toEqual(declared);
  });
});

describe('native defense zap readiness', () => {
  const primary = 'ps_chr_SuperWizard_Attack_01';
  const chain = 'ps_chr_SuperWizard_AtkChain_01';
  function presentation() {
    const p = new NativeDefensePresentation({} as never, {} as never);
    const pack = JSON.parse(
      fs.readFileSync('public/assets/defenses-native/superwizardtower/graph.json', 'utf8'),
    );
    vi.spyOn(p, 'pack').mockReturnValue(pack);
    const states = new Map<string, 'ready' | 'loading' | 'none'>();
    const duration = vi.fn(() => 0.5);
    (p as unknown as { layer: unknown }).layer = {
      duration,
      status: (effect: string) => states.get(effect) ?? 'loading',
    };
    return { p, states, duration, tower: makeBuilding(7, 'superwizardtower', 24, 14, 1) };
  }
  it('keeps fallback for missing, pending and failed effect art despite a ready defense graph', () => {
    const { p, states, duration, tower } = presentation();
    expect(p.covers('superwizardtower')).toBe(true);
    expect(p.coversZap(undefined)).toBe(false);
    expect(p.coversZap(tower)).toBe(false);
    states.set(primary, 'none');
    duration.mockClear();
    expect(p.coversZap(tower)).toBe(false);
    expect(duration).toHaveBeenCalledWith(primary);
    states.set(primary, 'ready');
    expect(p.coversZap(tower)).toBe(true);
    vi.mocked(p.pack).mockReturnValue(undefined);
    expect(p.coversZap(tower)).toBe(false);
  });
  it('switches primary and chain fallbacks independently as their own artwork becomes ready', () => {
    const { p, states, duration, tower } = presentation();
    states.set(primary, 'ready');
    expect(p.coversZap(tower)).toBe(true);
    expect(duration).not.toHaveBeenCalledWith(chain);
    expect(p.coversZap(tower, true)).toBe(false);
    states.set(chain, 'ready');
    expect(p.coversZap(tower, true)).toBe(true);
    states.set(primary, 'none');
    expect(p.coversZap(tower)).toBe(false);
    expect(p.coversZap(tower, true)).toBe(true);
  });
});

describe('native projectile impact readiness', () => {
  const effect = 'Merged Cannon Projectile Destroyed';
  function presentation() {
    const p = new NativeProjectilePresentation({} as never, {} as never);
    const pack = JSON.parse(
      fs.readFileSync('public/assets/projectiles-native/mergedcannonprojectile/graph.json', 'utf8'),
    );
    const state = p as unknown as {
      covered: Set<string>;
      history: Map<string, unknown>;
      packs: unknown;
      layer: unknown;
    };
    state.covered.add('shot');
    state.history.set('shot', { name: 'MergedCannonProjectile', packPath: 'fixture' });
    state.packs = { get: () => pack };
    const duration = vi.fn(() => 0.5);
    const status = vi.fn((): 'ready' | 'loading' | 'none' => 'loading');
    state.layer = { duration, status };
    return { p, pack, duration, status, state };
  }
  it('keeps native flight covered while pending or failed impact art retains a fallback', () => {
    const { p, duration, status } = presentation();
    expect(p.covers('shot')).toBe(true);
    expect(p.coversImpact('shot')).toBe(false);
    status.mockReturnValue('none');
    duration.mockClear();
    expect(p.coversImpact('shot')).toBe(false);
    expect(duration).toHaveBeenCalledWith(effect);
    status.mockReturnValue('ready');
    expect(p.coversImpact('shot')).toBe(true);
    expect(p.covers('shot')).toBe(true);
  });
  it('does not cover an unknown shot or change rows without indexed visual impact artwork', () => {
    const { p, pack, duration, state } = presentation();
    expect(p.coversImpact(undefined)).toBe(false);
    expect(p.coversImpact('unknown')).toBe(false);
    delete pack.projectiles.MergedCannonProjectile.DestroyedEffect;
    expect(p.coversImpact('shot')).toBe(true);
    expect(duration).not.toHaveBeenCalled();
    state.history.clear();
    expect(p.coversImpact('shot')).toBe(false);
  });
});
