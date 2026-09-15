import { describe, expect, it } from 'vitest';
import { GameModel, makeBuilding, type SpellBook, type Unit } from '../src/game/model';
import { BUILDINGS, SPELL_KEYS, type SpellKind } from '../src/game/data';
import { requiredTownHall } from '../src/game/progression';
import { SPELL_UNLOCK } from '../src/game/army-unlocks';
import { validateSave } from '../src/game/save';
import { REPLAY_VERSION, validateReplay } from '../src/game/replay';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { stepSpellAuras } from '../src/game/spell-effects';
import { maxSpellLevelFor } from '../src/game/spell-progression';
import { defaultSpellLevels, emptyArmy } from '../src/game/army';
import { developedSave } from './fixtures/developed-village';

// Independent transcription from Supercell's immutable spells.csv and current wiki tables.
/** Enough elixir for the dearest research in the table below, with room to check change. */
const BUDGET = 20_000_000;
const reference = {
  lightning: { cost: [50000, 100000, 200000, 600000], hours: [2, 4, 6, 24], lab: [1, 2, 3, 6] },
  heal: { cost: [75000, 150000, 300000, 900000], hours: [3, 6, 12, 24], lab: [2, 4, 5, 6] },
  rage: { cost: [400000, 800000, 1000000, 2000000], hours: [6, 12, 24, 48], lab: [3, 4, 5, 6] },
  freeze: {
    cost: [1200000, 1700000, 3000000, 4200000],
    hours: [24, 36, 48, 60],
    lab: [7, 8, 8, 8],
  },
  // The Invisibility Spell stops at level 4, so it has three research steps, not four.
  invisibility: { cost: [5000000, 6000000, 7000000], hours: [72, 96, 120], lab: [9, 10, 11] },
};
function developed() {
  const m = new GameModel(developedSave());
  m.townhall!.level = 8;
  m.laboratory!.level = 6;
  // Research is gated on the Spell Factory that offers the spell; the Freeze Spell needs 4.
  for (const b of m.state.buildings) if (b.kind === 'spellfactory') b.level = 4;
  m.state.spellLevels = defaultSpellLevels();
  m.state.elixir = BUDGET;
  return m;
}
function arena(kind: SpellKind, level = 1, troop: Unit['kind'] = 'giant') {
  const m = developed();
  m.state.spellLevels![kind] = level;
  m.state.spells = Object.fromEntries(SPELL_KEYS.map((k) => [k, 2])) as SpellBook;
  m.startBattle(0, true);
  const b = m.battle!;
  b.started = true;
  b.buildings = [makeBuilding(9000, 'townhall', 10, 10)];
  b.buildings[0].hp = b.buildings[0].maxHp = 100000;
  b.remaining = emptyArmy();
  const u: Unit = {
    id: 9500,
    kind: troop,
    x: 9.9,
    y: 11.5,
    hp: 100,
    maxHp: 10000,
    cooldown: 0,
    target: 9000,
    path: [],
    pathAt: 0,
    attacking: false,
  };
  b.units = [u];
  m.activeSpell = kind;
  return { m, b, u };
}

