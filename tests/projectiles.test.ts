import { describe, expect, it } from 'vitest';
import { GameModel, makeBuilding, type Unit, type FX } from '../src/game/model';
import { emptyArmy, emptySpells } from '../src/game/army';

function arena(kind: Unit['kind'] = 'archer') {
  const m = new GameModel();
  m.startBattle(0, true);
  const b = m.battle!;
  const hall = makeBuilding(9000, 'townhall', 10, 10);
  b.buildings = [hall];
  b.started = true;
  const stats = m.troopStats(kind);
  const u: Unit = {
    id: 9001,
    kind,
    x: 7,
    y: 11,
    hp: stats.hp,
    maxHp: stats.hp,
    target: hall.id,
    path: [],
    pathAt: 0,
    cooldown: 0,
    attacking: false,
  };
  if (kind === 'balloon') u.x = 9.8;
  b.units = [u];
  const fx: FX[] = [];
  m.onEffect = (e) => fx.push(e);
  return { m, b, hall, u, fx };
}
function land(m: GameModel) {
  const impact = m.battle!.projectiles![0].impact;
  while (m.battle!.elapsed < impact - 1e-8) m.step(Math.min(0.05, impact - m.battle!.elapsed));
}

describe('physical projectile damage', () => {
  it('an archer held at a blocking wall launches an arrow instead of damaging it early', () => {
    const { m, b, hall, u } = arena();
    const wall = makeBuilding(9002, 'wall', 6, 11);
    b.buildings.push(wall);
    u.x = 5;
    u.path = [{ x: 6.5, y: 11.5 }];
    u.pathAt = 100;
    m.step(0.05);
    expect(b.projectiles![0].targetId).toBe(wall.id);
    expect(wall.hp).toBe(wall.maxHp);
    land(m);
    expect(wall.hp).toBeCloseTo(wall.maxHp - m.troopStats('archer').damage);
    expect(hall.hp).toBe(hall.maxHp);
  });

  it('impacts within a long step resolve by arrival time, not the order towers launched', () => {
    const { m, b, u, fx } = arena('giant');
    const cannon = makeBuilding(9002, 'cannon', 1, 10);
    const archer = makeBuilding(9003, 'archertower', 5, 7);
    b.buildings.push(cannon, archer);
    u.hp = 1;
    u.cooldown = 100;
    m.step(0.05);
    const shots = b.projectiles!;
    expect(shots.map((p) => p.sourceId)).toEqual([cannon.id, archer.id]);
    expect(shots[1].impact).toBeLessThan(shots[0].impact);
    m.step(0.5);
    expect(u.hp).toBe(1 - shots[1].damage);
    expect(fx.filter((e) => e.type === 'impact').map((e) => e.sourceId)).toEqual([
      archer.id,
      cannon.id,
    ]);
  });

  it('a long final frame cannot apply a hit scheduled beyond the raid deadline', () => {
    const { m, b, hall } = arena();
    b.elapsed = 179.85;
    m.step(0.05);
    expect(b.projectiles![0].impact).toBeGreaterThan(180);
    m.step(1);
    expect(b.elapsed).toBe(180);
    expect(b.finished).toBe(true);
    expect(hall.hp).toBe(hall.maxHp);
    expect(b.projectiles).toHaveLength(0);
  });
  it.each(['archer', 'wizard', 'balloon'] as const)(
    '%s damages at impact, never during flight or twice',
    (kind) => {
      const { m, b, hall, u, fx } = arena(kind);
      m.step(0.05);
      const shot = b.projectiles![0];
      expect(shot).toBeDefined();
      u.cooldown = 100;
      m.step(shot.impact - b.elapsed - 0.001);
      expect(hall.hp).toBe(hall.maxHp);
      expect(fx.filter((e) => e.type === 'impact')).toHaveLength(0);
      m.step(0.001);
      expect(hall.hp).toBe(hall.maxHp - shot.damage);
      expect(b.projectiles).toHaveLength(0);
      m.step(1);
      expect(hall.hp).toBe(hall.maxHp - shot.damage);
      expect(fx.filter((e) => e.type === 'impact')).toHaveLength(1);
    },
  );

  it('a last arrow lands after its archer dies and awards the final stars at impact', () => {
    const { m, b, hall, u } = arena();
    hall.hp = m.troopStats('archer').damage;
    b.remaining = emptyArmy();
    b.spells = emptySpells();
    m.step(0.05);
    u.hp = 0;
    m.step(0.05);
    expect(b.finished).toBe(false);
    expect(b.stars).toBe(0);
    land(m);
    expect(hall.hp).toBe(0);
    expect(b.result).toMatchObject({ stars: 3, destruction: 100 });
  });

  it('a launched cannonball tracks its original moving target after the cannon falls', () => {
    const { m, b, hall, u } = arena('giant');
    const cannon = makeBuilding(9002, 'cannon', 4, 10);
    b.buildings.push(cannon);
    u.cooldown = 100;
    m.step(0.05);
    const shot = b.projectiles!.find((p) => p.sourceId === cannon.id)!;
    expect(shot.targetId).toBe(u.id);
    m.damage(cannon, cannon.hp);
    u.x = 24;
    // Tracking changes the arrival deadline as the target moves.
    for (let i = 0; i < 200 && b.projectiles!.some((p) => p.id === shot.id); i++) m.step(0.05);
    expect(b.projectiles!.some((p) => p.id === shot.id)).toBe(false);
    expect(u.hp).toBe(u.maxHp - shot.damage);
    expect(hall.hp).toBe(hall.maxHp);
  });

  it('a direct shot cannot transfer damage to a replacement for its dead target', () => {
    const { m, b, u } = arena('giant');
    const cannon = makeBuilding(9002, 'cannon', 4, 10);
    b.buildings.push(cannon);
    u.cooldown = 100;
    m.step(0.05);
    const spare = { ...u, id: 9003, path: [] };
    b.units.push(spare);
    u.hp = 0;
    cannon.cooldown = 100;
    land(m);
    expect(spare.hp).toBe(spare.maxHp);
  });

  it('a wizard retains launch damage after Rage expires without splashing distant buildings', () => {
    const { m, b, hall, u } = arena('wizard');
    const neighbor = makeBuilding(9002, 'builder', 14, 11);
    b.buildings.push(neighbor);
    // The final pulse has already landed; the remaining boost expires during flight.
    u.spellRageUntil = 0.1;
    m.step(0.05);
    const shot = b.projectiles![0];
    u.cooldown = 100;
    expect(shot.damage).toBeCloseTo(m.troopStats('wizard').damage * 2.3);
    expect(neighbor.hp).toBe(neighbor.maxHp);
    land(m);
    expect(hall.hp).toBeCloseTo(hall.maxHp - shot.damage);
    expect(shot.splash).toBe(0.3);
    expect(neighbor.hp).toBe(neighbor.maxHp);
    expect(b.auras).toHaveLength(0);
  });

  it('surrender discards airborne damage and starting another battle never inherits shots', () => {
    const { m, b, hall } = arena();
    m.step(0.05);
    expect(b.projectiles).toHaveLength(1);
    m.finishBattle();
    m.step(5);
    expect(hall.hp).toBe(hall.maxHp);
    expect(b.projectiles).toHaveLength(0);
    m.returnHome();
    m.startBattle(0, true);
    expect(m.battle!.projectiles ?? []).toHaveLength(0);
  });
});
