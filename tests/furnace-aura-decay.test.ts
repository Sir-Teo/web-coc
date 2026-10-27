import { expect, it } from 'vitest';
import { GameModel } from '../src/game/model';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { replayBattle } from '../src/game/replay';
import { furnaceAuraBattle, furnaceAuraRecording } from './fixtures/furnace-aura';

const capacities = [
  640, 640, 750, 750, 750, 830, 830, 830, 930, 930, 930, 1010, 1010, 1010, 1120, 1120, 1120, 1200,
];
for (const [i, capacity] of capacities.entries())
  it(`Life Gem ${i + 1} adds exactly ${capacity} consumable HP to Furnace's fixed drain`, () => {
    const r = furnaceAuraBattle(1, i + 1);
    r.until(1);
    const extra = r.unit.native!.effects!.extraHp!;
    expect(extra.capacity).toBe(capacity);
    expect(extra.amount).toBeLessThan(capacity);
    expect(r.unit.hp + extra.amount).toBeCloseTo(r.unit.maxHp + capacity - 25.5, 7);
    r.until(60.1);
    expect(r.unit.hp).toBeGreaterThan(0);
    expect(r.unit.hp).toBeCloseTo(capacity - 25.5 * 0.1, 6);
    expect(r.unit.native!.effects!.extraHp!.amount).toBe(0);
    expect(r.unit.native!.released).toBe(19);
    expect(r.unit.native!.damageTaken).toBeUndefined();
  });
for (const [index, hp] of [1530, 1620, 1710, 1800].entries())
  it(`Furnace ${index + 1} keeps its base drain rate and finite source stock while boosted`, () => {
    const r = furnaceAuraBattle(index + 1, 18);
    r.until(65);
    expect(r.unit.maxHp).toBe(hp);
    expect(r.unit.hp).toBeCloseTo(hp + 1200 - (hp * 65) / 60, 6);
    expect(r.unit.native!.released).toBe(19 + index);
  });
for (const [index, percent] of [0.2, 0.22, 0.24, 0.26].entries())
  it(`Apprentice Warden ${index + 1} grants its non-stacking source health to Furnace decay`, () => {
    const r = furnaceAuraBattle(1, 0, undefined, index + 1);
    r.until(1);
    const extra = r.unit.native!.effects!.extraHp!;
    expect(extra.capacity).toBeCloseTo(1530 * percent, 8);
    expect(extra.amount).toBeLessThan(extra.capacity!);
    expect(r.unit.hp + extra.amount).toBeCloseTo(1530 * (1 + percent) - 25.5, 7);
  });
it('simultaneous Life Gem and Apprentice auras spend only the strongest health grant', () => {
  const r = furnaceAuraBattle(1, 1, undefined, 4);
  r.until(1);
  const extra = r.unit.native!.effects!.extraHp!;
  expect(Object.keys(extra.sources!)).toHaveLength(2);
  expect(extra.capacity).toBe(640);
  expect(r.unit.hp + extra.amount).toBeCloseTo(1530 + 640 - 25.5, 7);
});
it('the granted 640 HP extends life by 640/25.5 seconds without refilling or extra stock', () => {
  const r = furnaceAuraBattle();
  r.until(85.05);
  expect(r.unit.hp).toBeGreaterThan(0);
  expect(r.unit.hp).toBeCloseTo(1530 + 640 - 25.5 * r.battle.elapsed, 6);
  r.until(85.15);
  expect(r.unit.hp).toBeLessThanOrEqual(0);
  expect(r.unit.native!.released).toBe(19);
  expect(r.unit.defeatedAt).toBeCloseTo(85.1, 8);
});
for (const version of [149, 150])
  it(`real Life Gem inputs preserve complete version-${version} portable snapshots`, () => {
    const r = furnaceAuraRecording(version),
      model = new GameModel();
    const b = r.snapshots.find((s) => s.at === r.extended)!.battle;
    expect(b.units.find((u) => u.id === r.id)!.hp > 0).toBe(version === 150);
    expect(model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(true);
    for (const snapshot of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
      model.seekReplay(snapshot.at);
      while (model.replay!.seeking) model.step(0.05);
      expect(JSON.parse(JSON.stringify(model.battle))).toEqual(snapshot.battle);
    }
  });
it('plain Furnace retains exact version-149 physical state without aura capability metadata', () => {
  const r = furnaceAuraBattle(1, 0),
    old = furnaceAuraBattle(1, 0, 149);
  r.until(35);
  old.until(35);
  expect(r.battle.nativeFurnaceAuraDecay).toBeUndefined();
  expect(JSON.parse(JSON.stringify(r.battle))).toEqual(JSON.parse(JSON.stringify(old.battle)));
});
it('enables aura decay only for Furnace with a carried source of extra health', () => {
  const s = structuredClone(furnaceAuraBattle().data.initial);
  expect(replayBattle(s).nativeFurnaceAuraDecay).toBe(true);
  expect(replayBattle(s, 149).nativeFurnaceAuraDecay).toBeUndefined();
  s.army.furnace = 0;
  expect(replayBattle(s).nativeFurnaceAuraDecay).toBeUndefined();
});
