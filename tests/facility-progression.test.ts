import { describe, expect, it } from 'vitest';
import { GameModel, initialSave, makeBuilding } from '../src/game/model';
import {
  BUILDINGS,
  buildingHp,
  maxCountFor,
  maxLevelFor,
  upgradeCost,
  upgradeSeconds,
} from '../src/game/data';
import { FACILITY_LEVELS, spellFactoryCapacity } from '../src/game/facility-progression';
import { emptySpells } from '../src/game/army';
import { REPLAY_VERSION, validateReplay } from '../src/game/replay';
import { validateSave } from '../src/game/save';
import { developedSave } from './fixtures/developed-village';

const levels = {
  barracks: [
    [100, 100, 10],
    [200, 500, 15],
    [250, 2500, 120],
    [300, 5000, 1800],
    [360, 20000, 7200],
    [420, 120000, 14400],
    [500, 270000, 21600],
    [575, 600000, 43200],
    [650, 1000000, 86400],
    [730, 1400000, 129600],
  ],
  laboratory: [
    [500, 5000, 60],
    [550, 25000, 1800],
    [600, 50000, 7200],
    [650, 100000, 14400],
    [700, 200000, 28800],
    [750, 400000, 57600],
  ],
  spellfactory: [
    [425, 150000, 21600],
    [470, 300000, 43200],
    [520, 600000, 86400],
  ],
} as const;

