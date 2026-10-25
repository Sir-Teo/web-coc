import { describe, expect, it } from 'vitest';
import { GameModel, makeBuilding, type Building, type Unit } from '../src/game/model';

function arena(buildings: Building[]) {
  const model = new GameModel();
  model.startBattle(0, true);
  model.discardRecording();
  const battle = model.battle!;
  battle.buildings = [...buildings, makeBuilding(20, 'townhall', 40, 40)];
  battle.started = true;
  const archer: Unit = {
    id: 100,
    kind: 'archer',
    x: 9.5,
    y: 10.5,
    hp: 10000,
    maxHp: 10000,
    cooldown: 1000,
    target: 10,
    path: [],
    pathAt: 0,
    attacking: false,
  };
  battle.units = [archer];
  return { model, battle, archer };
}
const storage = (id = 10, x = 10, y = 10) => makeBuilding(id, 'goldstorage', x, y);

describe('battle building-id lookup reuse', () => {
  it('reads a cached target death live before choosing another building', () => {
    const target = storage();
    const { model, archer } = arena([target]);
    model.step(0.05);
    expect(archer.attacking).toBe(true);
    target.hp = 0;
    model.step(0.05);
    expect(archer.target).toBe(20);
    expect(archer.attacking).toBe(false);
  });

  it('follows a replacement object with the same id in the same array slot', () => {
    const { model, battle, archer } = arena([storage()]);
    model.step(0.05);
    expect(archer.attacking).toBe(true);
    battle.buildings[0] = storage(10, 30, 30);
    model.step(0.05);
    expect(archer.target).toBe(10);
    expect(archer.attacking).toBe(false);
  });

  it('recognizes an id edited on the same building object', () => {
    const target = storage();
    const { model, archer } = arena([target]);
    model.step(0.05);
    target.id = 11;
    model.step(0.05);
    expect(archer.target).toBe(11);
    expect(archer.attacking).toBe(true);
  });

  it('preserves last-id-wins behavior when duplicate-id objects are reordered', () => {
    const { model, battle, archer } = arena([storage(), storage(10, 30, 30)]);
    model.step(0.05);
    expect(archer.attacking).toBe(false);
    battle.buildings.reverse();
    model.step(0.05);
    expect(archer.target).toBe(10);
    expect(archer.attacking).toBe(true);
  });

  it('rebuilds for a replacement list and keeps another model’s battle separate', () => {
    const a = arena([storage()]);
    const b = arena([storage(10, 30, 30)]);
    a.model.step(0.05);
    b.model.step(0.05);
    expect([a.archer.attacking, b.archer.attacking]).toEqual([true, false]);
    a.battle.buildings = [storage(30), makeBuilding(20, 'townhall', 40, 40)];
    a.model.step(0.05);
    b.model.step(0.05);
    expect(a.archer.target).toBe(30);
    expect([a.archer.attacking, b.archer.attacking]).toEqual([true, false]);
  });
});
