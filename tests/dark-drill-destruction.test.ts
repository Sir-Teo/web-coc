import { expect, it } from 'vitest';
import { GameModel, makeBuilding, type FX } from '../src/game/model';
import { emptyArmy, emptySpells, defaultSpellLevels } from '../src/game/army';
import { TROOP_KEYS } from '../src/game/data';
import {
  replayBattle,
  REPLAY_VERSION,
  compatibleReplayVersion,
  type ReplaySetup,
} from '../src/game/replay';
const setup = (): ReplaySetup => ({
  index: 0,
  practice: true,
  nextId: 100,
  buildings: [makeBuilding(1, 'darkdrill', 10, 10, 1)],
  army: emptyArmy(),
  spells: emptySpells(),
  spellLevels: defaultSpellLevels(),
  troopLevels: Object.fromEntries(TROOP_KEYS.map((k) => [k, 1])) as ReturnType<typeof emptyArmy>,
});
it('records the first fatal damage time and location in version 40 battles', () => {
  expect(REPLAY_VERSION).toBeGreaterThanOrEqual(49);
  const m = new GameModel();
  m.battle = replayBattle(setup(), 40);
  const effects: FX[] = [];
  m.onEffect = (effect) => effects.push(effect);
  const b = m.battle.buildings[0];
  m.damage(b, 1, 1);
  expect(m.battle.drillDestructions).toEqual({});
  m.damage(b, 1000, 1.125);
  expect(m.battle.drillDestructions).toEqual({ 1: { at: 1.125, x: 11.5, y: 11.5, level: 1 } });
  expect(effects.filter((effect) => effect.type === 'destroy')).toMatchObject([{ sourceId: 1 }]);
  m.damage(b, 1000, 2);
  expect(m.battle.drillDestructions![1].at).toBe(1.125);
  expect(JSON.parse(JSON.stringify(m.battle)).drillDestructions).toEqual(
    m.battle.drillDestructions,
  );
});
it('preserves the absence of destruction history in older replay state shapes', () => {
  for (const version of [34, 35, 36, 37, 38, 39]) {
    expect(compatibleReplayVersion(version)).toBe(true);
    const m = new GameModel();
    m.battle = replayBattle(setup(), version);
    const effects: FX[] = [];
    m.onEffect = (effect) => effects.push(effect);
    m.damage(m.battle.buildings[0], 1000, 1.125);
    expect(effects.filter((effect) => effect.type === 'destroy')).toHaveLength(1);
    expect(effects[0].sourceId).toBeUndefined();
    expect(Object.hasOwn(m.battle, 'drillDestructions')).toBe(false);
  }
  const initial = setup();
  initial.buildings = [makeBuilding(1, 'townhall', 10, 10)];
  expect(Object.hasOwn(replayBattle(initial), 'drillDestructions')).toBe(false);
});
