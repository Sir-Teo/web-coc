import { expect, it } from 'vitest';
import { heroPuppetBattle } from './fixtures/hero-puppet';

it.each([
  [283, 1, 20],
  [284, 1, 20],
  [284, 18, 25],
  [284, 27, 30],
])('uses recording %i mirror level %i lifetime of %is', (version, level, lifetime) => {
  const r = heroPuppetBattle(
    { kind: 'queen', level: 20, items: [{ slug: 'magic-mirror', level }] },
    {},
    undefined,
    version,
  );
  // Keep the fixture battle open long enough to sample every lifetime.
  const hall = r.battle.buildings[0];
  hall.hp = hall.maxHp = 100000;
  expect(r.model.deployNativeHero('queen', 11.4, 11.5)).toBe(true);
  expect(r.model.activateNativeHeroAbility('queen')).toBe(true);
  const queen = r.battle.units.find((u) => u.hero === 'queen')!;
  const mirrors = r.battle.units.filter((u) => u.native?.owner === queen.id);
  expect(mirrors).toHaveLength(level < 18 ? 1 : 2);
  for (let i = 0; i < lifetime * 20 - 1; i++) r.model.step(0.05);
  expect(r.battle.elapsed).toBeCloseTo(lifetime - 0.05);
  expect(mirrors.every((u) => u.hp > 0)).toBe(true);
  for (let i = 0; i < 3; i++) r.model.step(0.05);
  for (const mirror of mirrors) {
    if (version === 283) expect(mirror.hp).toBeGreaterThan(0);
    else expect(mirror).toMatchObject({ hp: 0, spent: true, defeatedAt: lifetime });
  }
  expect(queen.hp).toBeGreaterThan(0);
});
