import { expect, it } from 'vitest';
import { GameModel, makeBuilding } from '../src/game/model';
import { emptyArmy, emptySpells } from '../src/game/army';
import { castNativeSpell, stepNativeSpells } from '../src/game/native-spells';
import { unitAttackIntervalScale, unitSpeedScale } from '../src/game/native-status';
import { attacker } from './fixtures/late-defense-battle';
import { defendingHero } from '../src/game/defending-heroes';
import { attackerPoisonRecording } from './fixtures/attacker-poison';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { compatibleReplayVersion, replayBattle, validateReplay } from '../src/game/replay';
import { HERO_KINDS, HERO_UNIT, type HeroKind } from '../src/game/native-hero-data';

function poisonedHero(name: string, level = 1, legacy = false, hero: HeroKind = 'king') {
  const model = new GameModel();
  model.state.obstacles = [];
  model.state.buildings = [makeBuilding(1, 'townhall', 36, 36, 18)];
  model.state.army = { ...emptyArmy(), giant: 1 };
  model.state.spells = emptySpells();
  model.state.king = undefined;
  model.startBattle(0, true);
  const battle = model.battle!;
  if (legacy) delete battle.nativeHeroPoisonSpeed;
  const unit = attacker(100, 'giant', 10, 10, 1e6, 1e6, { kind: HERO_UNIT[hero], hero });
  const troop = attacker(101, 'giant', 10, 10, 1e6, 1e6);
  battle.units.push(unit, troop);
  const cast = castNativeSpell(battle, name, level, 'defense', 10, 10);
  battle.elapsed = cast.firstHit + 0.01;
  stepNativeSpells({ battle, damageBuilding: () => {}, effect: () => {} });
  return { battle, unit, troop };
}

it.each([
  ['Spell Tower Poison', 1, 0.83, 0.65, 0.75],
  ['TH14 Poison', 1, 0.75, 0.5, 0.5],
  ['Poison', 1, 0.87, 0.74, 0.65],
  ['Poison', 12, 0.74, 0.48, 0.26],
] as const)(
  '%s %s applies the client hero movement multiplier',
  (name, level, heroMove, troopMove, attack) => {
    const { battle, unit, troop } = poisonedHero(name, level);
    expect(unitSpeedScale(unit, battle.elapsed)).toBeCloseTo(heroMove, 9);
    expect(unitSpeedScale(troop, battle.elapsed)).toBeCloseTo(troopMove, 9);
    expect(unitAttackIntervalScale(unit, battle.elapsed)).toBeCloseTo(1 / attack, 9);
    expect(unitAttackIntervalScale(troop, battle.elapsed)).toBeCloseTo(1 / attack, 9);
  },
);

it('keeps the released version-66 full hero movement slow', () => {
  const { battle, unit } = poisonedHero('Spell Tower Poison', 1, true);
  expect(unitSpeedScale(unit, battle.elapsed)).toBeCloseTo(0.65, 9);
});

it.each(HERO_KINDS)('scales movement for the actual %s hero unit', (hero) => {
  const { battle, unit } = poisonedHero('Spell Tower Poison', 1, false, hero);
  expect(unitSpeedScale(unit, battle.elapsed)).toBeCloseTo(0.83, 9);
});

it('applies the same movement multiplier to defending heroes in an offensive spell cloud', () => {
  const { battle } = poisonedHero('Spell Tower Poison');
  const defender = defendingHero({ kind: 'king', level: 1, x: 10, y: 10 }, 0);
  battle.defenders = [defender];
  const cast = castNativeSpell(battle, 'Poison', 1, 'attack', 10, 10);
  battle.elapsed = cast.firstHit + 0.01;
  stepNativeSpells({ battle, damageBuilding: () => {}, effect: () => {} });
  expect(defender.poison?.speed).toBe(-0.13);
  expect(defender.poison?.attack).toBe(-0.35);
});

it('reconstructs a real poisoned King through portable backward seeks and version 66', () => {
  const { data, snapshots } = attackerPoisonRecording(0.05, 'king');
  expect(validateReplay(data)).toBe(true);
  expect(replayBattle(data.initial, 67).nativeHeroPoisonSpeed).toBe(true);
  expect(replayBattle(data.initial, 66).nativeHeroPoisonSpeed).toBeUndefined();
  const viewer = new GameModel();
  expect(viewer.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data))))).toBe(true);
  for (const snapshot of [...snapshots].reverse()) {
    viewer.seekReplay(snapshot.at);
    while (viewer.replay!.seeking) viewer.step(0.05);
    expect(JSON.parse(JSON.stringify(viewer.battle))).toEqual(snapshot.battle);
  }
  const last = snapshots.at(-1)!;
  viewer.seekReplay(last.at);
  while (viewer.replay!.seeking) viewer.step(0.05);
  expect(viewer.battle!.units[0].native?.effects?.poison?.speed).toBe(-0.17);
  expect(compatibleReplayVersion(66)).toBe(true);
  expect(viewer.openReplay({ ...data, version: 66 })).toBe(true);
  viewer.seekReplay(last.at);
  while (viewer.replay!.seeking) viewer.step(0.05);
  expect(viewer.battle!.units[0].native?.effects?.poison?.speed).toBe(-0.35);
  const first = snapshots[0];
  viewer.seekReplay(first.at);
  while (viewer.replay!.seeking) viewer.step(0.05);
  const current = (first.battle as import('../src/game/model').Battle).units[0];
  const old = viewer.battle!.units[0];
  expect([old.x, old.y]).not.toEqual([current.x, current.y]);
});
