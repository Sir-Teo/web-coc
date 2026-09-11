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
    land(m);
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

  it('wizard splash waits for impact and retains its launch damage after Rage expires', () => {
    const { m, b, hall, u } = arena('wizard');
    const neighbor = makeBuilding(9002, 'builder', 14, 11);
    b.buildings.push(neighbor);
    b.auras.push({ kind: 'rage', x: u.x, y: u.y, end: 0.1 });
    m.step(0.05);
    const shot = b.projectiles![0];
    u.cooldown = 100;
    expect(shot.damage).toBe(m.troopStats('wizard').damage * 1.7);
    expect(neighbor.hp).toBe(neighbor.maxHp);
    land(m);
    expect(hall.hp).toBeCloseTo(hall.maxHp - shot.damage);
    expect(neighbor.hp).toBeCloseTo(neighbor.maxHp - shot.damage * 0.35);
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
