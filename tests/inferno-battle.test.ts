import { expect, it } from 'vitest';
import { GameModel, makeBuilding, type Unit } from '../src/game/model';
import { stepInfernos } from '../src/game/inferno-battle';
import { buildingHp, maxCountFor, maxLevelFor, defenseDamage } from '../src/game/data';

function fixture() {
  const model = new GameModel();
  model.startBattle(0, true);
  const b = model.battle!;
  b.started = true;
  b.buildings = [makeBuilding(1, 'inferno', 10, 10, 1)];
  b.units = [
    {
      id: 1,
      kind: 'giant',
      x: 14,
      y: 11,
      hp: 5000,
      maxHp: 5000,
      cooldown: 100,
      target: null,
      path: [],
      pathAt: 0,
      attacking: false,
    } as Unit,
  ];
  return { model, b };
}
it('dispatches fixed pulse clocks across the 50ms battle cadence', () => {
  const { b } = fixture();
  for (let i = 1; i <= 10; i++) {
    b.elapsed = i * 0.05;
    stepInfernos(b, 0.05);
  }
  expect(b.infernos![1].hits.map((h) => h.at)).toEqual([0.128, 0.256, 0.384]);
  expect(b.units[0].hp).toBeCloseTo(5000 - 3 * 3.84, 10);
  const copy = JSON.parse(JSON.stringify(b));
  for (let i = 11; i <= 40; i++) {
    b.elapsed = copy.elapsed = i * 0.05;
    stepInfernos(b, 0.05);
    stepInfernos(copy, 0.05);
  }
  expect(copy).toEqual(b);
});
it('resets frozen locks and never applies generic projectile damage', () => {
  const { model, b } = fixture();
  b.defenseStuns[1] = 1;
  for (let i = 0; i < 10; i++) model.step(0.05);
  expect(b.units[0].hp).toBe(5000);
  expect(b.infernos![1].hits).toEqual([]);
  expect(b.infernos![1].scheduler.slots[0].targetId).toBeNull();
  b.defenseStuns[1] = 0;
  for (let i = 0; i < 10; i++) model.step(0.05);
  expect(b.units[0].hp).toBeLessThan(5000);
  expect(b.projectiles ?? []).toEqual([]);
});
it('retains source tiers while home and campaign exposure remain unavailable', () => {
  expect(buildingHp('inferno', 12)).toBe(5100);
  expect(defenseDamage('inferno', 1)).toBe(3.84);
  expect(maxCountFor('inferno', 8)).toBe(0);
  expect(maxLevelFor('inferno', 8)).toBe(0);
});
