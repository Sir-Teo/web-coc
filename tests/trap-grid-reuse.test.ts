import { describe, expect, it } from 'vitest';
import { GameModel, makeBuilding, type Building, type Unit } from '../src/game/model';
import { stepTraps } from '../src/game/traps';

function arena(buildings: Building[]) {
  const model = new GameModel();
  model.startBattle(0, true);
  const battle = model.battle!;
  battle.buildings = buildings;
  battle.units = [];
  battle.traps = {};
  battle.started = true;
  battle.elapsed = 0.05;
  return battle;
}
const unit = (id: number, x: number, y: number): Unit => ({
  id,
  kind: 'giant',
  x,
  y,
  hp: 10000,
  maxHp: 10000,
  cooldown: 1000,
  target: null,
  path: [],
  pathAt: 0,
  attacking: false,
});
const step = (battle: ReturnType<typeof arena>) => stepTraps(battle, 0.05, () => {});

describe('reused trap search storage', () => {
  it('ignores removed units and old nearby slots when a bucket shrinks or becomes empty', () => {
    const trap = makeBuilding(1, 'bomb', 10, 10);
    const battle = arena([trap]);
    battle.units = [unit(7, 10.5, 10.5), unit(5, 10.5, 10.5), unit(6, 10.5, 10.5)];
    step(battle);
    expect(battle.traps[1].targetId).toBe(5);
    battle.traps = {};
    battle.units = [unit(9, 10.5, 10.5)];
    battle.elapsed += 0.05;
    step(battle);
    expect(battle.traps[1].targetId).toBe(9);
    battle.traps = {};
    battle.units = [];
    battle.elapsed += 0.05;
    step(battle);
    expect(battle.traps[1]).toBeUndefined();
  });

  it('keeps the lower-id winner for equal-distance targets in different cells', () => {
    const battle = arena([makeBuilding(1, 'giantbomb', 10, 10)]);
    battle.units = [unit(9, 9.5, 11), unit(3, 12.5, 11)];
    step(battle);
    expect(battle.traps[1].targetId).toBe(3);
  });

  it('rebuilds after a native trap event moves a unit before a later trigger search', () => {
    const first = makeBuilding(1, 'bomb', 4, 4);
    const tornado = makeBuilding(2, 'tornadotrap', 10, 10);
    const later = makeBuilding(3, 'bomb', 18, 18);
    const battle = arena([first, tornado, later]);
    battle.nativeRoster = true;
    delete battle.catalog;
    const target = unit(10, 10.5, 10.5);
    battle.units = [target];
    stepTraps(battle, 0.05, (effect) => {
      if (effect.type === 'trap' && effect.sourceId === tornado.id) {
        target.x = 18.5;
        target.y = 18.5;
      }
    });
    expect(battle.traps[first.id]).toBeUndefined();
    expect(battle.traps[tornado.id].resolved).toBe(true);
    expect(battle.traps[later.id].targetId).toBe(target.id);
  });

  it('keeps alternating battles separate and follows a replacement layout', () => {
    const a = arena([makeBuilding(1, 'bomb', 10, 10)]);
    const b = arena([makeBuilding(1, 'bomb', 10, 10)]);
    a.units = [unit(11, 10.5, 10.5)];
    b.units = [unit(22, 10.5, 10.5)];
    step(a);
    step(b);
    expect([a.traps[1].targetId, b.traps[1].targetId]).toEqual([11, 22]);
    a.traps = {};
    a.buildings = [makeBuilding(2, 'bomb', 30, 30)];
    a.units = [unit(33, 30.5, 30.5)];
    step(a);
    expect(a.traps[1]).toBeUndefined();
    expect(a.traps[2].targetId).toBe(33);
    expect(b.traps[1].targetId).toBe(22);
  });

  it('drops an unusually wide cached grid without losing the next phase target', () => {
    const battle = arena([makeBuilding(1, 'bomb', 10, 10)]);
    // Synthetic out-of-village cells exercise the cache bound; normal units stay on the map.
    battle.units = Array.from({ length: 513 }, (_, i) => unit(i + 10, 100 + i * 4, 100));
    step(battle);
    expect(battle.traps[1]).toBeUndefined();
    battle.units = [unit(1000, 10.5, 10.5)];
    battle.elapsed += 0.05;
    step(battle);
    expect(battle.traps[1].targetId).toBe(1000);
  });
});