describe('native army facility progression', () => {
  for (const kind of ['barracks', 'laboratory', 'spellfactory'] as const)
    levels[kind].forEach(([hp, cost, seconds], index) => {
      const level = index + 1;
      it(`purchases ${kind} level ${level} at its exact price and completes once at its saved deadline`, () => {
        const m = new GameModel();
        m.townhall!.level = 8;
        m.state.obstacles = [];
        m.state.buildings = m.state.buildings.filter((b) => b.kind !== kind);
        m.state.elixir = cost;
        expect(buildingHp(kind, level)).toBe(hp);
        if (level === 1) {
          expect(BUILDINGS[kind]).toMatchObject({ hp, cost, build: seconds, size: 3 });
          m.beginBuild(kind);
          expect(m.place(30, 30)).toBe(true);
        } else {
          expect(upgradeCost(kind, level - 1)).toBe(cost);
          expect(upgradeSeconds(kind, level - 1)).toBe(seconds);
          const b = makeBuilding(m.state.nextId++, kind, 30, 30, level - 1);
          m.state.buildings.push(b);
          m.upgrade(b.id);
          m.upgrade(b.id);
        }
        const b = m.state.buildings.at(-1)!;
        expect(m.state.elixir).toBe(0);
        expect(m.busy).toBe(1);
        expect(b.upgradeEnd! - b.upgradeStart!).toBe(seconds * 1000);
        const end = b.upgradeEnd!;
        const restored = new GameModel(JSON.parse(JSON.stringify(m.state)));
        const saved = restored.state.buildings.find((v) => v.id === b.id)!;
        expect(saved.upgradeEnd).toBe(end);
        restored.tick(end - 1);
        expect(saved.upgradeEnd).toBe(end);
        restored.tick(end);
        restored.tick(end + 1);
        expect(saved).toMatchObject({ level, hp, maxHp: hp, constructing: false });
        expect(saved.upgradeEnd).toBeUndefined();
        expect(restored.state.elixir).toBe(0);
        expect(restored.busy).toBe(0);
        expect(validateSave(restored.state)).toBe(true);
      });
    });

  it('enforces a single facility, matching construction and upgrade gates at all eight Town Hall tiers', () => {
    const counts = {
      barracks: [1, 1, 1, 1, 1, 1, 1, 1],
      laboratory: [0, 0, 1, 1, 1, 1, 1, 1],
      spellfactory: [0, 0, 0, 0, 1, 1, 1, 1],
    };
    const caps = {
      barracks: [1, 4, 5, 6, 7, 8, 9, 10],
      laboratory: [0, 0, 1, 2, 3, 4, 5, 6],
      spellfactory: [0, 0, 0, 0, 1, 2, 3, 3],
    };
    for (const kind of ['barracks', 'laboratory', 'spellfactory'] as const)
      for (let th = 1; th <= 8; th++) {
        const m = new GameModel();
        m.state.obstacles = [];
        m.townhall!.level = th;
        m.state.elixir = 5000000;
        m.state.buildings = m.state.buildings.filter((b) => b.kind !== kind);
        expect(maxCountFor(kind, th)).toBe(counts[kind][th - 1]);
        expect(maxLevelFor(kind, th)).toBe(caps[kind][th - 1]);
        m.beginBuild(kind);
        expect(m.placement).toBe(counts[kind][th - 1] ? kind : null);
        // A direct stale placement request must also enforce the construction gate.
        m.placement = kind;
        const before = m.state.elixir;
        expect(m.place(30, 30)).toBe(!!counts[kind][th - 1]);
        if (!counts[kind][th - 1]) {
          expect(m.state.elixir).toBe(before);
          continue;
        }
        const b = m.state.buildings.at(-1)!;
        m.tick(b.upgradeEnd!);
        m.beginBuild(kind);
        expect(m.placement).toBeNull();
        b.level = caps[kind][th - 1];
        const funds = m.state.elixir;
        m.upgrade(b.id);
        expect(b.upgradeEnd).toBeUndefined();
        expect(m.state.elixir).toBe(funds);
      }
  });

  it('uses completed factory housing without multiplying it for imported extra factories', () => {
    expect([0, 1, 2, 3, 4, 5].map(spellFactoryCapacity)).toEqual([0, 2, 4, 6, 8, 10]);
    expect(FACILITY_LEVELS.spellfactory.slice(3)).toEqual([
      { hp: 600, cost: 1200000, seconds: 172800, capacity: 8 },
      { hp: 720, cost: 2000000, seconds: 259200, capacity: 10 },
    ]);
    const old = developedSave();
    old.spells = { rage: 2, heal: 2, lightning: 0 };
    old.spellQueue = [{ kind: 'lightning', end: old.lastTick + 50000 }];
    old.buildings.push(makeBuilding(old.nextId++, 'spellfactory', 32, 30, 2));
    old.buildings.push(makeBuilding(old.nextId++, 'spellfactory', 36, 30, 5));
    const constructing = old.buildings.at(-1)!;
    constructing.constructing = true;
    constructing.upgradeStart = old.lastTick;
    constructing.upgradeEnd = old.lastTick + 1000000;
    const m = new GameModel(old);
    expect(m.spellCapacity).toBe(6);
    expect(m.spellHousing).toBe(9);
    expect(m.countOf('spellfactory')).toBe(3);
    m.brew('lightning');
    expect(m.state.spells).toEqual({ rage: 2, heal: 2, lightning: 1 });
    const loaded = new GameModel(JSON.parse(JSON.stringify(m.state)));
    expect(loaded.state.spells).toEqual(m.state.spells);
    loaded.startBattle(0);
    loaded.activeSpell = 'rage';
    expect(loaded.castSpell(1, 1)).toBe(true);
    loaded.finishBattle();
    loaded.returnHome();
    loaded.removeSpell('lightning');
    expect(loaded.spellHousing).toBe(6);
    loaded.brew('lightning');
    expect(loaded.state.spells.lightning).toBe(0);
    loaded.removeSpell('heal');
    loaded.brew('heal');
    expect(loaded.spellHousing).toBe(6);
    loaded.tick(constructing.upgradeEnd!);
    expect(loaded.spellCapacity).toBe(10);
    expect(validateSave(loaded.state)).toBe(true);
  });

  it('preserves legacy buildings, paid deadlines, positions and damage fractions', () => {
    const old = developedSave();
    old.buildings.push(makeBuilding(old.nextId++, 'barracks', 32, 30, 4));
    for (const kind of ['barracks', 'laboratory', 'spellfactory'] as const) {
      const b = old.buildings.find((b) => b.kind === kind)!;
      b.maxHp = 2000;
      b.hp = 500;
      b.upgradeStart = old.lastTick - 1000;
      b.upgradeEnd = old.lastTick + 600000;
    }
    const before = structuredClone(old);
    const m = new GameModel(old);
    expect(m.countOf('barracks')).toBe(2);
    expect(m.state.buildings.map(({ id, x, y }) => ({ id, x, y }))).toEqual(
      before.buildings.map(({ id, x, y }) => ({ id, x, y })),
    );
    for (const kind of ['barracks', 'laboratory', 'spellfactory'] as const) {
      const b = m.state.buildings.find((b) => b.kind === kind)!;
      expect(b.maxHp).toBe(buildingHp(kind, b.level));
      expect(b.hp).toBe(b.maxHp / 4);
      expect(b.upgradeEnd).toBe(before.lastTick + 600000);
    }
    m.tick(before.lastTick + 300000);
    expect(m.state.buildings.find((b) => b.kind === 'laboratory')!.level).toBe(1);
    const restored = new GameModel(JSON.parse(JSON.stringify(m.state)));
    restored.tick(before.lastTick + 600000);
    expect(restored.state.buildings.find((b) => b.kind === 'laboratory')!.level).toBe(2);
    expect(restored.state.elixir).toBe(before.elixir);
    expect(restored.state.army).toEqual(before.army);
    expect(restored.state.spells).toEqual(before.spells);
    expect(validateSave(restored.state)).toBe(true);
  });
});

