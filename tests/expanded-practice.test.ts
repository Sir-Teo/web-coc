import { expect, it } from 'vitest';
import { GameModel } from '../src/game/model';
import { freshNativeCampaign, NATIVE_CAMPAIGN } from '../src/game/native-campaign';
import { practiceLevelAt } from '../src/game/practice-mode';
import { validateReplay, replayBattle } from '../src/game/replay';
import { migrateSave, validateSave } from '../src/game/save';
import { TROOP_KEYS } from '../src/game/data';
import { ladderOpponent } from '../src/game/ladder';

it.each([
  [150, 'Angry Babies'],
  [151, 'Flying Circus'],
] as const)(
  'fields appended Practice index %i with its complete source army and replay',
  (index, name) => {
    const m = new GameModel();
    m.townhall!.level = 12;
    m.clearArmy();
    const home = structuredClone(m.state.army);
    const level = practiceLevelAt(index)!;
    expect(level.name).toBe(name);
    expect(level.steps.length).toBeGreaterThan(0);
    expect(level.heroes.length).toBeGreaterThan(0);
    m.startCampaign(index, false);
    const b = m.battle!;
    expect(b.fixedArmy).toBe(true);
    expect(b.boardSize).toBe(52);
    expect(b.remaining).toEqual(level.army);
    m.activeTroop = TROOP_KEYS.find((k) => b.remaining[k] > 0)!;
    expect(m.deploy(51, 1)).toBe(true);
    m.step(0.05);
    m.finishBattle();
    const data = m.state.raidLog![0].replay!;
    expect(validateReplay(data)).toBe(true);
    expect(replayBattle(data.initial, data.version).boardSize).toBe(52);
    expect(m.state.army).toEqual(home);
  },
);

it('extends a 150-stage save while preserving all existing stars and enemy inventory', () => {
  const m = new GameModel();
  m.state.nativeCampaign = freshNativeCampaign();
  const old = structuredClone(m.state);
  old.nativeCampaign!.stars = Array.from({ length: 150 }, (_, i) => i % 4);
  old.nativeCampaign!.remaining.length = 150;
  old.nativeCampaign!.remaining[149] = { gold: 1, elixir: 2, dark: 3 };
  const prior = structuredClone(old.nativeCampaign!);
  const migrated = migrateSave(old) as typeof old;
  expect(validateSave(migrated)).toBe(true);
  const progress = migrated.nativeCampaign!;
  expect(progress.stars.slice(0, 150)).toEqual(prior.stars);
  expect(progress.remaining.slice(0, 150)).toEqual(prior.remaining);
  expect(progress.stars.slice(150)).toEqual([0, 0]);
  for (const index of [150, 151])
    expect(progress.remaining[index]).toEqual({
      gold: NATIVE_CAMPAIGN[index].gold,
      elixir: NATIVE_CAMPAIGN[index].elixir,
      dark: NATIVE_CAMPAIGN[index].darkElixir,
    });
});

it('keeps the new full-map lessons out of the existing ladder geometry era', () => {
  for (const townhall of [9, 12])
    for (let seed = 0; seed < 100; seed++)
      expect(ladderOpponent(seed, townhall, 1000).index).toBeLessThan(150);
});
