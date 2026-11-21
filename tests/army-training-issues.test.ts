import { expect, it } from 'vitest';
import { GameModel, makeBuilding } from '../src/game/model';
import { emptyArmy, emptySpells } from '../src/game/army';
import type { TroopKind } from '../src/game/data';

function village() {
  const m = new GameModel();
  m.state.obstacles = [];
  m.state.buildings = [
    makeBuilding(1, 'townhall', 24, 24, 12),
    makeBuilding(2, 'barracks', 8, 8, 7),
    makeBuilding(3, 'darkbarracks', 12, 8, 1),
    makeBuilding(4, 'camp', 18, 8, 9),
  ];
  m.state.army = emptyArmy();
  m.state.spells = emptySpells();
  m.state.troopLevels = { ...m.state.troopLevels, minion: 8 };
  m.state.dark = 100000;
  return m;
}
const cases: { kind: TroopKind; setup: (m: GameModel) => void; label: string; message: string }[] =
  [
    {
      kind: 'superminion',
      setup: (m) => {
        m.townhall.level = 11;
      },
      label: 'TH12 required',
      message: 'Super Minion requires Town Hall 12.',
    },
    {
      kind: 'superminion',
      setup: (m) => {
        m.state.troopLevels!.minion = 7;
      },
      label: 'Minion level 8',
      message: 'Super Minion requires Minion level 8.',
    },
    {
      kind: 'superminion',
      setup: () => {},
      label: 'Boost to train',
      message: 'Activate the Super Minion boost before training.',
    },
    {
      kind: 'superminion',
      setup: (m) => {
        m.state.superBoosts = { superminion: m.clock - 1 };
      },
      label: 'Boost to train',
      message: 'Activate the Super Minion boost before training.',
    },
    {
      kind: 'superminion',
      setup: (m) => {
        m.state.superBoosts = { superminion: m.clock + 10000 };
        m.state.buildings = m.state.buildings.filter((b) => b.kind !== 'darkbarracks');
      },
      label: 'Dark Barracks 1',
      message: 'Super Minion requires a completed level 1 Dark Barracks.',
    },
    {
      kind: 'wizard',
      setup: (m) => {
        m.state.buildings.find((b) => b.kind === 'barracks')!.level = 6;
      },
      label: 'Barracks 7',
      message: 'Wizard requires a completed level 7 Barracks.',
    },
    {
      kind: 'witch',
      setup: () => {},
      label: 'Dark Barracks 5',
      message: 'Witch requires a completed level 5 Dark Barracks.',
    },
  ];
for (const c of cases)
  it(`${c.kind}: ${c.label} is consistent across Add, Fill and army preparation`, () => {
    const m = village();
    c.setup(m);
    const before = JSON.stringify(m.state),
      messages: string[] = [];
    m.onToast = (t) => messages.push(t);
    expect(m.troopTrainingIssue(c.kind)).toEqual({ label: c.label, message: c.message });
    expect(m.troopUnlocked(c.kind)).toBe(false);
    m.train(c.kind);
    expect(m.fillTroop(c.kind)).toBe(0);
    expect(messages).toEqual([c.message, c.message]);
    expect(m.armyPreparationIssue({ ...emptyArmy(), [c.kind]: 1 }, emptySpells())).toBe(c.message);
    expect(JSON.stringify(m.state)).toBe(before);
  });

it('allows valid activation, Add, Fill and larger prepared compositions', () => {
  const m = village();
  m.boostSuperTroop('superminion');
  expect(m.troopTrainingIssue('superminion')).toBeNull();
  expect(m.troopUnlocked('superminion')).toBe(true);
  m.train('superminion');
  expect(m.state.army.superminion).toBe(1);
  expect(m.armyPreparationIssue({ ...emptyArmy(), superminion: 2 }, emptySpells())).toBeNull();
  expect(m.fillTroop('superminion')).toBeGreaterThan(0);
});

