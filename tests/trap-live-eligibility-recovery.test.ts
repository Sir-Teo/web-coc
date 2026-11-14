import { expect, it } from 'vitest';
import { GameModel, makeBuilding, type Unit } from '../src/game/model';
import { stepTraps } from '../src/game/traps';

function fixture() {
  const model = new GameModel();
  model.startBattle(0, true);
  const battle = model.battle!;
  battle.buildings = [makeBuilding(1, 'bomb', 4, 4), makeBuilding(2, 'bomb', 18, 18)];
  battle.traps = {};
  battle.started = true;
  battle.elapsed = 0.05;
  const unit = (id: number, x: number, y: number, hp: number): Unit => ({
    id,
    kind: 'giant',
    x,
    y,
    hp,
    maxHp: 10000,
    cooldown: 1000,
    target: null,
    path: [],
    pathAt: 0,
    attacking: false,
  });
  const first = unit(10, 4.5, 4.5, 10000);
  const later = unit(20, 18.5, 18.5, 0);
  battle.units = [first, later];
  return { battle, first, later };
}

it('reconsiders a previously defeated unit in the next trap phase', () => {
  const { battle, later } = fixture();
  stepTraps(battle, 0.05, () => {});
  expect(battle.traps[2]).toBeUndefined();
  later.hp = 1000;
  battle.elapsed += 0.05;
  stepTraps(battle, 0.05, () => {});
  expect(battle.traps[2].targetId).toBe(later.id);
});

it('retains live eligibility after a synchronous effect callback changes hitpoints', () => {
  const { battle, later } = fixture();
  // Synthetic public-callback boundary, not a claim that production render effects
  // revive units. The baseline grid stores references and observes this mutation.
  stepTraps(battle, 0.05, (effect) => {
    if (effect.type === 'trap' && effect.sourceId === 1) later.hp = 1000;
  });
  expect(battle.traps[2].targetId).toBe(later.id);
});

it('retains live rejection when a synchronous effect callback defeats a later candidate', () => {
  const { battle, later } = fixture();
  later.hp = 1000;
  stepTraps(battle, 0.05, (effect) => {
    if (effect.type === 'trap' && effect.sourceId === 1) later.hp = 0;
  });
  expect(battle.traps[2]).toBeUndefined();
});
