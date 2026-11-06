import { describe, expect, it } from 'vitest';
import { BUILDINGS, type UnitKind } from '../src/game/data';
import { GameModel, makeBuilding, type Unit } from '../src/game/model';
import { initialNativeState } from '../src/game/native-troops';
import {
  compatibleReplayVersion,
  replayBattle,
  REPLAY_VERSION,
  type ReplaySetup,
} from '../src/game/replay';
import { stepTraps } from '../src/game/traps';

function spring(kind: UnitKind, version = REPLAY_VERSION, level = 13, hp = 10000) {
  const model = new GameModel();
  const trap = makeBuilding(9000, 'springtrap', 10, 10, level);
  const setup: ReplaySetup = {
    index: 0,
    practice: true,
    townhall: 18,
    buildings: [trap, makeBuilding(9001, 'townhall', 40, 40, 18)],
    army: { ...model.state.army },
    spells: { ...model.state.spells },
    troopLevels: { ...model.state.troopLevels },
    heroes: [{ kind: 'king', level: 95, items: [], pet: { kind: 'lassi', level: 1 } }],
    nextId: 9003,
  };
  const battle = replayBattle(setup, version);
  const center = 10 + BUILDINGS.springtrap.size / 2;
  const unit: Unit = {
    id: 9002,
    kind,
    level: 1,
    x: center,
    y: center,
    hp,
    maxHp: hp,
    cooldown: 1000,
    target: null,
    path: [],
    pathAt: 0,
    attacking: false,
    native: initialNativeState(kind, 1),
  };
  battle.started = true;
  battle.units = [unit];
  battle.elapsed = 0.05;
  stepTraps(battle, 0.05, () => {});
  return { unit, battle, setup };
}

describe('recovered native Spring Trap pet damage', () => {
  // Original ARM64 d3d694 returns 700 for damage1400 / retained50, independently executed.
  for (const kind of ['lassi', 'mightyyak', 'unicorn', 'frostypet'] as const) {
    it(`applies the native 50 percent damage reduction to ${kind}`, () => {
      const { unit, battle } = spring(kind);
      expect(battle.traps[9000].resolved).toBe(true);
      expect(unit.hp).toBe(9300);
      expect(unit.ejected).toBe(false);
    });

    it(`preserves version236 ${kind} damage`, () => {
      const { unit } = spring(kind, 236);
      expect(unit.hp).toBe(8600);
      expect(unit.ejected).toBe(false);
    });
  }

  it('keeps the first source level at zero damage', () => {
    const { unit, battle } = spring('lassi', REPLAY_VERSION, 1);
    expect(battle.traps[9000].resolved).toBe(true);
    expect(unit.hp).toBe(10000);
  });

  it('keeps a damaged pet alive when the native reduced hit is nonlethal', () => {
    const current = spring('lassi', REPLAY_VERSION, 13, 1000).unit;
    expect(current.hp).toBe(300);
    expect(current.ejected).toBe(false);
    expect(spring('lassi', 236, 13, 1000).unit.ejected).toBe(true);
  });

  it('preserves full damage for an oversized ordinary troop', () => {
    const { unit } = spring('golem');
    expect(unit.hp).toBe(8600);
    expect(unit.ejected).toBe(false);
  });

  it('preserves capacity ejection for an ordinary small troop', () => {
    const { unit } = spring('archer');
    expect(unit.hp).toBe(0);
    expect(unit.ejected).toBe(true);
  });

  it('preserves old replay compatibility and gates the new rule', () => {
    const { setup } = spring('lassi');
    expect(compatibleReplayVersion(236)).toBe(true);
    expect(compatibleReplayVersion(REPLAY_VERSION)).toBe(true);
    expect(replayBattle(setup, 236).nativeSpringPetDamage).toBeUndefined();
    expect(replayBattle(setup, 237).nativeSpringPetDamage).toBe(true);
  });

  it('does not add the capability to unrelated battle snapshots', () => {
    const { setup } = spring('lassi');
    expect(replayBattle({ ...setup, heroes: [] }, 237).nativeSpringPetDamage).toBeUndefined();
    const buildings = setup.buildings.filter((building) => building.kind !== 'springtrap');
    expect(replayBattle({ ...setup, buildings }, 237).nativeSpringPetDamage).toBeUndefined();
    expect(
      replayBattle({ ...setup, catalog: 'goblin-v1' }, 237).nativeSpringPetDamage,
    ).toBeUndefined();
  });
});
