import { describe, it, expect } from 'vitest';
import { GameModel, makeBuilding, type FX, type Unit } from '../src/game/model';
import { type TroopKind, type BuildingKind } from '../src/game/data';

function addUnit(m: GameModel, kind: TroopKind, x: number, y: number) {
  const stats = m.troopStats(kind);
  const unit: Unit = {
    id: m.state.nextId++,
    kind,
    x,
    y,
    hp: stats.hp,
    maxHp: stats.hp,
    cooldown: 0,
    target: null,
    path: [],
    pathAt: 0,
    attacking: false,
  };
  m.battle!.units.push(unit);
  return unit;
}

describe('combat feedback comes from actual attacks', () => {
  it.each([
    ['swordsman', undefined],
    ['archer', 'arrow'],
    ['wizard', 'fireball'],
    ['balloon', 'bomb'],
  ] as const)('%s identifies its weapon, target and one attack per cooldown', (kind, weapon) => {
    const m = new GameModel();
    m.startBattle(0);
    const target = makeBuilding(9000, 'townhall', 10, 10);
    m.battle!.buildings = [target];
    m.battle!.started = true;
    const attacker = addUnit(m, kind, 9.7, 11);
    const effects: FX[] = [];
    m.onEffect = (effect) => effects.push(effect);
    m.step(0.05);
    expect(target.maxHp - target.hp).toBe(weapon ? 0 : m.troopStats(kind).damage);
    const attack = effects.find((e) => e.sourceId === attacker.id);
    expect(attack?.weapon).toBe(weapon);
    expect(attack).toMatchObject({
      type: weapon ? 'projectile' : 'hit',
      targetId: target.id,
      targetBuilding: true,
      toX: kind === 'balloon' ? 10 : 12,
      toY: kind === 'balloon' ? 11 : 12,
    });
    const impact = m.battle!.projectiles?.[0]?.impact;
    if (impact !== undefined) while (m.battle!.elapsed < impact + 1e-6) m.step(0.05);
    else for (let i = 0; i < 8; i++) m.step(0.05);
    expect(target.maxHp - target.hp).toBe(m.troopStats(kind).damage);
    expect(effects.filter((e) => e.sourceId === attacker.id && e.type !== 'impact')).toHaveLength(
      1,
    );
    expect(effects.filter((e) => e.sourceId === attacker.id && e.type === 'impact')).toHaveLength(
      weapon ? 1 : 0,
    );
  });

  it.each([
    ['cannon', 'cannonball', 'swordsman'],
    ['archertower', 'arrow', 'swordsman'],
    ['airdefense', 'rocket', 'balloon'],
    ['wizardtower', 'arcane', 'swordsman'],
  ] as const)('%s identifies its projectile and the target layer', (kind, weapon, troop) => {
    const m = new GameModel();
    m.startBattle(0, true);
    const defense = makeBuilding(9000, kind as BuildingKind, 10, 10);
    m.battle!.buildings = [defense];
    m.battle!.started = true;
    const target = addUnit(m, troop, 7, 9);
    const effects: FX[] = [];
    m.onEffect = (effect) => effects.push(effect);
    m.step(0.05);
    expect(target.hp).toBe(target.maxHp);
    expect(effects.find((e) => e.sourceId === defense.id)).toMatchObject({
      type: 'projectile',
      weapon,
      targetId: target.id,
      targetBuilding: false,
      toAir: troop === 'balloon' ? true : undefined,
    });
    for (let i = 0; i < 8; i++) m.step(0.05);
    expect(target.hp).toBeLessThan(target.maxHp);
  });
});
