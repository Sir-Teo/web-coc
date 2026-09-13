import { expect, it } from 'vitest';
import { makeBuilding, type Unit } from '../src/game/model';
import { emptyArmy, emptySpells } from '../src/game/army';
import { TROOP_KEYS } from '../src/game/data';
import { REPLAY_VERSION, validateReplay, replayBattle, type ReplayData } from '../src/game/replay';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { stepInfernos } from '../src/game/inferno-battle';
function replay(): ReplayData {
  return {
    version: REPLAY_VERSION,
    initial: {
      index: 0,
      practice: true,
      nextId: 100,
      buildings: [{ ...makeBuilding(1, 'inferno', 10, 10, 8), infernoMode: 'multi' }],
      army: emptyArmy(),
      spells: emptySpells(),
      spellLevels: { heal: 1, rage: 1, lightning: 1 },
      troopLevels: Object.fromEntries(TROOP_KEYS.map((k) => [k, 1])) as ReturnType<
        typeof emptyArmy
      >,
    },
    steps: [],
    actions: [{ type: 'end', step: 0 }],
  };
}
it('round-trips the explicit Inferno mode through the portable replay format', () => {
  const data = replay();
  expect(validateReplay(data)).toBe(true);
  const restored = parseReplayFile(JSON.stringify(makeReplayFile(data)));
  expect(restored.initial.buildings[0].infernoMode).toBe('multi');
  const battle = replayBattle(restored.initial, restored.version);
  battle.units = Array.from(
    { length: 7 },
    (_, i) =>
      ({
        id: i + 1,
        kind: 'giant',
        x: 12,
        y: 11,
        hp: 1000,
        maxHp: 1000,
        cooldown: 0,
        target: null,
        path: [],
        pathAt: 0,
        attacking: false,
      }) as Unit,
  );
  for (let i = 1; i <= 4; i++) {
    battle.elapsed = i * 0.05;
    stepInfernos(battle, 0.05);
  }
  expect(battle.infernos![1].scheduler.mode).toBe('multi');
  expect(battle.infernos![1].hits).toHaveLength(6);
  expect(battle.units.filter((u) => u.hp < 1000)).toHaveLength(6);
});
it('rejects unsupported old contracts, invalid modes and mode fields on other kinds', () => {
  for (const version of [34, 35, 36, 37, 38])
    expect(validateReplay({ ...replay(), version })).toBe(false);
  const invalid = replay();
  (invalid.initial.buildings[0] as any).infernoMode = 'both';
  expect(validateReplay(invalid)).toBe(false);
  const wrong = replay();
  wrong.initial.buildings[0] = { ...makeBuilding(1, 'cannon', 10, 10), infernoMode: 'multi' };
  expect(validateReplay(wrong)).toBe(false);
});
