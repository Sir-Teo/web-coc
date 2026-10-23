import { expect, it } from 'vitest';
import { GameModel, makeBuilding } from '../src/game/model';
import { emptyArmy, emptySpells } from '../src/game/army';
import { castNativeSpell, stepNativeSpells } from '../src/game/native-spells';
import { spawnGarrisonDefender } from '../src/game/garrison-combat';

function steadyDamage(step: number, legacy = false) {
  const model = new GameModel();
  model.state.obstacles = [];
  model.state.buildings = [makeBuilding(1, 'townhall', 36, 36, 18)];
  model.state.nextId = 100;
  model.state.army = { ...emptyArmy(), giant: 1 };
  model.state.spells = emptySpells();
  model.state.king = undefined;
  model.startBattle(0, true);
  const battle = model.battle!;
  if (legacy) delete battle.nativePoisonClock;
  const defender = spawnGarrisonDefender(battle, 'dragon', 5, 1, 10, 10, 0);
  castNativeSpell(battle, 'Poison', 1, 'attack', 10, 10);
  castNativeSpell(battle, 'Poison', 1, 'attack', 10, 10, { at: 0.2 });
  const until = (end: number) => {
    while (battle.elapsed < end - 1e-9) {
      battle.elapsed = Math.round(Math.min(end, battle.elapsed + step) * 1e9) / 1e9;
      stepNativeSpells({ battle, damageBuilding: () => {}, effect: () => {} });
    }
  };
  until(6);
  const hp = defender.hp;
  until(8);
  return hp - defender.hp;
}

it.each([0.05, 0.1, 0.2, 0.4, 0.5, 1, 2, 10])(
  'keeps the native Poison cap with %s-second updates',
  (step) => {
    expect(steadyDamage(step)).toBeCloseTo(90 * 2, 8);
  },
);

it('preserves the released version-62 larger-update calculation', () => {
  expect(steadyDamage(1, true)).toBeCloseTo(270, 8);
});

it('reconstructs recorded larger steps exactly across portable seeks and version 62', async () => {
  const { defenderPoisonRecording } = await import('./fixtures/defender-poison');
  const { replayBattle, validateReplay, compatibleReplayVersion } =
    await import('../src/game/replay');
  const { makeReplayFile, parseReplayFile } = await import('../src/game/replay-file');
  const { data, snapshots, later, defenderId } = defenderPoisonRecording(2, 1);
  expect(validateReplay(data)).toBe(true);
  expect(data.steps).toContain(1);
  expect(replayBattle(data.initial, 63).nativePoisonClock).toBe(true);
  expect(replayBattle(data.initial, 62).nativePoisonClock).toBeUndefined();
  const viewer = new GameModel();
  expect(viewer.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data))))).toBe(true);
  for (const snapshot of [...snapshots].reverse()) {
    viewer.seekReplay(snapshot.at);
    while (viewer.replay!.seeking) viewer.step(0.05);
    expect(JSON.parse(JSON.stringify(viewer.battle))).toEqual(snapshot.battle);
  }
  viewer.seekReplay(later);
  while (viewer.replay!.seeking) viewer.step(0.05);
  const hp = viewer.battle!.defenders!.find((defender) => defender.id === defenderId)!.hp;
  expect(compatibleReplayVersion(62)).toBe(true);
  expect(viewer.openReplay({ ...data, version: 62 })).toBe(true);
  viewer.seekReplay(later);
  while (viewer.replay!.seeking) viewer.step(0.05);
  expect(viewer.battle!.defenders!.find((defender) => defender.id === defenderId)!.hp).toBeLessThan(
    hp,
  );
});
