import fs from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { Battle, Unit } from '../src/game/model';

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
const { HeroNativePresentation } = await import('../src/game/hero-native-scene');
const { NativeDefenseEventLog, NATIVE_DEFENSE_SPELL_KIND } =
  await import('../src/game/native-defense-scene');
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
          setScale: () => sprite,
          setAlpha: () => sprite,
          setTint: (t: number) => ((sprite.tintTopLeft = t), sprite),
          setTintMode: (m: number) => ((sprite.tintMode = m), sprite),
          clearTint: () => ((sprite.tintTopLeft = 0xffffff), (sprite.tintMode = 0), sprite),
          setDepth: (d: number) => ((sprite.depth = d), sprite),
          setVisible: () => sprite,
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
  (p as unknown as { packs: Map<string, unknown> }).packs.set('archer', archerPack);
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
