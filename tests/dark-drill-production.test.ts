import { expect, it } from 'vitest';
import { GameModel, makeBuilding } from '../src/game/model';
import { darkDrillProduction, produceDarkElixir } from '../src/game/dark-drill-production';

it('converts the source per-100-hour units and caps production at every tier', () => {
  expect(darkDrillProduction(1)).toEqual({ perHour: 20, capacity: 160 });
  expect(darkDrillProduction(11)).toEqual({ perHour: 200, capacity: 4600 });
  for (let level = 1; level <= 11; level++) {
    const { perHour, capacity } = darkDrillProduction(level);
    expect(produceDarkElixir(level, 0, 3600)).toBe(perHour);
    expect(produceDarkElixir(level, 0, 1e8)).toBe(capacity);
    expect(produceDarkElixir(level, capacity + 500, 3600)).toBe(capacity + 500);
  }
  expect(() => darkDrillProduction(12)).toThrow();
});
it('uses elapsed home time and produces only after an upgrade completes', () => {
  const model = new GameModel();
  model.state.lastTick = 1000000;
  const drill = makeBuilding(999, 'darkdrill', 10, 10, 1);
  model.state.buildings = [drill];
  model.tick(1000000 + 3600000);
  expect(drill.stored).toBeCloseTo(20);
  drill.upgradeEnd = model.state.lastTick + 1800000;
  model.tick(model.state.lastTick + 3600000);
  expect(drill.level).toBe(2);
  expect(drill.stored).toBeCloseTo(35);
});
it('preserves legacy overflow through JSON restoration and resumes after space is made', () => {
  const model = new GameModel();
  const drill = makeBuilding(999, 'darkdrill', 10, 10, 1);
  drill.stored = 2000;
  model.state.buildings = [drill];
  const restored = new GameModel(JSON.parse(JSON.stringify(model.state)));
  restored.tick(restored.state.lastTick + 3600000);
  expect(restored.state.buildings[0].stored).toBe(2000);
  restored.state.buildings[0].stored = 0;
  restored.tick(restored.state.lastTick + 3600000);
  expect(restored.state.buildings[0].stored).toBeCloseTo(20);
});
