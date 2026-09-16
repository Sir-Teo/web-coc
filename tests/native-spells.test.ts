import { describe, expect, it } from 'vitest';
import {
  TROOPS,
  SPELL_KEYS,
  SPELLS,
  TROOP_KEYS,
  maxTroopLevel,
  type BuildingKind,
  type SpellKind,
  type TroopKind,
} from '../src/game/data';
import { GameModel, makeBuilding, type Building } from '../src/game/model';
import { emptyArmy, emptySpells } from '../src/game/army';
import { nativeRow, num, seconds } from '../src/game/native-data';
import { SPELL_SOURCE, maxSpellLevel, spellFactory } from '../src/game/spell-progression';
import { SPELL_UNLOCK } from '../src/game/army-unlocks';
import { validateReplay } from '../src/game/replay';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { validateSave } from '../src/game/save';
import { hurtUnit, unitEffects } from '../src/game/native-status';

type Placement = [BuildingKind, number, number, number?];
function arena(
  layout: Placement[],
  army: Partial<Record<TroopKind, number>>,
  spells: Partial<Record<SpellKind, number>>,
  spellLevel?: number,
) {
  const m = new GameModel();
  m.state.obstacles = [];
  m.state.buildings = [
    makeBuilding(1, 'townhall', 38, 38, 12),
    ...layout.map(([kind, x, y, level], i) => makeBuilding(10 + i, kind, x, y, level ?? 1)),
  ];
  m.state.nextId = 5000;
  m.state.army = { ...emptyArmy(), ...army };
  m.state.spells = { ...emptySpells(), ...spells };
  m.state.troopLevels = Object.fromEntries(TROOP_KEYS.map((k) => [k, 1])) as Record<
    TroopKind,
    number
  >;
  m.state.spellLevels = Object.fromEntries(
    SPELL_KEYS.map((k) => [k, spellLevel ?? maxSpellLevel(k)]),
  ) as Record<SpellKind, number>;
  m.startBattle(0, true);
  return m;
}
const run = (m: GameModel, secondsToRun: number, step = 0.05) => {
  for (let t = 0; t < secondsToRun - 1e-9 && !m.battle!.finished; t += step) m.step(step);
};
const building = (m: GameModel, id: number) => m.battle!.buildings.find((b) => b.id === id)!;
const firstHit = (kind: SpellKind, level: number) => {
  const row = nativeRow('spells', SPELL_SOURCE[kind], level);
  return seconds(row, 'DeployTimeMS') + seconds(row, 'ChargingTimeMS') + seconds(row, 'HitTimeMS');
};
function cast(m: GameModel, kind: SpellKind, x: number, y: number) {
  m.activeSpell = kind;
  expect(m.castSpell(x, y), `${kind} cast`).toBe(true);
}

