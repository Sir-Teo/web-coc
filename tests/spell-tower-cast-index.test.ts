import { expect, it } from 'vitest';
import { SPELL_TOWER } from '../src/game/spell-tower-stats';
import { spellTowerDestroyed, type SpellTowerCast } from '../src/game/spell-tower';
import { isolatedBattle, lateBuilding } from './fixtures/late-defense-battle';

const weapon = (['rage', 'poison', 'invisibility'] as const).find(
  (name) => SPELL_TOWER[name].castOnDeath,
)!;

it('hands out unique cast indices after expired casts are pruned', () => {
  const battle = isolatedBattle([
    lateBuilding(1, 'spelltower', 20, 20, 3, weapon),
    lateBuilding(2, 'spelltower', 30, 20, 3, weapon),
  ]);
  battle.elapsed = 200;
  const cast = (index: number, deployAt: number): SpellTowerCast => ({
    index,
    sourceId: 2,
    weapon,
    level: 3,
    at: deployAt - 0.8,
    deployAt,
    fromX: 31,
    fromY: 21,
    x: 31,
    y: 21,
    targetId: null,
    onDeath: false,
    applied: deployAt < 100 ? 99 : 0,
  });
  battle.late = {
    spellTower: {
      towers: {},
      // The first cast ended long ago and is pruned by the next cast; the second is live.
      casts: [cast(1, 1), cast(2, 199)],
      poisonTick: 0,
      defenderRage: {},
      defenderHidden: {},
    },
  };
  const tower = battle.buildings.find((b) => b.id === 1)!;
  tower.hp = 0;
  spellTowerDestroyed(
    { battle, dt: 0, phase: 'defenses', effect: () => {}, damageBuilding: () => {} },
    tower,
    battle.elapsed,
  );
  const indices = battle.late.spellTower!.casts.map((entry) => entry.index);
  // Before the fix the new cast reused `casts.length + 1` = 2, the live cast's index.
  expect(indices).toEqual([2, 3]);
  expect(new Set(indices).size).toBe(indices.length);
});
