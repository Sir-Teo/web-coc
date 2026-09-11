import { describe, expect, it } from 'vitest';
import { GameModel, makeBuilding, type Unit } from '../src/game/model';

function arena() {
  const m = new GameModel();
  m.startBattle(0, true);
  const b = m.battle!;
  b.started = true;
  const target = makeBuilding(9000, 'townhall', 10, 10);
  const neighbor = makeBuilding(9001, 'builder', 8, 12);
  const nearWall = makeBuilding(9002, 'wall', 8, 11);
  const outsideWall = makeBuilding(9003, 'wall', 8, 13);
  const trap = makeBuilding(9004, 'bomb', 9, 11);
  b.buildings = [target, neighbor, nearWall, outsideWall, trap];
  const stats = m.troopStats('balloon');
  const u: Unit = {
    id: 9005,
    kind: 'balloon',
    x: 9.5,
    y: 11,
    hp: stats.hp,
    maxHp: stats.hp,
    cooldown: 0,
    target: target.id,
    path: [],
    pathAt: 0,
    attacking: false,
  };
  b.units = [u];
  return { m, b, target, neighbor, nearWall, outsideWall, trap, u };
}
describe('Balloon bombing', () => {
  it('drops onto the approached edge and blasts neighboring footprints only at impact', () => {
    const { m, b, target, neighbor, nearWall, outsideWall, trap, u } = arena();
    m.step(0.05);
    const shot = b.projectiles![0];
    expect(shot).toMatchObject({ weapon: 'bomb', x: 10, y: 11, splash: 1.2, splashScale: 1 });
    expect(b.buildings.every((v) => v.hp === v.maxHp)).toBe(true);
    u.cooldown = 100;
    m.step(0.34);
    expect(target.hp).toBe(target.maxHp - shot.damage);
    // Its center lies outside the radius, but the edge is inside the blast.
    expect(neighbor.hp).toBe(neighbor.maxHp - shot.damage);
    expect(nearWall.hp).toBe(Math.max(0, nearWall.maxHp - shot.damage));
    expect(outsideWall.hp).toBe(outsideWall.maxHp);
    expect(trap.hp).toBe(trap.maxHp);
    m.step(1);
    expect(neighbor.hp).toBe(neighbor.maxHp - shot.damage);
  });

  it('keeps its impact point and splash when another attack destroys the intended building', () => {
    const { m, b, target, neighbor, u } = arena();
    m.step(0.05);
    const shot = b.projectiles![0];
    m.damage(target, target.hp);
    u.cooldown = 100;
    m.step(0.34);
    expect(shot.x).toBe(10);
    expect(shot.y).toBe(11);
    expect(neighbor.hp).toBe(neighbor.maxHp - shot.damage);
  });

  it('scales primary and collateral damage equally with research and leaves friendly troops unharmed', () => {
    const { m, b, target, neighbor, u } = arena();
    m.state.troopLevels = Object.fromEntries(
      Object.keys(m.state.army).map((kind) => [kind, kind === 'balloon' ? 3 : 1]),
    ) as typeof m.state.army;
    Object.assign(b, { troopLevels: { ...m.state.troopLevels } });
    const friend = { ...u, id: 9006, kind: 'giant' as const, cooldown: 100, path: [] };
    b.units.push(friend);
    m.step(0.05);
    const shot = b.projectiles![0];
    u.cooldown = 100;
    m.step(0.34);
    expect(shot.damage).toBe(m.troopStats('balloon').damage);
    expect(target.hp).toBe(target.maxHp - shot.damage);
    expect(neighbor.hp).toBe(neighbor.maxHp - shot.damage);
    expect(friend.hp).toBe(friend.maxHp);
  });

  it.each([
    [9.5, 11, 10, 11],
    [14.5, 11, 14, 11],
    [11, 9.5, 11, 10],
    [11, 14.5, 11, 14],
  ])('approach from %s,%s places the bomb at %s,%s', (x, y, bx, by) => {
    const { m, b, u } = arena();
    u.x = x;
    u.y = y;
    m.step(0.05);
    expect(b.projectiles![0]).toMatchObject({ x: bx, y: by });
  });

  it('a long movement step reaches the footprint without overshooting it', () => {
    const { m, u } = arena();
    u.x = 8;
    m.step(10);
    expect(u.x).toBe(10);
    expect(u.y).toBe(11);
  });
});
