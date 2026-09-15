import { describe, expect, it } from 'vitest';
import { GameModel, makeBuilding, type Unit, type FX } from '../src/game/model';
import { emptyArmy, emptySpells } from '../src/game/army';
import {
  LATE_TROOP_KEYS,
  maxTroopLevel,
  TROOP_KEYS,
  troopStatsAt,
  researchLevelForLab,
  type TroopKind,
} from '../src/game/data';
import { prepareHealerTargets } from '../src/game/healing';
import { migrateSave, validateSave } from '../src/game/save';
import { REPLAY_VERSION, validateReplay } from '../src/game/replay';
import { developedSave } from './fixtures/developed-village';

function unit(kind: TroopKind, id: number, x = 10, y = 11): Unit {
  const d = troopStatsAt(kind, 1);
  return {
    id,
    kind,
    x,
    y,
    hp: d.hp,
    maxHp: d.hp,
    path: [],
    pathAt: 100,
    target: 9000,
    cooldown: 100,
    attacking: false,
  };
}
function arena() {
  const m = new GameModel();
  m.startBattle(0, true);
  const b = m.battle!;
  b.started = true;
  b.buildings = [makeBuilding(9000, 'townhall', 10, 10)];
  b.remaining = { ...emptyArmy(), swordsman: 1 };
  b.spells = emptySpells();
  const patient = unit('giant', 100);
  patient.hp = 100;
  const healer = unit('healer', 101, 6, 11);
  healer.cooldown = 0;
  b.units = [patient, healer];
  const fx: FX[] = [];
  m.onEffect = (e) => fx.push(e);
  return { m, b, patient, healer, fx };
}

describe('TH6–8 Barracks progression', () => {
  it('keeps large training batches atomic and restores a complete new-roster preset', () => {
    const m = new GameModel(developedSave());
    m.townhall!.level = 8;
    m.state.buildings.find((b) => b.kind === 'barracks')!.level = 10;
    m.clearArmy();
    m.train('pekka', 5);
    m.train('healer', 4);
    expect(m.armySize).toBe(181);
    m.train('dragon');
    m.train('pekka', 5);
    expect(m.armySize).toBe(181);
    m.saveArmyPreset(0);
    const army = { ...m.state.army };
    m.clearArmy();
    m.loadArmyPreset(0);
    expect(m.state.army).toEqual(army);
    expect(validateSave(m.state)).toBe(true);
  });
  const reference = {
    healer: {
      hp: [500, 700, 900],
      hit: [0, 0, 0],
      heal: [36, 48, 60],
      space: 14,
      rate: 0.7,
      range: 4.5,
      barracks: 8,
      costs: [450000, 900000],
      hours: [12, 24],
      labs: [5, 6],
    },
    dragon: {
      hp: [1900, 2100, 2300],
      hit: [175, 200, 225],
      space: 20,
      rate: 1.25,
      range: 2.5,
      barracks: 9,
      costs: [1000000, 2000000],
      hours: [18, 36],
      labs: [5, 6],
    },
    pekka: {
      hp: [3000, 3500, 4000],
      hit: [468, 522, 576],
      space: 25,
      rate: 1.8,
      range: 0.8,
      barracks: 10,
      costs: [600000, 1300000],
      hours: [12, 18],
      labs: [6, 6],
    },
  };
  for (const kind of LATE_TROOP_KEYS) {
    it(`${kind} has its first three native levels, unlock and paid research deadlines`, () => {
      const m = new GameModel(developedSave());
      m.townhall!.level = 8;
      m.state.troopLevels = Object.fromEntries(
        TROOP_KEYS.map((k) => [k, 1]),
      ) as typeof m.state.army;
      const r = reference[kind],
        barracks = m.state.buildings.find((b) => b.kind === 'barracks')!;
      const lab = m.state.buildings.find((b) => b.kind === 'laboratory')!;
      m.clearArmy();
      barracks.level = r.barracks - 1;
      m.train(kind);
      expect(m.armySize).toBe(0);
      barracks.level++;
      m.train(kind);
      expect(m.armySize).toBe(r.space);
      for (let level = 1; level <= 3; level++) {
        m.state.troopLevels![kind] = level;
        const d = m.troopStats(kind);
        expect(d).toMatchObject({
          hp: r.hp[level - 1],
          damage: r.hit[level - 1],
          speed: 2,
          range: r.range,
          rate: r.rate,
          space: r.space,
        });
        if (kind === 'healer')
          expect(d.heal! / d.rate).toBeCloseTo(reference.healer.heal[level - 1]);
        if (level === 3) {
          // Level three is the last a Laboratory 6 reaches; the roster runs on above it.
          expect(researchLevelForLab(kind, 6)).toBe(3);
          m.state.troopLevels![kind] = maxTroopLevel(kind);
          expect(m.troopStats(kind, 99)).toEqual(m.troopStats(kind));
          m.state.troopLevels![kind] = level;
          m.researchTroop(kind);
          expect(m.state.research).toBeUndefined();
          continue;
        }
        m.state.elixir = 2500000;
        lab.level = r.labs[level - 1] - 1;
        m.researchTroop(kind);
        expect(m.state.research).toBeUndefined();
        lab.level++;
        m.researchTroop(kind);
        const paid = 2500000 - r.costs[level - 1],
          deadline = m.state.research!.end;
        expect(m.state.elixir).toBe(paid);
        expect(deadline - m.clock).toBe(r.hours[level - 1] * 3600000);
        expect(validateSave(m.state)).toBe(true);
        const restored = new GameModel(structuredClone(m.state));
        restored.tick(deadline);
        expect(restored.troopLevel(kind)).toBe(level + 1);
        expect(restored.state.elixir).toBe(paid);
        m.state.research = undefined;
      }
    });
  }
});

