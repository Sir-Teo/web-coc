import { expect, it } from 'vitest';
import { GameModel, makeBuilding, makeNpcBuilding, type Unit } from '../src/game/model';
import { BUILDINGS, buildingHp, defenseDamage, defenseDps } from '../src/game/data';
import { CANNON_LEVELS } from '../src/game/cannon-stats';
function arena(level = 1) {
  const m = new GameModel();
  m.startBattle(0, true);
  const b = m.battle!;
  const cannon = makeBuilding(9000, 'cannon', 10, 10, level);
  b.buildings = [cannon, makeBuilding(9100, 'townhall', 35, 35)];
  b.started = true;
  const u: Unit = {
    id: 9001,
    kind: 'giant',
    x: 17,
    y: 11.5,
    hp: 100000,
    maxHp: 100000,
    springUntil: 100000,
    cooldown: 100000,
    target: cannon.id,
    path: [],
    pathAt: 100000,
    attacking: false,
  };
  b.units = [u];
  return { m, b, cannon, u };
}

it('preserves the distinct tutorial Cannon projectile and leaves it outside normal Cannon history', () => {
  const { m, b, u } = arena();
  const npc = makeNpcBuilding(9000, 'tutorial-cannon', 10, 10);
  b.buildings[0] = npc;
  m.step(0.05);
  const p = b.projectiles![0];
  expect(p.variant).toBeUndefined();
  expect(p.flight).toBeUndefined();
  expect(p.impact - p.launched).toBeCloseTo(5.5 / 16, 12);
  expect(b.cannons).toBeUndefined();
  m.damage(npc, npc.hp);
  expect(b.cannons).toBeUndefined();
  m.step(p.impact - b.elapsed);
  expect(u.hp).toBeLessThan(u.maxHp);
});

it('applies each of the twenty-one original damage tiers once, at source-speed arrival', () => {
  for (const row of CANNON_LEVELS) {
    const { m, b, cannon, u } = arena(row.level);
    expect(buildingHp('cannon', row.level)).toBe(row.hp);
    expect(defenseDps('cannon', row.level)).toBe(row.dps);
    expect(defenseDamage('cannon', row.level)).toBeCloseTo(row.dps * 0.8, 12);
    m.step(0.05);
    cannon.cooldown = 100;
    const p = b.projectiles![0];
    expect(p.variant).toBe(row.level);
    expect(p.impact - p.launched).toBeCloseTo(5.5 / 12, 12);
    m.step(p.impact - b.elapsed - 0.001);
    expect(u.hp).toBe(u.maxHp);
    m.step(0.001);
    expect(u.hp).toBeCloseTo(u.maxHp - row.dps * 0.8, 9);
    expect(b.projectiles).toHaveLength(0);
    expect(b.cannons![cannon.id].hits).toHaveLength(1);
    m.step(0.001);
    expect(u.hp).toBeCloseTo(u.maxHp - row.dps * 0.8, 9);
  }
});
it('uses inclusive nine-tile ground range and ignores air targets', () => {
  expect(BUILDINGS.cannon).toMatchObject({ range: 9, rate: 0.8, targets: 'ground' });
  for (const [distance, shots] of [
    [0, 1],
    [9, 1],
    [9.0001, 0],
  ]) {
    const { m, b, u } = arena();
    u.x = 11.5 + distance;
    m.step(0.01);
    expect(b.projectiles ?? []).toHaveLength(shots);
  }
  const { m, b, u } = arena();
  u.kind = 'balloon';
  m.step(0.01);
  expect(b.projectiles ?? []).toHaveLength(0);
});
for (const fps of [20, 30, 60])
  it(`preserves the source firing interval at ${fps} frames per second`, () => {
    const { m, b, cannon } = arena();
    for (let i = 0; i < 8 * fps; i++) m.step(1 / fps);
    const shots = b.cannons![cannon.id].shots;
    expect(shots).toHaveLength(10);
    shots.forEach((shot, i) =>
      expect(Math.abs(shot.launched - shots[0].launched - i * 0.8)).toBeLessThanOrEqual(
        1 / fps + 1e-8,
      ),
    );
  });
it('travels a bounded distance toward moving targets and continues after launcher destruction', () => {
  const { m, b, cannon, u } = arena(15);
  m.step(0.05);
  cannon.cooldown = 100;
  const p = b.projectiles![0],
    oldImpact = p.impact;
  u.x = 22.5;
  m.step(0.2);
  expect(p.flight!.x).toBeCloseTo(11.5 + 12 * 0.2, 12);
  expect(p.flight!.y).toBe(11.5);
  expect(p.impact).toBeGreaterThan(oldImpact);
  expect(u.hp).toBe(u.maxHp);
  cannon.hp = 0;
  m.step(p.impact - b.elapsed - 0.001);
  expect(u.hp).toBe(u.maxHp);
  m.step(0.001);
  expect(b.projectiles).toHaveLength(0);
  expect(u.hp).toBeCloseTo(u.maxHp - 105 * 0.8, 9);
  expect(b.cannons![cannon.id].hits[0]).toMatchObject({ x: 22.5, y: 11.5, level: 15 });
});
it('keeps the last destination after target loss and never transfers damage to another target', () => {
  const { m, b, cannon, u } = arena(21);
  m.step(0.05);
  cannon.cooldown = 100;
  const p = b.projectiles![0];
  m.step(0.1);
  const target = { x: p.x, y: p.y };
  u.hp = 0;
  const other = { ...u, id: 9900, x: u.x + 0.01, hp: 1000, maxHp: 1000 };
  b.units.push(other);
  m.step(0.6);
  expect(b.projectiles).toHaveLength(0);
  expect(other.hp).toBe(1000);
  expect(b.cannons![cannon.id].hits[0]).toMatchObject(target);
});
it('does not apply a tracked impact after the battle deadline', () => {
  const { m, b, u } = arena(21);
  b.elapsed = 179.8;
  m.step(0.05);
  expect(b.projectiles![0].impact).toBeGreaterThan(180);
  m.step(1);
  expect(b.finished).toBe(true);
  expect(u.hp).toBe(u.maxHp);
  expect(b.projectiles).toHaveLength(0);
});
it('bounds source trail history even with tiny simulation steps', () => {
  const { m, b, cannon } = arena(21);
  m.step(0.05);
  cannon.cooldown = 100;
  const shot = b.cannons![cannon.id].shots[0];
  for (let i = 0; i < 3500; i++) {
    m.step(0.0001);
    expect(shot.trail.length).toBeLessThanOrEqual(246);
  }
  expect(shot.emitted).toBeGreaterThan(240);
  expect(shot.trail.length).toBeGreaterThan(200);
  expect(new Set(shot.trail.map((v) => v.index)).size).toBe(shot.trail.length);
  for (const birth of shot.trail) {
    expect(birth.x).toBeCloseTo(shot.fromX + 12 * (birth.at - shot.launched), 8);
    expect(birth.y).toBe(shot.fromY);
  }
});