describe('independent Laboratory construction and research', () => {
  for (const researchFirst of [true, false])
    it(`runs independent timers with ${researchFirst ? 'research' : 'building upgrade'} started first`, () => {
      const m = new GameModel(developedSave());
      const lab = m.laboratory!;
      lab.level = 2;
      m.state.elixir = 500000;
      if (researchFirst) m.researchTroop('archer');
      m.upgrade(lab.id);
      expect(lab.upgradeEnd! - lab.upgradeStart!).toBe(7200000);
      if (!researchFirst) m.researchTroop('archer');
      expect(m.state.research?.kind).toBe('archer');
      expect(m.state.elixir).toBe(430000);
      expect(m.busy).toBe(1);
      const researchEnd = m.state.research!.end;
      const labEnd = lab.upgradeEnd!;
      const loaded = new GameModel(JSON.parse(JSON.stringify(m.state)));
      loaded.tick(researchEnd - 1);
      expect(loaded.troopLevel('archer')).toBe(1);
      loaded.tick(researchEnd);
      expect(loaded.troopLevel('archer')).toBe(2);
      expect(loaded.laboratory!.level).toBe(2);
      expect(loaded.laboratory!.upgradeEnd).toBe(labEnd);
      loaded.researchTroop('wizard');
      expect(loaded.state.research).toBeUndefined();
      loaded.tick(labEnd);
      expect(loaded.laboratory!.level).toBe(3);
      loaded.researchTroop('wizard');
      expect(loaded.state.research?.kind).toBe('wizard');
      expect(loaded.state.elixir).toBe(310000);
      expect(validateSave(loaded.state)).toBe(true);
    });

  it('research uses no builder and gem completion of either timer leaves the other intact', () => {
    const m = new GameModel(developedSave());
    m.state.elixir = m.state.gold = 500000;
    m.upgrade(m.laboratory!.id);
    m.upgrade(m.state.buildings.find((b) => b.kind === 'cannon')!.id);
    expect(m.busy).toBe(m.builders);
    m.researchTroop('swordsman');
    expect(m.state.research?.kind).toBe('swordsman');
    const labEnd = m.laboratory!.upgradeEnd;
    m.finishResearch();
    expect(m.troopLevel('swordsman')).toBe(2);
    expect(m.laboratory!.upgradeEnd).toBe(labEnd);
    m.researchTroop('archer');
    const researchEnd = m.state.research!.end;
    m.finish(m.laboratory!.id);
    expect(m.laboratory!.level).toBe(2);
    expect(m.state.research!.end).toBe(researchEnd);
  });

  it('chooses the highest completed legacy lab, rejects new construction and guards battle edits', () => {
    const m = new GameModel(developedSave());
    const higher = makeBuilding(m.state.nextId++, 'laboratory', 32, 30, 3);
    higher.constructing = true;
    m.state.buildings.push(higher);
    m.researchTroop('wizard');
    expect(m.state.research).toBeUndefined();
    higher.constructing = false;
    higher.upgradeEnd = m.clock + 100000;
    m.researchTroop('wizard');
    expect(m.state.research?.kind).toBe('wizard');
    delete m.state.research;
    m.startBattle(0);
    const funds = m.state.elixir;
    m.researchTroop('swordsman');
    expect(m.state.research).toBeUndefined();
    expect(m.state.elixir).toBe(funds);
  });
});

it('replays existing version-16 facility health exactly while normalizing only the home village', () => {
  const save = initialSave();
  save.obstacles = [];
  save.spells = emptySpells();
  const m = new GameModel(save);
  const home = m.state.buildings.find((b) => b.kind === 'barracks')!;
  home.hp = home.maxHp = 1062.5; // The previous level-two prototype value.
  m.startBattle(0, true);
  m.activeTroop = 'archer';
  expect(m.deploy(1, 13)).toBe(true);
  for (let i = 0; i < 200; i++) m.step(0.05);
  m.finishBattle();
  const expected = structuredClone(m.battle!);
  const record = m.state.raidLog![0];
  expect(record.replay!.version).toBe(16);
  expect(REPLAY_VERSION).toBe(16);
  expect(validateReplay(record.replay)).toBe(true);
  expect(record.replay!.initial.buildings.find((b) => b.id === home.id)!.maxHp).toBe(1062.5);
  const loaded = new GameModel(JSON.parse(JSON.stringify(m.state)));
  expect(loaded.state.buildings.find((b) => b.id === home.id)!.maxHp).toBe(200);
  expect(loaded.startReplay(record.id)).toBe(true);
  for (let i = 0; i < 1000 && !loaded.replay!.complete; i++) loaded.step(0.05);
  expect(loaded.replay!.complete).toBe(true);
  expect(loaded.battle!.buildings).toEqual(expected.buildings);
  expect(loaded.battle!.units).toEqual(expected.units);
  expect(loaded.battle!.result).toEqual(expected.result);
});