describe('spell research', () => {
  it('rejects non-string imported research kinds without coercing them', () => {
    for (const kind of [null, 1, ['heal'], { toString: null }, { toString: {} }, '__proto__']) {
      const state = developed().state;
      state.research = { kind, end: state.lastTick + 600000 } as any;
      expect(validateSave(state)).toBe(false);
    }
  });

  for (const kind of SPELL_KEYS)
    // A spell with fewer levels has fewer research steps; the reference lists what it has.
    for (const level of [1, 2, 3, 4].filter((l) => l <= reference[kind].cost.length))
      it(`${kind} ${level} → ${level + 1} pays once, reloads and completes at the exact deadline`, () => {
        const m = developed(),
          expected = reference[kind];
        // A village must be able to hold the Spell Factory that offers the spell and the
        // Laboratory that researches it, so the Town Hall rises to whichever needs more.
        m.state.spellLevels![kind] = level;
        const factory = SPELL_UNLOCK[kind];
        m.townhall!.level = Math.max(
          8,
          requiredTownHall('laboratory', expected.lab[level - 1]),
          requiredTownHall('spellfactory', factory),
        );
        for (const b of m.state.buildings) if (b.kind === 'spellfactory') b.level = factory;
        m.laboratory!.level = Math.max(1, expected.lab[level - 1] - 1);
        if (expected.lab[level - 1] > 1) {
          m.research(kind);
          expect(m.state.research).toBeUndefined();
          expect(m.state.elixir).toBe(BUDGET);
        }
        m.laboratory!.level = expected.lab[level - 1];
        expect(m.researchCost(kind)).toBe(expected.cost[level - 1]);
        expect(m.researchSeconds(kind)).toBe(expected.hours[level - 1] * 3600);
        m.research(kind);
        const research = structuredClone(m.state.research!);
        expect(research).toEqual({ kind, end: m.clock + expected.hours[level - 1] * 3600000 });
        expect(m.state.elixir).toBe(BUDGET - expected.cost[level - 1]);
        m.researchTroop('swordsman');
        m.research(kind);
        expect(m.state.research).toEqual(research);
        expect(m.state.elixir).toBe(BUDGET - expected.cost[level - 1]);
        expect(validateSave(m.state)).toBe(true);
        const restored = new GameModel(JSON.parse(JSON.stringify(m.state)));
        restored.tick(research.end - 1);
        expect(restored.spellLevel(kind)).toBe(level);
        restored.tick(research.end);
        expect(restored.spellLevel(kind)).toBe(level + 1);
        expect(restored.state.research).toBeUndefined();
        const xp = restored.state.xp;
        restored.tick(research.end + 1);
        expect(restored.spellLevel(kind)).toBe(level + 1);
        expect(restored.state.xp).toBe(xp);
        expect(validateSave(restored.state)).toBe(true);
      });

  it('shares the troop research slot, permits laboratory upgrades, and uses completed facility levels', () => {
    const m = developed(),
      lab = m.laboratory!;
    lab.level = 3;
    m.upgrade(lab.id);
    const construction = lab.upgradeEnd;
    m.research('heal');
    expect(m.state.research?.kind).toBe('heal');
    m.finishResearch();
    expect(m.spellLevel('heal')).toBe(2);
    expect(lab.upgradeEnd).toBe(construction);
    m.research('heal');
    expect(m.state.research).toBeUndefined(); // Healing 3 requires the not-yet-completed Lab 4.
    m.tick(construction!);
    m.research('heal');
    expect(m.state.research?.kind).toBe('heal');
    m.finishResearch();
    m.researchTroop('swordsman');
    const troopResearch = structuredClone(m.state.research);
    m.research('rage');
    expect(m.state.research).toEqual(troopResearch);
  });

  it('requires unlocked spells, funds and a free research slot, but no builder', () => {
    const m = developed();
    const factory = m.state.buildings.find((b) => b.kind === 'spellfactory')!;
    factory.level = 1;
    factory.upgradeEnd = m.clock + 1000;
    m.research('heal');
    expect(m.state.research).toBeUndefined();
    m.tick(factory.upgradeEnd);
    m.state.elixir = 74999;
    m.research('heal');
    expect(m.state.research).toBeUndefined();
    m.state.elixir++;
    for (const building of m.state.buildings
      .filter((b) => b.kind !== 'builder')
      .slice(0, m.builders))
      building.upgradeEnd = m.clock + 100000;
    expect(m.busy).toBe(m.builders);
    m.research('heal');
    expect(m.state.research?.kind).toBe('heal');
    expect(m.state.elixir).toBe(0);
  });

  it('preserves legacy troops and paid research, rejects malformed spell levels and max-level research', () => {
    const original = developedSave();
    original.research = { kind: 'swordsman', end: original.lastTick + 600000 };
    const loaded = new GameModel(JSON.parse(JSON.stringify(original)));
    expect(loaded.state.spellLevels).toBeUndefined();
    expect(loaded.spellLevel('lightning')).toBe(1);
    expect(loaded.state.research).toEqual(original.research);
    expect(loaded.state.spells).toEqual(original.spells);
    // A save written before a spell existed has no field for it. Loading gains every absent
    // spell at zero and keeps every count the village already held.
    const ORIGINAL_THREE = ['rage', 'heal', 'lightning'] as const;
    const legacy = JSON.parse(JSON.stringify(original)) as typeof original;
    legacy.spells = Object.fromEntries(
      ORIGINAL_THREE.map((k) => [k, legacy.spells[k]]),
    ) as typeof legacy.spells;
    const migrated = new GameModel(legacy).state.spells;
    expect(Object.keys(migrated).sort()).toEqual([...SPELL_KEYS].sort());
    for (const kind of SPELL_KEYS)
      expect([kind, migrated[kind]]).toEqual([
        kind,
        ORIGINAL_THREE.includes(kind as (typeof ORIGINAL_THREE)[number]) ? legacy.spells[kind] : 0,
      ]);
    const good = developed().state;
    // The Healing spell now runs to its own original ceiling, so 6 is a real level.
    for (const invalid of [0, maxSpellLevelFor('heal') + 1, -1, 1.5, NaN, '2', null]) {
      const bad = structuredClone(good);
      (bad.spellLevels as any).heal = invalid;
      expect(validateSave(bad)).toBe(false);
    }
    const partial = structuredClone(good);
    delete (partial.spellLevels as any).rage;
    expect(validateSave(partial)).toBe(false);
    good.spellLevels!.rage = maxSpellLevelFor('rage');
    good.research = { kind: 'rage', end: good.lastTick + 600000 };
    expect(validateSave(good)).toBe(false);
    delete good.research;
    const maxed = new GameModel(good);
    const funds = maxed.state.elixir;
    maxed.research('rage');
    expect(maxed.state.research).toBeUndefined();
    expect(maxed.state.elixir).toBe(funds);
  });
});