describe('Healer support', () => {
  it.each(['healer', 'dragon'] as const)(
    '%s draws Air Defense fire while Cannons ignore it',
    (kind) => {
      const { m, b } = arena();
      b.units = [unit(kind, 120, 7, 11)];
      b.buildings.push(makeBuilding(9001, 'cannon', 3, 10), makeBuilding(9002, 'airdefense', 4, 7));
      m.step(0.05);
      const shots = b.projectiles!;
      expect(shots).toHaveLength(1);
      expect(shots[0]).toMatchObject({
        weapon: 'rocket',
        targetId: 120,
        toAir: true,
        sourceId: 9002,
      });
    },
  );
  it('heals ground allies at impact, caps HP, and never heals air, buildings or defeated troops', () => {
    const { m, b, patient, healer, fx } = arena();
    const capped = { ...unit('pekka', 102), hp: 2999 };
    const air = { ...unit('dragon', 103), hp: 100 };
    const dead = { ...unit('giant', 104), hp: 0 };
    b.units.push(capped, air, dead);
    m.step(0.05);
    expect(healer.healTarget).toBe(patient.id);
    expect(patient.hp).toBe(100);
    expect(b.projectiles![0].impact - b.elapsed).toBeCloseTo(4 / 12);
    m.step(0.34);
    expect(patient.hp).toBeCloseTo(125.2);
    expect(capped.hp).toBe(3000);
    expect(air.hp).toBe(100);
    expect(dead.hp).toBe(0);
    expect(healer.hp).toBe(healer.maxHp);
    expect(b.buildings[0].hp).toBe(b.buildings[0].maxHp);
    expect(fx.filter((e) => e.type === 'impact')).toHaveLength(1);
  });

  it('a pulse lands at its original point after its source dies or target moves', () => {
    const { m, b, patient, healer } = arena();
    const neighbor = { ...unit('giant', 102), hp: 100 };
    b.units.push(neighbor);
    m.step(0.05);
    patient.x = 20;
    healer.hp = 0;
    m.step(0.34);
    expect(patient.hp).toBe(100);
    expect(neighbor.hp).toBeCloseTo(125.2);
  });

  it('requires a meaningful ground group, keeps its patient, and reacquires after death', () => {
    const { b, patient, healer } = arena();
    b.units = [healer, unit('swordsman', 104), unit('archer', 105), unit('dragon', 106)];
    prepareHealerTargets(b);
    expect(healer.healTarget).toBeUndefined();
    b.units.push(patient);
    prepareHealerTargets(b);
    expect(healer.healTarget).toBe(patient.id);
    const replacement = { ...unit('pekka', 107, 6, 11), hp: 100 };
    b.units.push(replacement);
    patient.hp = patient.maxHp;
    prepareHealerTargets(b);
    expect(healer.healTarget).toBe(patient.id);
    patient.hp = 0;
    prepareHealerTargets(b);
    expect(healer.healTarget).toBe(replacement.id);
  });

  it('stops at native range and follows a moving patient without pathfinding through walls', () => {
    const { m, b, patient, healer } = arena();
    healer.x = 0;
    b.buildings.push(makeBuilding(9001, 'wall', 4, 11));
    m.step(0.25);
    expect(healer.x).toBe(0.5);
    expect(b.projectiles).toHaveLength(0);
    healer.x = patient.x - 4.6;
    m.step(0.25);
    expect(patient.x - healer.x).toBeCloseTo(4.5);
    m.step(0.05);
    expect(b.projectiles![0].weapon).toBe('healing');
  });

  it('applies all eight marginal stack factors, with no healing from additional sources', () => {
    const { m, b, patient, healer } = arena();
    b.units = [
      patient,
      ...Array.from({ length: 9 }, (_, i) => ({ ...healer, id: 101 + i, path: [] })),
    ];
    m.step(0.05);
    expect(b.projectiles).toHaveLength(9);
    m.step(0.34);
    // 100 + 100 + 90 + 90 + 70 + 40 + 10 + 0 + 0 = 500%.
    expect(patient.hp).toBeCloseTo(100 + 25.2 * 5);
  });

  it('Rage boosts the casting Healer and heroes receive 55% without a second patient Rage bonus', () => {
    const { m, patient, healer } = arena();
    patient.hero = true;
    patient.spellRageUntil = 5;
    healer.spellRageUntil = 5;
    m.step(0.05);
    m.step(0.34);
    expect(patient.hp).toBeCloseTo(100 + 25.2 * 2.3 * 0.55);
  });

  it.each(['none', 'troop', 'lightning'] as const)(
    'ends with only support left unless %s can still attack',
    (reserve) => {
      const { m, b, healer } = arena();
      b.units = [healer];
      b.remaining = { ...emptyArmy(), healer: 1, swordsman: reserve === 'troop' ? 1 : 0 };
      b.spells = {
        rage: 1,
        heal: 1,
        lightning: reserve === 'lightning' ? 1 : 0,
        freeze: 0,
        invisibility: 0,
        jump: 0,
        clone: 0,
        recall: 0,
        revive: 0,
      };
      m.step(0.05);
      expect(b.finished).toBe(reserve === 'none');
    },
  );
});

