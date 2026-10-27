import { expect, it } from 'vitest';
import { GameModel, makeBuilding } from '../src/game/model';
import { emptyArmy, emptySpells } from '../src/game/army';
import { defendingHero, stepDefendingHeroes } from '../src/game/defending-heroes';
import { nativeUnitStats } from '../src/game/native-units';
import { attacker } from './fixtures/late-defense-battle';
import { defendingHeroFreezeRecording } from './fixtures/defending-hero-freeze-time';
import { replayBattle, validateReplay } from '../src/game/replay';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';

function arena(legacy = false, kind: 'king' | 'prince' = 'king') {
  const model = new GameModel();
  model.state.obstacles = [];
  model.state.buildings = [makeBuilding(1, 'townhall', 36, 36, 18)];
  model.state.army = { ...emptyArmy(), giant: 1 };
  model.state.spells = emptySpells();
  model.state.king = undefined;
  model.startBattle(0, true);
  const battle = model.battle!;
  if (legacy) delete battle.nativeDefendingHeroStunTime;
  const defender = defendingHero({ kind, level: 1, x: 10, y: 10 }, 0);
  battle.defenders = [defender];
  const unit = attacker(100, 'giant', 15, 10);
  battle.units.push(unit);
  defender.path = [{ x: unit.x, y: unit.y }];
  defender.pathAt = 1;
  defender.cooldown = 2;
  defender.stunnedUntil = 1;
  return {
    battle,
    defender,
    unit,
    step: (dt: number) => stepDefendingHeroes(battle, dt, () => {}),
  };
}

it('keeps the full step held at the exact thaw deadline', () => {
  const { battle, defender, step } = arena();
  battle.elapsed = 1;
  step(0.05);
  expect(defender.x).toBe(10);
  expect(defender.cooldown).toBe(2);
  expect(defender.pathAt).toBe(1);
});

it.each([0.05, 0.2, 1])(
  'only moves and cools down for the unfrozen part of a %s-second step',
  (dt) => {
    const { battle, defender, step } = arena();
    battle.elapsed = 1 + dt / 2;
    step(dt);
    expect(defender.x - 10).toBeCloseTo((nativeUnitStats('barbarianking', 1).speed * dt) / 2, 9);
    expect(defender.cooldown).toBeCloseTo(2 - dt / 2, 9);
    expect(defender.pathAt).toBeCloseTo(1 - dt / 2, 9);
  },
);

it('does not strike an in-range attacker while the whole step is frozen', () => {
  const { battle, defender, unit, step } = arena();
  unit.x = 10.5;
  defender.cooldown = 0;
  battle.elapsed = 1;
  const hp = unit.hp;
  step(0.05);
  expect(unit.hp).toBe(hp);
  expect(defender.attacking).toBe(false);
});

it('clips an air Hero movement step at the same thaw boundary', () => {
  const { battle, defender, step } = arena(false, 'prince');
  battle.elapsed = 1.025;
  step(0.05);
  expect(defender.mode).toBe('air');
  expect(defender.x - 10).toBeCloseTo(nativeUnitStats('minionprince', 1).speed * 0.025, 9);
  expect(defender.cooldown).toBeCloseTo(2 - 0.025, 9);
});

it('preserves version-68 full-step action on the thaw boundary', () => {
  const { battle, defender, step } = arena(true);
  battle.elapsed = 1;
  step(0.05);
  expect(defender.x - 10).toBeCloseTo(nativeUnitStats('barbarianking', 1).speed * 0.05, 9);
});

it('reconstructs the real Freeze boundary through portable backward seeks and version 68', () => {
  const { data, snapshots, thaw, frozen, defenderId } = defendingHeroFreezeRecording();
  expect(validateReplay(data)).toBe(true);
  expect(replayBattle(data.initial, 69).nativeDefendingHeroStunTime).toBe(true);
  expect(replayBattle(data.initial, 68).nativeDefendingHeroStunTime).toBeUndefined();
  const viewer = new GameModel();
  expect(viewer.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data))))).toBe(true);
  for (const snapshot of [...snapshots].reverse()) {
    viewer.seekReplay(snapshot.at);
    while (viewer.replay!.seeking) viewer.step(0.05);
    expect(JSON.parse(JSON.stringify(viewer.battle))).toEqual(snapshot.battle);
  }
  const at = (time: number) => {
    viewer.seekReplay(time);
    while (viewer.replay!.seeking) viewer.step(0.05);
    const defender = viewer.battle!.defenders!.find((d) => d.id === defenderId)!;
    return { position: [defender.x, defender.y], cooldown: defender.cooldown };
  };
  expect(thaw).toBe(4);
  const held = at(frozen);
  expect(at(thaw)).toEqual(held);
  expect(viewer.openReplay({ ...data, version: 68 })).toBe(true);
  expect(at(thaw)).not.toEqual(held);
});