describe('native spell effects', () => {
  it.each([1, 2, 3, 4, 5])(
    'Lightning %s uses researched damage, footprint intersections, immunities and a single cast',
    (level) => {
      const { m, b } = arena('lightning', level);
      b.buildings = [
        'cannon',
        'goldmine',
        'wall',
        'townhall',
        'goldstorage',
        'elixirstorage',
        'darkstorage',
        'bomb',
      ].map((kind, i) => makeBuilding(9000 + i, kind as any, 10, 10, 1));
      for (const target of b.buildings) target.hp = target.maxHp = 1000;
      const far = makeBuilding(9100, 'cannon', 15, 10);
      b.buildings.push(far);
      // Two tiles from the nearest footprint edge, outside the old center-only radius.
      expect(m.castSpell(8, 10.5)).toBe(true);
      expect(b.buildings.slice(0, 3).map((v) => v.maxHp - v.hp)).toEqual(
        Array(3).fill([150, 180, 210, 240, 270][level - 1]),
      );
      expect(b.buildings.slice(3).every((v) => v.hp === v.maxHp)).toBe(true);
      expect(b.spells.lightning).toBe(1);
      m.activeSpell = 'lightning';
      expect(m.castSpell(7.999, 10.5)).toBe(true);
      expect(b.buildings[0].maxHp - b.buildings[0].hp).toBe([150, 180, 210, 240, 270][level - 1]);
      m.activeSpell = 'lightning';
      expect(m.castSpell(8, 10.5)).toBe(false);
    },
  );

  it('Lightning interrupts surviving defenses, resets their target and preserves already launched shots', () => {
    const { m, b, u } = arena('lightning');
    const cannon = makeBuilding(9001, 'cannon', 12, 10, 4);
    b.buildings.push(cannon);
    u.springUntil = 100;
    m.step(0.05);
    const shot = b.projectiles![0];
    expect(b.defenseTargets[cannon.id]).toBe(u.id);
    expect(m.castSpell(13.5, 11.5)).toBe(true);
    expect(b.defenseTargets[cannon.id]).toBeUndefined();
    expect(b.projectiles).toContain(shot);
    expect(cannon.cooldown).toBe(BUILDINGS.cannon.rate);
    m.step(0.099);
    expect(cannon.cooldown).toBe(BUILDINGS.cannon.rate);
    m.step(0.001);
    expect(cannon.cooldown).toBeCloseTo(BUILDINGS.cannon.rate!);
    const other = { ...u, id: 9600, x: 13, y: 9.5, path: [] };
    b.units.push(other);
    m.step(BUILDINGS.cannon.rate!);
    expect(b.defenseTargets[cannon.id]).toBe(other.id);
  });

  it.each([1, 2, 3, 4, 5])(
    'Healing %s delivers 41 pulses, heals heroes at 55%%, and never revives',
    (level) => {
      const { m, b, u } = arena('heal', level);
      u.springUntil = 100;
      const hero = { ...u, id: 9600, hero: 'king' as const, x: u.x + 5, path: [] };
      const outside = { ...u, id: 9700, x: u.x + 5.001, path: [] };
      const dead = { ...u, id: 9800, hp: 0, path: [] };
      b.units.push(hero, outside, dead);
      expect(m.castSpell(u.x, u.y)).toBe(true);
      expect(u.hp).toBe(100 + [15, 20, 25, 30, 35][level - 1]);
      b.elapsed = 0.299;
      stepSpellAuras(b);
      expect(b.auras[0].pulses).toBe(1);
      b.elapsed = 0.3;
      stepSpellAuras(b);
      expect(b.auras[0].pulses).toBe(2);
      b.elapsed = 12.3;
      stepSpellAuras(b);
      expect(u.hp).toBe(100 + [615, 820, 1025, 1230, 1435][level - 1]);
      expect(hero.hp).toBeCloseTo(100 + [615, 820, 1025, 1230, 1435][level - 1] * 0.55);
      expect(outside.hp).toBe(100);
      expect(dead.hp).toBe(0);
      expect(b.auras).toHaveLength(0);
      stepSpellAuras(b);
      expect(u.hp).toBe(100 + [615, 820, 1025, 1230, 1435][level - 1]);
    },
  );

  it('overlapping Healing spells stack and clamp at full health without banking missed pulses', () => {
    const { m, b, u } = arena('heal');
    m.castSpell(u.x, u.y);
    m.activeSpell = 'heal';
    m.castSpell(u.x, u.y);
    expect(u.hp).toBe(130);
    u.hp = u.maxHp - 1;
    b.elapsed = 0.3;
    stepSpellAuras(b);
    expect(u.hp).toBe(u.maxHp);
    u.hp -= 100;
    u.x += 6;
    b.elapsed = 3;
    stepSpellAuras(b);
    expect(u.hp).toBe(u.maxHp - 100);
    u.x -= 6;
    b.elapsed = 3.3;
    stepSpellAuras(b);
    expect(u.hp).toBe(u.maxHp - 70);
  });

  it.each([1, 2, 3, 4, 5])(
    'Rage %s adds damage and movement without changing cadence or stacking',
    (level) => {
      const { m, b, u } = arena('rage', level);
      m.castSpell(u.x, u.y);
      m.activeSpell = 'rage';
      m.castSpell(u.x, u.y);
      m.step(0.05);
      expect(100000 - b.buildings[0].hp).toBeCloseTo(
        24 * (1 + [1.3, 1.4, 1.5, 1.6, 1.7][level - 1]),
      );
      expect(u.cooldown).toBe(2);
      const moving = arena('rage', level, 'balloon');
      moving.u.x = 5;
      moving.u.y = 12;
      moving.m.castSpell(5, 12);
      moving.m.step(0.1);
      expect(Math.hypot(moving.u.x - 5, moving.u.y - 12)).toBeCloseTo(
        (1.25 + [20, 22, 24, 26, 28][level - 1] / 8) * 0.1,
      );
    },
  );

  it('Rage pulses linger for one second after leaving and expire without refreshing outside the ring', () => {
    const { m, b, u } = arena('rage');
    m.castSpell(u.x, u.y);
    expect(u.spellRageUntil).toBe(1);
    u.x += 6;
    b.elapsed = 0.99;
    stepSpellAuras(b);
    expect(u.spellRageUntil).toBe(1);
    expect(u.spellRageUntil! > b.elapsed).toBe(true);
    b.elapsed = 1;
    stepSpellAuras(b);
    expect(u.spellRageUntil! > b.elapsed).toBe(false);
    u.x -= 6;
    b.elapsed = 17.7;
    stepSpellAuras(b);
    expect(b.auras[0].pulses).toBe(60);
    expect(u.spellRageUntil).toBeCloseTo(18.7);
    b.elapsed = 18;
    stepSpellAuras(b);
    expect(b.auras).toHaveLength(0);
    expect(u.spellRageUntil! > b.elapsed).toBe(true);
  });

  it('Rage grants half boosts to heroes and uses the stronger spell or ability without adding them', () => {
    for (const [level, ability, damage] of [
      [1, false, 235.62],
      [1, true, 314.16],
      [5, true, 314.16],
    ] as const) {
      const { m, b, u } = arena('rage', level);
      u.hero = 'king';
      b.hero = {
        level: 1,
        townhall: 7,
        unitId: u.id,
        abilityUsed: true,
        rageUntil: ability ? 10 : 0,
      };
      m.castSpell(u.x, u.y);
      m.step(0.05);
      expect(100000 - b.buildings[0].hp).toBeCloseTo(damage);
      expect(u.cooldown).toBe(1.2);
      const funds = m.state.elixir;
      m.research('heal');
      expect(m.state.research).toBeUndefined();
      expect(m.state.elixir).toBe(funds);
    }
  });

  it('spell levels are frozen in battle, exported and replayed independently of home research', () => {
    const m = developed();
    m.state.spellLevels = { ...defaultSpellLevels(), lightning: 4, heal: 3, rage: 2 };
    m.state.spells = Object.fromEntries(SPELL_KEYS.map((k) => [k, 1])) as SpellBook;
    m.startBattle(0, true);
    const b = m.battle!;
    m.deploy(1, 13);
    m.activeSpell = 'rage';
    m.castSpell(1, 13);
    m.activeSpell = 'heal';
    m.castSpell(1, 13);
    const cannon = b.buildings.find((v) => v.kind === 'cannon')!;
    m.activeSpell = 'lightning';
    m.castSpell(cannon.x + 1.5, cannon.y + 1.5);
    m.state.research = { kind: 'lightning', end: m.clock + 1000 };
    m.tick(m.clock + 1000);
    expect(m.state.spellLevels.lightning).toBe(5);
    expect(m.spellLevel('lightning')).toBe(4);
    for (let i = 0; i < 300; i++) m.step(0.05);
    m.finishBattle();
    const expected = structuredClone(b),
      record = m.state.raidLog![0];
    expect(record.replay!.version).toBe(REPLAY_VERSION);
    const data = parseReplayFile(JSON.stringify(makeReplayFile(record.replay!)));
    expect(data.initial.spellLevels).toEqual({
      ...defaultSpellLevels(),
      lightning: 4,
      heal: 3,
      rage: 2,
    });
    const viewer = new GameModel();
    viewer.state.research = { kind: 'heal', end: viewer.clock + 1000 };
    expect(viewer.openReplay(data)).toBe(true);
    viewer.tick(viewer.clock + 1000);
    expect(viewer.state.spellLevels!.heal).toBe(2);
    expect(viewer.spellLevel('heal')).toBe(3);
    for (let i = 0; i < 1000 && !viewer.replay!.complete; i++) viewer.step(0.05);
    expect(viewer.battle!.buildings).toEqual(
      expected.buildings.map((building) => ({ ...building, stored: 0 })),
    );
    expect(viewer.battle!.units).toEqual(expected.units);
    expect(viewer.battle!.auras).toEqual(expected.auras);
    expect(viewer.battle!.result).toEqual(expected.result);
    viewer.seekReplay(5);
    viewer.seekReplay(15);
    while (!viewer.replay!.complete) viewer.step(0.05);
    expect(viewer.battle!.units).toEqual(expected.units);
    const legacy = structuredClone(data);
    legacy.version = 16;
    delete legacy.initial.spellLevels;
    expect(validateReplay(legacy)).toBe(true);
    expect(new GameModel().openReplay(legacy)).toBe(false);
    const malformed = structuredClone(data);
    delete malformed.initial.spellLevels;
    expect(validateReplay(malformed)).toBe(false);
    // Rage reaches seven, and a version-46 recording may hold none of the new levels.
    data.initial.spellLevels!.rage = maxSpellLevelFor('rage');
    expect(validateReplay(data)).toBe(true);
    expect(validateReplay({ ...data, version: 46 })).toBe(false);
    data.initial.spellLevels!.rage = maxSpellLevelFor('rage') + 1;
    expect(validateReplay(data)).toBe(false);
  });
});
