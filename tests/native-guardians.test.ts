import { describe, expect, it } from 'vitest';
import { TROOP_KEYS, maxTroopLevel, type TroopKind } from '../src/game/data';
import { GameModel, makeBuilding, type Building } from '../src/game/model';
import { emptyArmy, emptySpells } from '../src/game/army';
import { guardianStats, guardianUpgrade, type GuardianKind } from '../src/game/native-guardians';
import type { GuardianDefender } from '../src/game/defenders';
import { validateSave } from '../src/game/save';

function arena(guardian: GuardianKind, level = 5, extra: Building[] = []) {
  const m = new GameModel();
  m.state.obstacles = [];
  m.state.buildings = [
    { ...makeBuilding(1, 'townhall', 22, 22, 18), guardian, guardianLevel: level },
    makeBuilding(2, 'goldmine', 2, 44, 1),
    ...extra,
  ];
  m.state.nextId = 5000;
  m.state.army = { ...emptyArmy(), golem: 3, swordsman: 6 };
  m.state.spells = emptySpells();
  m.state.troopLevels = Object.fromEntries(
    TROOP_KEYS.map((k) => [k, Math.min(10, maxTroopLevel(k))]),
  ) as Record<TroopKind, number>;
  m.startBattle(0, true);
  return m;
}
const run = (m: GameModel, seconds: number, step = 0.05) => {
  for (let t = 0; t < seconds - 1e-9 && !m.battle!.finished; t += step) m.step(step);
};
const guardianOf = (m: GameModel) =>
  m.battle!.defenders!.find((d) => d.kind === 'guardian') as GuardianDefender;

describe('Town Hall 18 Guardians', () => {
  it('reads Guardian stats and upgrades from the client rows', () => {
    const longshot = guardianStats('longshot', 5);
    expect(longshot).toMatchObject({ hp: 11000, range: 11, alert: 19, search: 16, splash: 1 });
    expect(longshot.damage).toBeCloseTo(810, 6);
    expect(longshot.death).toMatchObject({ damage: 1000, radius: 3.5, delay: 0.2, air: true });
    const smasher = guardianStats('smasher', 5);
    expect(smasher).toMatchObject({ hp: 16000, range: 1.25, alert: 14, search: 12, splash: 2.5 });
    expect(smasher.damage).toBeCloseTo(1260, 6);
    expect(smasher.deathSpell?.name).toBe('SmasherRageArea');
    expect(smasher.homeRage).toEqual({ damage: 0.6, speed: 1.5 });
    const logger = guardianStats('logger', 5);
    expect(logger).toMatchObject({ hp: 12000, range: 7, alert: 15, pushback: 1.5 });
    expect(logger.damage).toBeCloseTo(875, 6);
    expect(logger.pierce).toEqual({ radius: 1.8, extra: 6 });
    expect(guardianUpgrade('longshot', 1)).toEqual({
      level: 2,
      cost: 18_000_000,
      seconds: 7 * 86400,
      resource: 'elixir',
    });
    expect(guardianUpgrade('logger', 5)).toBeNull();
  });

  it('waits on the Town Hall until an attacker enters its alert radius, then leaps down and fights', () => {
    const m = arena('longshot');
    m.activeTroop = 'golem';
    m.deploy(46, 46);
    const golem = m.battle!.units[0];
    golem.springUntil = 1e9;
    run(m, 1);
    const g = guardianOf(m);
    expect(g.phase).toBe('waiting');
    // Move the golem inside the 19-tile alert radius.
    Object.assign(golem, { x: 24, y: 12 });
    run(m, 0.1);
    expect(g.phase).toBe('leaping');
    run(m, 0.8);
    expect(g.phase).toBe('fighting');
    run(m, 3);
    expect(golem.maxHp - golem.hp).toBeGreaterThanOrEqual(810 - 1e-6);
  });

  it('enrages the Smasher when its Town Hall falls and releases Rage when it dies', () => {
    const m = arena('smasher');
    m.activeTroop = 'golem';
    m.deploy(24, 18);
    const golem = m.battle!.units[0];
    golem.springUntil = 1e9;
    run(m, 1.5);
    const g = guardianOf(m);
    expect(g.phase).toBe('fighting');
    m.battle!.buildings.find((b) => b.id === 1)!.hp = 0;
    run(m, 0.1);
    expect(g.enraged).toBe(true);
    g.hp = 0;
    g.defeatedAt = m.battle!.elapsed;
    run(m, 0.2);
    expect(m.battle!.nativeSpells?.some((c) => c.name === 'SmasherRageArea')).toBe(true);
  });

  it('rolls Logger logs through every unit in the lane and pushes them back', () => {
    const m = arena('logger');
    m.activeTroop = 'swordsman';
    const lane = [0, 1, 2].map((i) => {
      m.deploy(2, 2);
      const u = m.battle!.units.at(-1)!;
      Object.assign(u, { x: 24, y: 17 - i * 1.2, springUntil: 1e9 });
      return u;
    });
    run(m, 6);
    const hurt = lane.filter((u) => u.hp < u.maxHp || u.hp <= 0);
    expect(hurt.length).toBeGreaterThanOrEqual(2);
  });

  // The Builder's Hut turret and its Defending Builder stay with the released late family in
  // every battle that has one, so that behaviour is covered by tests/builder-hut.test.ts and
  // tests/defending-builder-replay.test.ts rather than here.

  it('chooses and upgrades the Guardian in the village', () => {
    const m = new GameModel();
    m.state.obstacles = [];
    m.state.buildings = [
      makeBuilding(1, 'townhall', 20, 20, 18),
      ...[2, 3, 4, 5, 6].map((id, i) => makeBuilding(id, 'builder', 2 + i * 3, 2, 1)),
    ];
    m.state.nextId = 1000;
    m.state.elixir = 1e9;
    expect(m.selectGuardian('logger')).toBe(true);
    expect(m.upgradeGuardian()).toBe(true);
    const th = m.state.buildings[0];
    expect(th.improving).toBe('guardian');
    expect(validateSave(m.state)).toBe(true);
    m.tick(th.upgradeEnd! + 1);
    expect([th.guardian, th.guardianLevel, th.level]).toEqual(['logger', 2, 18]);
    expect(validateSave(m.state)).toBe(true);
  });
});