describe('Dragon and P.E.K.K.A attacks', () => {
  it('Dragon breath is immediate and splashes only nearby footprints without damaging traps', () => {
    const { m, b, fx } = arena();
    const dragon = { ...unit('dragon', 110, 8, 10.1), cooldown: 0 };
    const near = makeBuilding(9001, 'builder', 10, 8);
    const far = makeBuilding(9002, 'builder', 10, 13);
    const trap = makeBuilding(9003, 'airbomb', 10, 10);
    b.buildings.push(near, far, trap);
    b.units = [dragon];
    m.step(0.05);
    expect(b.buildings[0].hp).toBe(b.buildings[0].maxHp - 175);
    expect(near.hp).toBe(near.maxHp - 175);
    expect(far.hp).toBe(far.maxHp);
    expect(trap.hp).toBe(trap.maxHp);
    expect(b.projectiles).toHaveLength(0);
    expect(fx.filter((e) => e.type === 'breath')).toHaveLength(1);
    m.step(0.5);
    expect(fx.filter((e) => e.type === 'breath')).toHaveLength(1);
  });

  it('P.E.K.K.A strikes a blocking wall with ordinary heavy melee damage and the 1.8s cooldown', () => {
    const { m, b } = arena();
    const wall = makeBuilding(9001, 'wall', 6, 11, 8);
    const pekka = { ...unit('pekka', 110, 5.5, 11.5), cooldown: 0, path: [{ x: 6.5, y: 11.5 }] };
    b.buildings.push(wall);
    b.units = [pekka];
    m.step(0.05);
    expect(wall.hp).toBe(wall.maxHp - 468);
    expect(pekka.cooldown).toBe(1.8);
    expect(b.projectiles).toHaveLength(0);
    m.step(0.5);
    expect(wall.hp).toBe(wall.maxHp - 468);
  });
});

