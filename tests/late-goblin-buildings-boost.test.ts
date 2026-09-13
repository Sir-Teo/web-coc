import { expect, it, vi } from 'vitest';

// Rage from Spell Towers belongs to another family; this checks the weapons consult its hook.
vi.mock('../src/game/spell-tower', async (original) => ({
  ...(await original<typeof import('../src/game/spell-tower')>()),
  spellTowerDefenseBoost: (_: unknown, building: { id: number }) =>
    building.id === 1000 ? { damage: 2, rate: 2 } : { damage: 1, rate: 1 },
}));

const { makeBuilding } = await import('../src/game/model');
const { NATIVE_COMBAT } = await import('../src/game/native-campaign');
const { weaponTickTime } = await import('../src/game/late-goblin-weapon');
const { lateGoblinLive, lateGoblinReplay } = await import('./fixtures/late-goblin-battle');

it("applies defensive Spell Tower boosts to Builder's Hut damage and hit timers", () => {
  const hp = NATIVE_COMBAT[1000015].hp[3];
  const huts = [1000, 1001].map((id, i) => ({
    ...makeBuilding(id, 'builder', 20, 14 + i * 12, 4),
    hp,
    maxHp: hp,
  }));
  const model = lateGoblinLive(
    lateGoblinReplay(
      84,
      [
        { step: 0, kind: 'pekka', x: 16, y: 15 },
        { step: 0, kind: 'pekka', x: 16, y: 27 },
      ],
      { buildings: huts, steps: 120, scenery: false },
    ),
    0,
  );
  const b = model.battle!;
  while (!b.late?.builderHut?.huts[1001]?.shots.length) model.step(0.05);
  const [boosted, normal] = [1000, 1001].map((id) => b.late!.builderHut!.huts[id]);
  // Both wake together; the boosted timer gains 128 ms per tick and fires on its fourth tick.
  expect(boosted.shots[0].at).toBeCloseTo(weaponTickTime(25 + 3), 9);
  expect(normal.shots[0].at).toBeCloseTo(weaponTickTime(25 + 6), 9);
  while (!normal.hits.length) model.step(0.05);
  // Each P.E.K.K.A stands only inside its own hut's seven-tile range.
  const [near, far] = [15, 27].map((y) => b.units.find((u) => u.y > y - 4 && u.y < y + 4)!);
  expect(near.maxHp - near.hp).toBe(96 * boosted.hits.length);
  expect(far.maxHp - far.hp).toBe(48 * normal.hits.length);
});
