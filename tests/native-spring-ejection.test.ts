import { describe, expect, it } from 'vitest';
import { BUILDINGS, type UnitKind } from '../src/game/data';
import { GameModel, makeBuilding, type Unit } from '../src/game/model';
import { initialNativeState } from '../src/game/native-troops';
import { nativeSpringTrapOutcome } from '../src/game/native-spring-trap';
import { compatibleReplayVersion, REPLAY_VERSION, replayBattle } from '../src/game/replay';
import { stepTraps } from '../src/game/traps';

function fixture(kind: UnitKind, hp = 10000, version = REPLAY_VERSION, level = 13) {
  const model = new GameModel();
  const trap = makeBuilding(9000, 'springtrap', 10, 10, level);
  const center = 10 + BUILDINGS.springtrap.size / 2;
  const setup = {
    index: 0,
    practice: true,
    townhall: 18,
    buildings: [trap, makeBuilding(9001, 'townhall', 40, 40, 18)],
    army: { ...model.state.army },
    spells: { ...model.state.spells },
    troopLevels: { ...model.state.troopLevels },
    nextId: 9003,
  };
  const battle = replayBattle(setup, version);
  const unit: Unit = {
    id: 9002,
    kind,
    level: 1,
    x: center,
    y: center,
    hp,
    maxHp: 10000,
    cooldown: 1000,
    target: null,
    path: [],
    pathAt: 0,
    attacking: false,
    native: initialNativeState(kind, 1),
  };
  // These hits exercise surfaced siege machines; the underground control sets it back below.
  if (kind === 'battledrill') unit.native!.burrowed = false;
  battle.started = true;
  battle.elapsed = 0.05;
  battle.units = [unit];
  const hit = () => stepTraps(battle, 0.05, () => {});
  return { battle, unit, setup, hit };
}

describe('original Spring Trap initialization and ejection rules', () => {
  for (const kind of ['lassi', 'mightyyak', 'unicorn', 'frostypet', 'rootrider'] as const) {
    it(`defeats ${kind} without marking an ejection or suppressing its normal defeat`, () => {
      const { unit, battle, hit } = fixture(kind, 600);
      hit();
      expect(battle.traps[9000].resolved).toBe(true);
      expect(unit.hp).toBe(0);
      expect(unit.ejected).toBe(false);
      expect(unit.spent).not.toBe(true);
      expect(unit.springUntil).toBeUndefined();
    });
  }

  for (const kind of ['wallwrecker', 'loglauncher', 'flameflinger', 'battledrill'] as const) {
    it(`applies a reduced hit to ${kind} without ejection or radial throw`, () => {
      const { unit, battle, hit } = fixture(kind);
      const path = [{ x: 12, y: 12 }];
      unit.path = path;
      unit.attacking = true;
      hit();
      expect(battle.traps[9000].resolved).toBe(true);
      expect(unit.hp).toBe(9300);
      expect(unit.ejected).toBe(false);
      expect(unit.spent).not.toBe(true);
      expect(unit.springUntil).toBeUndefined();
      expect(unit.attacking).toBe(true);
      expect(unit.path).toBe(path);
      hit();
      expect(unit.hp).toBe(9300);
    });

    it(`lets a lethal reduced hit defeat ${kind} normally`, () => {
      const { unit, hit } = fixture(kind, 700);
      hit();
      expect(unit.hp).toBe(0);
      expect(unit.ejected).toBe(false);
      expect(unit.spent).not.toBe(true);
    });
  }

  it('uses source production type3 protection even at the zero-damage first trap level', () => {
    const { unit, hit } = fixture('wallwrecker', 10000, REPLAY_VERSION, 1);
    hit();
    expect(unit.hp).toBe(10000);
    expect(unit.ejected).toBe(false);
  });

  it('still ejects an unprotected small troop before the zero-damage hit', () => {
    const { unit, hit } = fixture('archer', 10000, REPLAY_VERSION, 1);
    hit();
    expect(unit.hp).toBe(0);
    expect(unit.ejected).toBe(true);
    expect(unit.spent).toBe(true);
  });

  it('retains ordinary oversized troop damage and lethal-hit ejection', () => {
    const healthy = fixture('golem');
    healthy.hit();
    expect(healthy.unit.hp).toBe(8600);
    expect(healthy.unit.ejected).toBe(false);
    const lethal = fixture('golem', 1400);
    lethal.hit();
    expect(lethal.unit.hp).toBe(0);
    expect(lethal.unit.ejected).toBe(true);
    expect(lethal.unit.spent).toBe(true);
  });

  it('preserves native hundredth-HP precision for pets, siege machines and heroes', () => {
    // Original Damage loader:1401HP ->140100; d3d694 retains70050 ->700.5HP.
    for (const kind of ['lassi', 'wallwrecker', 'barbarianking'] as const) {
      const { unit } = fixture(kind);
      expect(nativeSpringTrapOutcome(unit, 13, 1401).hp).toBe(9299.5);
    }
  });

  it('keeps flying and burrowed units from activating a ground spring', () => {
    const air = fixture('battleblimp');
    air.hit();
    expect(air.battle.traps[9000]).toBeUndefined();
    const burrowed = fixture('battledrill');
    burrowed.unit.native!.burrowed = true;
    burrowed.hit();
    expect(burrowed.battle.traps[9000]).toBeUndefined();
  });

  it('preserves version237 siege and lethal immune-troop outcomes', () => {
    for (const [kind, hp] of [
      ['wallwrecker', 10000],
      ['rootrider', 600],
    ] as const) {
      const old = fixture(kind, hp, 237);
      old.hit();
      expect(old.battle.nativeSpringEjection).toBeUndefined();
      expect(old.unit.ejected).toBe(true);
    }
    expect(compatibleReplayVersion(237)).toBe(true);
    expect(compatibleReplayVersion(238)).toBe(true);
  });

  it('carries the capability only on native home layouts with a spring', () => {
    const { setup, battle } = fixture('rootrider');
    expect(battle.nativeSpringEjection).toBe(true);
    expect(JSON.parse(JSON.stringify(battle)).nativeSpringEjection).toBe(true);
    expect(replayBattle({ ...setup, buildings: [] }).nativeSpringEjection).toBeUndefined();
    expect(replayBattle({ ...setup, catalog: 'goblin-v1' }).nativeSpringEjection).toBeUndefined();
    const npc = makeBuilding(9000, 'springtrap', 10, 10, 13);
    npc.npc = 'shrink-trap';
    expect(replayBattle({ ...setup, buildings: [npc] }).nativeSpringEjection).toBeUndefined();
  });
});
