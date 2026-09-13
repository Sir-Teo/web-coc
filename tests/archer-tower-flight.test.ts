import { expect, it } from 'vitest';
import { GameModel, makeBuilding, type Unit, type FX } from '../src/game/model';
import { replayBattle, compatibleReplayVersion, type ReplaySetup } from '../src/game/replay';
import { emptyArmy, emptySpells } from '../src/game/army';
import { TROOP_KEYS } from '../src/game/data';
import { launchProjectile, stepProjectiles } from '../src/game/projectiles';
const setup = (level = 1): ReplaySetup => ({
  index: 0,
  practice: true,
  nextId: 100,
  buildings: [makeBuilding(1, 'archertower', 10, 10, level)],
  army: emptyArmy(),
  spells: emptySpells(),
  spellLevels: { heal: 1, rage: 1, lightning: 1 },
  troopLevels: Object.fromEntries(TROOP_KEYS.map((k) => [k, 1])) as ReturnType<typeof emptyArmy>,
});
function arena(version = 41, level = 1) {
  const model = new GameModel();
  model.battle = replayBattle(setup(level), version);
  const b = model.battle;
  b.started = true;
  const unit: Unit = {
    id: 100,
    kind: 'giant',
    x: 20.5,
    y: 11.5,
    hp: 10000,
    maxHp: 10000,
    cooldown: 1000,
    path: [],
    pathAt: 1000,
    attacking: false,
    springUntil: 1000,
  };
  b.units = [unit];
  return { model, b, unit, tower: b.buildings[0] };
}
it('tags all source tiers only in version 41 tower battles', () => {
  for (let level = 1; level <= 21; level++) {
    const { model, b } = arena(41, level);
    model.step(0.01);
    expect(b.nativeArcherTowers).toBe(true);
    expect(b.projectiles![0]).toMatchObject({
      weapon: 'arrow',
      variant: level,
      flight: { x: 11.5, y: 11.5 },
    });
    expect(b.projectiles![0].impact - b.projectiles![0].launched).toBeCloseTo(0.5);
  }
  for (const version of [34, 35, 36, 37, 38, 39, 40]) {
    expect(compatibleReplayVersion(version)).toBe(true);
    const { model, b } = arena(version);
    model.step(0.01);
    expect(Object.hasOwn(b, 'nativeArcherTowers')).toBe(false);
    expect(Object.hasOwn(b.projectiles![0], 'variant')).toBe(false);
    expect(Object.hasOwn(b.projectiles![0], 'flight')).toBe(false);
  }
  const initial = setup();
  initial.buildings[0].kind = 'townhall';
  expect(Object.hasOwn(replayBattle(initial), 'nativeArcherTowers')).toBe(false);
});
it('moves at 18 tiles per second without teleporting or hitting at a stale deadline', () => {
  const { model, b, unit, tower } = arena();
  model.step(0.01);
  const p = b.projectiles![0];
  tower.hp = 0; // An already fired arrow survives its shooter.
  b.elapsed = p.launched + 0.1;
  stepProjectiles(
    b,
    () => {},
    () => {},
  );
  expect(p.flight!.x).toBeCloseTo(13.3);
  unit.x = 29.5;
  b.elapsed = p.launched + 0.5;
  stepProjectiles(
    b,
    () => {},
    () => {},
  );
  expect(p.flight!.x).toBeCloseTo(20.5);
  expect(p.impact).toBeCloseTo(p.launched + 1);
  expect(unit.hp).toBe(10000);
  b.elapsed = p.launched + 1;
  const effects: FX[] = [];
  stepProjectiles(
    b,
    () => {},
    (e) => effects.push(e),
  );
  expect(unit.hp).toBe(9994.5);
  expect(b.projectiles).toEqual([]);
  expect(effects.filter((e) => e.type === 'impact')).toHaveLength(1);
});
it('holds the last aim after target death and never damages a replacement unit', () => {
  const { model, b, unit } = arena();
  model.step(0.01);
  const p = b.projectiles![0];
  unit.hp = 0;
  b.units.push({ ...unit, id: 101, hp: 10000 });
  b.elapsed = p.impact;
  stepProjectiles(
    b,
    () => {},
    () => {},
  );
  expect(b.units[1].hp).toBe(10000);
  expect(b.projectiles).toEqual([]);
});
it('leaves legacy tower and troop-arrow deadlines and object shapes unchanged', () => {
  const { model, b, unit } = arena(40);
  model.step(0.01);
  const p = b.projectiles![0],
    deadline = p.impact;
  unit.x = 29.5;
  b.elapsed = deadline;
  stepProjectiles(
    b,
    () => {},
    () => {},
  );
  expect(unit.hp).toBe(9994.5);
  expect(p.impact).toBe(deadline);
  const troop = launchProjectile(
    b,
    {
      weapon: 'arrow',
      sourceId: 5,
      targetId: 100,
      targetBuilding: false,
      fromX: 20,
      fromY: 20,
      x: 20,
      y: 20,
      damage: 1,
    },
    () => {},
  );
  expect(troop.impact - troop.launched).toBeCloseTo(0.12);
  expect(Object.hasOwn(troop, 'flight')).toBe(false);
});
it('reconstructs an in-flight arrow identically after serialization', () => {
  const { model, b } = arena();
  model.step(0.01);
  b.elapsed = 0.2;
  stepProjectiles(
    b,
    () => {},
    () => {},
  );
  const restored = JSON.parse(JSON.stringify(b));
  for (const battle of [b, restored]) {
    battle.units[0].y += 3;
    battle.elapsed += 0.15;
    stepProjectiles(
      battle,
      () => {},
      () => {},
    );
  }
  expect(JSON.stringify(restored)).toBe(JSON.stringify(b));
});

it('renders the physical ground position after a lateral turn rather than an old straight-line fraction', async () => {
  const { trackedProjectilePoint } = await import('../src/game/tracked-projectile-point');
  const { model, b, unit } = arena();
  model.step(0.01);
  const p = b.projectiles![0];
  b.elapsed = 0.11;
  stepProjectiles(
    b,
    () => {},
    () => {},
  );
  unit.y += 9;
  b.elapsed = 0.21;
  stepProjectiles(
    b,
    () => {},
    () => {},
  );
  const iso = (x: number, y: number) => ({ x: (x - y) * 32, y: (x + y) * 16 });
  const from = iso(p.fromX, p.fromY),
    to = iso(p.x, p.y);
  const point = trackedProjectilePoint(p, from, to, iso);
  expect(point).toEqual(iso(p.flight!.x, p.flight!.y));
  const progress = (b.elapsed - p.launched) / (p.impact - p.launched);
  expect(Math.abs(point.x - (from.x + (to.x - from.x) * progress))).toBeGreaterThan(1);
});
