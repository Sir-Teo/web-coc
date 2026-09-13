import { expect, it } from 'vitest';
import { infernoBattle } from './fixtures/inferno-battle';
import { stepInfernos } from '../src/game/inferno-battle';
function arena(mode: 'single' | 'multi', level = 8) {
  const b = infernoBattle(level, mode).battle!;
  b.units = b.units
    .slice(0, 6)
    .map((u, i) => ({ ...u, x: 21 + i * 0.1, y: 19, hp: 1e9, maxHp: 1e9 }));
  b.elapsed = 0;
  const tick = () => {
    b.elapsed += 0.064;
    stepInfernos(b, 0.064);
  };
  return { b, tick };
}
it('shares one ammo counter across beams and exhausts all source tiers after 128 active seconds', () => {
  for (let level = 1; level <= 12; level++)
    for (const mode of ['single', 'multi'] as const) {
      const { b, tick } = arena(mode, level);
      for (let i = 0; i < 1999; i++) tick();
      const state = b.infernos![6];
      expect(state.ammunition).toBe(1);
      expect(state.ammoChargeMs).toBe(64);
      tick();
      expect(state.ammunition).toBe(0);
      expect(state.emptyAt).toBe(128);
      expect(state.scheduler.slots.every((s) => s.targetId === null)).toBe(true);
      const hp = b.units.map((u) => u.hp);
      for (let i = 0; i < 20; i++) tick();
      expect(b.units.map((u) => u.hp)).toEqual(hp);
      expect(state.ammunition).toBe(0);
    }
});
it('pauses consumption while idle or frozen, retains fractional charge and resumes from serialization', () => {
  const { b, tick } = arena('multi');
  tick();
  expect(b.infernos![6].ammoChargeMs).toBe(64);
  b.defenseStuns[6] = 1;
  for (let i = 0; i < 10; i++) tick();
  expect(b.infernos![6].ammunition).toBe(1000);
  expect(b.infernos![6].ammoChargeMs).toBe(64);
  b.defenseStuns[6] = 0;
  b.units.forEach((u) => (u.x = 40));
  tick();
  expect(b.infernos![6].ammunition).toBe(1000);
  b.units.forEach((u) => (u.x = 21));
  const copy = JSON.parse(JSON.stringify(b));
  for (let i = 0; i < 20; i++) {
    tick();
    copy.elapsed = b.elapsed;
    stepInfernos(copy, 0.064);
  }
  expect(copy).toEqual(b);
  expect(b.infernos![6].ammunition).toBe(990);
});
it('charges active time once with staggered replacement targets and preserves restored empty state', () => {
  const { b, tick } = arena('multi');
  b.units.forEach((u, i) => (u.x = i === 0 ? 21 : 40));
  tick();
  b.units[1].x = 21;
  tick();
  expect(b.infernos![6].ammunition).toBe(999);
  b.units[0].x = 40;
  b.units[2].x = 21;
  tick();
  expect(b.infernos![6].ammunition).toBe(999);
  tick();
  expect(b.infernos![6].ammunition).toBe(998);
  b.infernos![6].ammunition = 0;
  const copy = JSON.parse(JSON.stringify(b));
  const hp = copy.units.map((u: { hp: number }) => u.hp);
  copy.elapsed += 0.064;
  stepInfernos(copy, 0.064);
  expect(copy.units.map((u: { hp: number }) => u.hp)).toEqual(hp);
  expect(
    copy.infernos[6].scheduler.slots.every((s: { targetId: number | null }) => s.targetId === null),
  ).toBe(true);
  expect(copy.infernos[6].ammunition).toBe(0);
});
