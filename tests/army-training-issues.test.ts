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
        m.townhall.level = 10;
      },
      label: 'TH11 required',
      message: 'Super Minion requires Town Hall 11.',
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