describe('roster save and replay compatibility', () => {
  it.each([1, 2, 3])(
    'adds the roster while migrating an actual seven-key format-%s village',
    (version) => {
      const save = JSON.parse(JSON.stringify(new GameModel().state));
      save.version = version;
      save.buildings = [
        makeBuilding(1, 'townhall', 2, 2),
        makeBuilding(2, 'barracks', 8, 2),
        makeBuilding(3, 'laboratory', 14, 2),
        makeBuilding(4, 'builder', 20, 2),
        makeBuilding(5, 'camp', 2, 8),
      ];
      save.nextId = 6;
      save.obstacles = [];
      delete save.obstacleGrowth;
      save.troopLevels = Object.fromEntries(TROOP_KEYS.map((k) => [k, 1]));
      save.lastArmy = { ...save.army };
      save.research = { kind: 'wizard', end: save.lastTick + 600000 };
      for (const kind of LATE_TROOP_KEYS)
        for (const record of [save.army, save.lastArmy, save.troopLevels]) delete record[kind];
      const migrated = migrateSave(save) as typeof save;
      expect(validateSave(migrated)).toBe(true);
      expect(migrated.version).toBe(4);
      expect(migrated.army.swordsman).toBe(save.army.swordsman);
      expect(migrated.research).toEqual(save.research);
      expect(migrated.elixir).toBe(save.elixir);
      for (const kind of LATE_TROOP_KEYS) {
        expect(migrated.army[kind]).toBe(0);
        expect(migrated.lastArmy[kind]).toBe(0);
        expect(migrated.troopLevels[kind]).toBe(1);
      }
    },
  );

  it.each(LATE_TROOP_KEYS)(
    'rejects %s levels above its own ceiling, and new levels in old recordings',
    (kind) => {
      const m = new GameModel();
      m.state.troopLevels = Object.fromEntries(
        TROOP_KEYS.map((k) => [k, 1]),
      ) as typeof m.state.army;
      m.startBattle(0, true);
      m.finishBattle();
      const replay = structuredClone(m.state.raidLog![0].replay!);
      // Four is a real level now; only a version-46 recording still refuses it.
      replay.initial.troopLevels[kind] = 4;
      expect(validateReplay(replay)).toBe(true);
      expect(validateReplay({ ...replay, version: 46 })).toBe(false);
      replay.initial.troopLevels[kind] = maxTroopLevel(kind) + 1;
      expect(validateReplay(replay)).toBe(false);
      m.state.troopLevels[kind] = maxTroopLevel(kind) + 1;
      expect(validateSave(migrateSave(m.state))).toBe(false);
    },
  );
  it('extends old version-four armies, presets, research and logs without mutating legacy recordings', () => {
    const m = new GameModel(developedSave());
    m.saveArmyPreset(0);
    m.startBattle(0, true);
    m.finishBattle();
    const save = JSON.parse(JSON.stringify(m.state));
    save.lastArmy = { ...save.army };
    save.troopLevels = Object.fromEntries(Object.keys(save.army).map((k) => [k, 1]));
    save.research = { kind: 'wizard', end: m.clock + 100000 };
    const replay = save.raidLog[0].replay;
    replay.version = 17;
    for (const kind of LATE_TROOP_KEYS) {
      for (const army of [
        save.army,
        save.lastArmy,
        save.troopLevels,
        save.armyPresets[0].army,
        save.raidLog[0].deployed,
        replay.initial.army,
        replay.initial.troopLevels,
      ])
        delete army[kind];
    }
    const before = JSON.stringify(save),
      recording = JSON.stringify(replay);
    const migrated = migrateSave(save) as typeof m.state;
    expect(validateSave(migrated)).toBe(true);
    expect(JSON.stringify(save)).toBe(before);
    expect(JSON.stringify(migrated.raidLog![0].replay)).toBe(recording);
    expect(validateReplay(replay)).toBe(true);
    expect(migrated.research).toEqual(save.research);
    expect(migrated.elixir).toBe(save.elixir);
    for (const kind of LATE_TROOP_KEYS) {
      expect(migrated.army[kind]).toBe(0);
      expect(migrated.lastArmy![kind]).toBe(0);
      expect(migrated.troopLevels![kind]).toBe(1);
      expect(migrated.armyPresets![0]!.army[kind]).toBe(0);
      expect(migrated.raidLog![0].deployed[kind]).toBe(0);
    }
  });

  it.each([null, -1, '2', 1.5, NaN])(
    'does not silently repair a malformed new troop count: %s',
    (value) => {
      const save = developedSave();
      (save.army as Record<string, unknown>).healer = value;
      expect(validateSave(migrateSave(save))).toBe(false);
    },
  );

  it('records and replays all three troops with healing and direct breath deterministically', () => {
    const m = new GameModel();
    m.state.buildings = [
      makeBuilding(1, 'townhall', 10, 10),
      makeBuilding(2, 'cannon', 12, 16),
      makeBuilding(3, 'builder', 30, 30),
    ];
    m.state.obstacles = [];
    m.state.nextId = 4;
    m.state.army = { ...emptyArmy(), pekka: 1, healer: 1, dragon: 1 };
    m.startBattle(0, true);
    for (const kind of ['pekka', 'healer', 'dragon'] as const) {
      m.activeTroop = kind;
      expect(m.deploy(6, 11)).toBe(true);
    }
    for (let i = 0; i < 400; i++) m.step(0.05);
    m.finishBattle();
    const combat = () =>
      JSON.stringify({
        units: m.battle!.units,
        buildings: m.battle!.buildings,
        result: m.battle!.result,
        elapsed: m.battle!.elapsed,
      });
    const expected = combat(),
      record = m.state.raidLog![0];
    expect(record.replay!.version).toBe(REPLAY_VERSION);
    expect(validateReplay(record.replay)).toBe(true);
    expect(validateSave(m.state)).toBe(true);
    m.returnHome();
    expect(m.startReplay(record.id)).toBe(true);
    for (let i = 0; i < 1000 && !m.replay!.complete; i++) m.step(0.05);
    expect(m.replay!.complete).toBe(true);
    expect(combat()).toBe(expected);
  });
});