describe('complete spell roster', () => {
  it('Rage boosts ordinary attackers while respecting siege immunity', () => {
    const m = arena([], { wallwrecker: 1, swordsman: 1 }, { rage: 1 });
    for (const kind of ['wallwrecker', 'swordsman'] as const) {
      m.activeTroop = kind;
      expect(m.deploy(5, 5)).toBe(true);
    }
    run(m, 0.05);
    for (const unit of m.battle!.units) unitEffects(unit).frozenUntil = 20;
    cast(m, 'rage', 5, 5);
    run(m, firstHit('rage', maxSpellLevel('rage')) + 0.1);
    const siege = m.battle!.units.find((u) => u.kind === 'wallwrecker')!;
    const soldier = m.battle!.units.find((u) => u.kind === 'swordsman')!;
    expect(siege.native?.effects?.boost).toBeUndefined();
    expect(soldier.native?.effects?.boost?.damage).toBeGreaterThan(0);
  });

  it('exposes all 18 Home Village spells with factory unlocks and native research', () => {
    expect(SPELL_KEYS).toHaveLength(18);
    for (const kind of SPELL_KEYS) {
      const row = nativeRow('spells', SPELL_SOURCE[kind], 1);
      expect(SPELLS[kind].space, kind).toBe(num(row, 'HousingSpace'));
      expect(SPELL_UNLOCK[kind], kind).toBe(num(row, 'SpellForgeLevel'));
      expect(spellFactory(kind), kind).toBe(
        row.ProductionBuilding === 'Dark Spell Factory' ? 'darkspellfactory' : 'spellfactory',
      );
    }
    expect(spellFactory('poison')).toBe('darkspellfactory');
    expect(spellFactory('angry')).toBe('darkspellfactory');
    expect(maxSpellLevel('overgrowth')).toBe(5);
  });

  it('brews and researches dark spells only with a Dark Spell Factory and dark elixir', () => {
    const m = new GameModel();
    m.state.obstacles = [];
    m.state.buildings.push(makeBuilding(m.state.nextId++, 'spellfactory', 30, 30, 9));
    m.state.buildings.push(makeBuilding(m.state.nextId++, 'laboratory', 34, 30, 12));
    m.brew('poison');
    expect(m.state.spells.poison).toBe(0);
    m.state.buildings.push(makeBuilding(m.state.nextId++, 'darkspellfactory', 38, 30, 8));
    m.brew('poison');
    expect(m.state.spells.poison).toBe(1);
    m.state.dark = 1_000_000;
    m.state.elixir = 1_000_000;
    const elixir = m.state.elixir;
    m.research('poison');
    expect(m.state.research?.kind).toBe('poison');
    expect(m.state.elixir).toBe(elixir);
    expect(m.state.dark).toBeLessThan(1_000_000);
    expect(validateSave(m.state)).toBe(true);
  });

  // The Freeze, Clone and Recall Spells shipped before the native roster and keep the engine
  // their own recordings were made with; tests/freeze-spell.test.ts and tests/late-spells.test.ts
  // cover them. What is checked here is that a native battle still stops a defense dead.
  it('freezes defenses through the released Freeze Spell inside a native battle', () => {
    const m = arena([['cannon', 10, 10, 5]], { swordsman: 1 }, { freeze: 1 }, 1);
    m.activeTroop = 'swordsman';
    m.deploy(2, 2);
    cast(m, 'freeze', 11.5, 11.5);
    run(m, 1.6);
    expect(m.battle!.defenseStuns[10]).toBeGreaterThan(m.battle!.elapsed);
  });

  it('weakens repeated earthquakes on one building and breaks walls on the fourth quake', () => {
    const m = arena(
      [
        ['goldmine', 10, 10, 8],
        ['wall', 16, 11, 10],
      ],
      { swordsman: 1 },
      { earthquake: 4 },
      5,
    );
    // A troop far from the quake keeps the battle running without touching the targets.
    m.activeTroop = 'swordsman';
    m.deploy(45, 45);
    const mine = building(m, 10),
      wall = building(m, 11);
    const permil = num(nativeRow('spells', 'Earthquake', 5), 'BuildingDamagePermil');
    cast(m, 'earthquake', 13.5, 11.5);
    run(m, 5);
    expect(mine.maxHp - mine.hp).toBeCloseTo((mine.maxHp * permil * 5) / 1000, 6);
    const afterOne = mine.hp;
    cast(m, 'earthquake', 13.5, 11.5);
    run(m, 5);
    expect(afterOne - mine.hp).toBeCloseTo((mine.maxHp * permil * 5) / 1000 / 3, 6);
    expect(wall.hp).toBeGreaterThan(0);
    cast(m, 'earthquake', 13.5, 11.5);
    run(m, 5);
    expect(wall.hp).toBeGreaterThan(0);
    cast(m, 'earthquake', 13.5, 11.5);
    run(m, 5);
    expect(wall.hp).toBe(0);
  });

  it('clones troops within its housing budget and lets copies expire without death effects', () => {
    const m = arena([['goldstorage', 30, 30, 1]], { balloon: 1 }, { clone: 1 }, 1);
    m.activeTroop = 'balloon';
    m.deploy(6, 6);
    const budget = num(nativeRow('spells', 'Clone', 1), 'DuplicateHousing');
    m.battle!.units[0].native = { effects: { frozenUntil: 5 } };
    cast(m, 'clone', 6, 6);
    run(m, 2);
    const copies = m.battle!.units.filter((u) => u.summoned);
    expect(copies.length).toBeGreaterThan(0);
    expect(copies.length).toBeLessThanOrEqual(Math.floor(budget / TROOPS.balloon.space));
    // Copies live out their stated life and leave no death effects behind them.
    run(m, 32);
    expect(copies.every((u) => u.hp <= 0)).toBe(true);
    expect(m.battle!.nativeDeaths ?? []).toHaveLength(0);
  });

  it('recalls troops to the deployment bar and redeploys them with their saved health', () => {
    const m = arena([['goldstorage', 30, 30, 1]], { giant: 2, archer: 3 }, { recall: 1 }, 1);
    m.activeTroop = 'giant';
    m.deploy(5, 5);
    m.deploy(5.5, 5);
    const giant = m.battle!.units[0];
    run(m, 0.5);
    giant.hp = 123;
    for (const u of m.battle!.units) u.native = { effects: { frozenUntil: 5 } };
    cast(m, 'recall', giant.x, giant.y);
    run(m, 2);
    // The released Recall Spell returns the troops to the bar to be deployed again.
    expect(m.battle!.units.some((u) => u.kind === 'giant')).toBe(false);
    expect(m.battle!.remaining.giant).toBe(2);
  });

  it('summons the spell skeleton squad on the native schedule and its shield breaks into a skeleton', () => {
    const m = arena([['goldstorage', 30, 30, 1]], { swordsman: 1 }, { skeleton: 1 }, 1);
    m.activeTroop = 'swordsman';
    m.deploy(2, 2);
    const row = nativeRow('spells', 'Skeleton Spell', 1);
    cast(m, 'skeleton', 8, 8);
    run(m, firstHit('skeleton', 1) + 0.05);
    const shielded = () => m.battle!.units.filter((u) => u.kind === 'spellskeletonshielded');
    expect(shielded()).toHaveLength(num(row, 'SpawnFirstGroupSize'));
    run(m, seconds(row, 'SpawnDuration') + 0.2);
    expect(shielded()).toHaveLength(num(row, 'UnitsToSpawn'));
    const first = shielded()[0];
    first.hp = 0;
    m.step(0.05);
    expect(m.battle!.units.some((u) => u.kind === 'spellskeleton')).toBe(true);
  });

  it('hides units inside Invisibility from defenses', () => {
    const m = arena([['archertower', 12, 12, 10]], { swordsman: 1 }, { invisibility: 1 }, 1);
    m.activeTroop = 'swordsman';
    m.deploy(9, 12.5);
    const troop = m.battle!.units[0];
    cast(m, 'invisibility', troop.x, troop.y);
    run(m, firstHit('invisibility', 1) + 0.05);
    const hp = troop.hp;
    troop.x = 10.5;
    troop.y = 13;
    troop.path = [];
    run(m, 1.5, 0.05);
    expect(troop.hp).toBe(hp);
  });

  it('roots buildings with Overgrowth: untargetable, disabled and immune', () => {
    const m = arena(
      [
        ['cannon', 10, 10, 5],
        ['goldmine', 20, 20, 5],
      ],
      { swordsman: 3 },
      { overgrowth: 1 },
      1,
    );
    cast(m, 'overgrowth', 11.5, 11.5);
    run(m, firstHit('overgrowth', 1) + 0.05);
    const cannon = building(m, 10);
    const duration = num(nativeRow('spells', 'Overgrowth', 1), 'ShieldTime') / 1000;
    expect(m.battle!.buildingEffects![10].overgrownUntil).toBeGreaterThan(duration);
    m.damage(cannon, 100);
    expect(cannon.hp).toBe(cannon.maxHp);
    m.activeTroop = 'swordsman';
    m.deploy(8, 11.5);
    run(m, 0.3);
    expect(m.battle!.units[0].target).toBe(11);
  });

  it('encases friendly troops in Ice Block, pausing them while blocking most damage', () => {
    const m = arena([['goldstorage', 30, 30, 1]], { giant: 1 }, { iceblock: 1 }, 1);
    m.activeTroop = 'giant';
    m.deploy(6, 6);
    const giant = m.battle!.units[0];
    cast(m, 'iceblock', 6, 6);
    run(m, firstHit('iceblock', 1) + 0.05);
    const x = giant.x;
    run(m, 1);
    expect(giant.x).toBe(x);
    const before = giant.hp;
    const blocked =
      num(nativeRow('abilities', 'IceBlockSpell', 1), 'ShieldProtectionPercent') / 100;
    hurtUnit(m.battle!, giant, 100);
    expect(before - giant.hp).toBeCloseTo(100 * (1 - blocked), 6);
  });

  it('makes troops inside the Angry Spell switch to defenses', () => {
    const m = arena(
      [
        ['goldmine', 6, 12, 1],
        ['cannon', 20, 12, 1],
      ],
      { swordsman: 1 },
      { angry: 1 },
      1,
    );
    m.activeTroop = 'swordsman';
    m.deploy(3, 13);
    run(m, 0.3);
    expect(m.battle!.units[0].target).toBe(10);
    cast(m, 'angry', 3, 13);
    run(m, firstHit('angry', 1) + 0.2);
    expect(m.battle!.units[0].target).toBe(11);
  });

  it('stuns defenses with the Totem Spell and leaves a draining Totem defenses can target', () => {
    const m = arena([['airdefense', 12, 12, 5]], { swordsman: 1 }, { totem: 1 }, 1);
    m.activeTroop = 'swordsman';
    m.deploy(2, 2);
    cast(m, 'totem', 11, 11);
    run(m, firstHit('totem', 1) + 1);
    const totem = m.battle!.units.find((u) => u.kind === 'totem')!;
    expect(totem).toBeDefined();
    const hp = totem.hp;
    run(m, 1);
    expect(totem.hp).toBeLessThan(hp);
  });

  it('replays every new spell to the identical final battle', () => {
    const spells = SPELL_KEYS.filter((k) => !['rage', 'heal', 'lightning', 'revive'].includes(k));
    const m = arena(
      [
        ['cannon', 12, 12, 5],
        ['archertower', 18, 12, 5],
        ['goldstorage', 12, 18, 5],
        ['wall', 16, 16, 5],
      ],
      { giant: 6, swordsman: 20, archer: 10 },
      Object.fromEntries(spells.map((k) => [k, 1])),
      2,
    );
    for (const [kind, x, y] of [
      ['giant', 6, 6],
      ['swordsman', 6, 7],
      ['archer', 6, 8],
    ] as const) {
      m.activeTroop = kind;
      m.deployMany(x, y, 5);
    }
    for (const [i, kind] of spells.entries()) {
      run(m, 0.6);
      cast(m, kind, 10 + (i % 5), 10 + ((i * 3) % 7));
    }
    run(m, 40);
    m.finishBattle();
    const record = m.state.raidLog![0].replay!;
    expect(validateReplay(record)).toBe(true);
    const viewer = new GameModel();
    expect(viewer.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(record))))).toBe(true);
    viewer.seekReplay(1e9);
    for (let i = 0; i < 400 && viewer.replay?.seeking; i++) viewer.step(0.016);
    expect(viewer.battle!.destruction).toBe(m.battle!.destruction);
    expect(viewer.battle!.units.length).toBe(m.battle!.units.length);
    expect(viewer.battle!.buildings.map((b: Building) => Math.round(b.hp))).toEqual(
      m.battle!.buildings.map((b: Building) => Math.round(b.hp)),
    );
  });

  it('rejects the new spells in recordings from before version 45', () => {
    const m = arena([['goldstorage', 30, 30, 1]], { swordsman: 1 }, { freeze: 1 }, 1);
    m.activeTroop = 'swordsman';
    m.deploy(2, 2);
    cast(m, 'freeze', 5, 5);
    run(m, 2);
    m.finishBattle();
    const record = structuredClone(m.state.raidLog![0].replay!);
    expect(validateReplay(record)).toBe(true);
    record.version = 44;
    expect(validateReplay(record)).toBe(false);
  });
});