it('accepts an already prepared composition after expiry while refusing new troops', () => {
  const m = village();
  m.state.army.superminion = 1;
  m.state.superBoosts = { superminion: m.clock - 1 };
  expect(m.troopTrainingIssue('superminion')!.label).toBe('Boost to train');
  expect(m.armyPreparationIssue({ ...emptyArmy(), superminion: 1 }, emptySpells())).toBeNull();
  expect(m.armyPreparationIssue({ ...emptyArmy(), superminion: 2 }, emptySpells())).toBe(
    'Activate the Super Minion boost before training.',
  );
  m.train('superminion');
  expect(m.state.army.superminion).toBe(1);
});

it('clock expiry publishes the new missing-boost requirement and keeps prepared troops', () => {
  const m = village(),
    end = m.clock + 1000;
  m.state.army.superminion = 1;
  m.state.superBoosts = { superminion: end };
  expect(m.troopTrainingIssue('superminion')).toBeNull();
  const revision = m.structuralRevision;
  m.tick(end);
  expect(m.structuralRevision).toBeGreaterThan(revision);
  expect(m.state.superBoosts.superminion).toBeUndefined();
  expect(m.troopTrainingIssue('superminion')!.label).toBe('Boost to train');
  expect(m.state.army.superminion).toBe(1);
});

it('reports each housing shortfall and preserves the active army on refusal', () => {
  const m = village();
  m.state.buildings.push(makeBuilding(5, 'spellfactory', 30, 30, 1));
  m.train('giant');
  m.brew('lightning');
  const army = { ...emptyArmy(), swordsman: m.capacity + 1 };
  const spells = { ...emptySpells(), lightning: 3 };
  m.state.armyPresets = [{ name: 'Oversized', army, spells }, null, null];
  const troopIssue = `Troops need ${m.capacity + 1} spaces, but your camps hold ${m.capacity}.`;
  const spellIssue = 'Spells need 3 spaces, but your factories hold 2.';
  expect(m.armyPreparationIssue(army, emptySpells())).toBe(troopIssue);
  expect(m.armyPreparationIssue(emptyArmy(), spells)).toBe(spellIssue);
  expect(m.armyPreparationIssue(army, spells)).toBe(`${troopIssue} ${spellIssue}`);
  const before = structuredClone(m.state);
  m.loadArmyPreset(0);
  expect(m.state).toEqual(before);
});

it('reports the completed dark facility for preparation and research until its upgrade finishes', () => {
  const m = village();
  const factory = makeBuilding(5, 'darkspellfactory', 18, 18, 1);
  m.state.buildings.push(
    factory,
    makeBuilding(6, 'laboratory', 26, 18, 6),
    makeBuilding(7, 'spellfactory', 30, 18, 3),
    makeBuilding(8, 'builder', 33, 18),
  );
  m.state.elixir = 1000000;
  m.upgrade(factory.id);
  expect(factory.upgradeEnd).toBeGreaterThan(m.clock);
  const messages: string[] = [];
  const darkBefore = m.state.dark;
  m.onToast = (message) => messages.push(message);
  const spellIssue = 'Earthquake Spell requires a completed level 2 Dark Spell Factory.';
  expect(m.spellTrainingIssue('earthquake')).toEqual({
    label: 'Dark Spell Factory 2',
    message: spellIssue,
  });
  m.brew('earthquake');
  m.research('earthquake');
  m.research('hogrider');
  expect(messages).toEqual([
    spellIssue,
    spellIssue,
    'Hog Rider requires a completed level 2 Dark Barracks.',
  ]);
  expect(m.state.spells.earthquake).toBe(0);
  expect(m.state.dark).toBe(darkBefore);
  expect(m.state.research).toBeUndefined();
  const prepared = { ...emptySpells(), earthquake: 1 };
  expect(m.armyPreparationIssue(emptyArmy(), prepared)).toBe(spellIssue);
  m.tick(factory.upgradeEnd!);
  expect(m.spellTrainingIssue('earthquake')).toBeNull();
  m.brew('earthquake');
  expect(m.state.spells.earthquake).toBe(1);
  m.research('earthquake');
  expect(m.state.research).toEqual({ kind: 'earthquake', end: m.clock + 43200000 });
  expect(m.state.dark).toBe(darkBefore - 6000);
});
