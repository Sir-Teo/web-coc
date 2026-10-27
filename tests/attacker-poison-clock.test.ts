import { expect, it } from 'vitest';
import { GameModel, makeBuilding } from '../src/game/model';
import { emptyArmy, emptySpells } from '../src/game/army';
import { castNativeSpell, stepNativeSpells } from '../src/game/native-spells';
import { attacker } from './fixtures/late-defense-battle';
import { attackerPoisonRecording } from './fixtures/attacker-poison';
import { compatibleReplayVersion, replayBattle, validateReplay } from '../src/game/replay';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';

function damageThroughClouds(step: number, legacy = false, hero = false) {
  const model = new GameModel();
  model.state.obstacles = [];
  model.state.buildings = [makeBuilding(1, 'townhall', 36, 36, 18)];
  model.state.army = { ...emptyArmy(), giant: 1 };
  model.state.spells = emptySpells();
  model.state.king = undefined;
  model.startBattle(0, true);
  const battle = model.battle!;
  if (legacy) delete battle.nativeAttackerPoisonClock;
  const unit = attacker(100, 'giant', 10, 10, 1e6, 1e6, hero ? { hero: 'king' } : {});
  battle.units.push(unit);
  castNativeSpell(battle, 'Spell Tower Poison', 1, 'defense', 10, 10);
  castNativeSpell(battle, 'Spell Tower Poison', 1, 'defense', 10, 10, { at: 0.2 });
  const until = (end: number) => {
    while (battle.elapsed < end - 1e-9) {
      battle.elapsed = Math.round(Math.min(end, battle.elapsed + step) * 1e9) / 1e9;
      stepNativeSpells({ battle, damageBuilding: () => {}, effect: () => {} });
    }
  };
  until(6);
  const hp = unit.hp;
  until(8);
  return hp - unit.hp;
}

it.each([0.05, 0.1, 0.2, 0.4, 0.5, 1, 2, 10])(
  'keeps defensive Poison damage capped with %s-second updates',
  (step) => {
    expect(damageThroughClouds(step)).toBeCloseTo(60 * 2, 7);
  },
);

it('preserves the released larger-update defensive Poison calculation', () => {
  expect(damageThroughClouds(1, true)).toBeCloseTo(180, 7);
});

it.each([0.05, 1, 2])(
  'retains the native hero damage multiplier with %s-second updates',
  (step) => {
    expect(damageThroughClouds(step, false, true)).toBeCloseTo(60 * 2 * 0.2, 7);
  },
);

it('keeps both the paid-through clock and slow deadline at the latest processed pulse', () => {
  const { snapshots } = attackerPoisonRecording();
  for (const snapshot of snapshots) {
    const battle = snapshot.battle as import('../src/game/model').Battle;
    const poison = battle.units[0].native?.effects?.poison;
    expect(poison).toBeDefined();
    const pulses = battle.nativeSpells!.filter((cast) => cast.name === 'Spell Tower Poison');
    expect(pulses).toHaveLength(2);
    const latest = Math.max(
      ...pulses.map((cast) => cast.firstHit + (cast.hits - 1) * cast.interval),
    );
    expect(poison!.tickAt).toBeCloseTo(latest, 9);
    expect(poison!.until).toBeCloseTo(latest + 0.5, 9);
  }
});

it('reconstructs real defensive Poison casts across portable backward seeks and version 65', () => {
  const { data, snapshots } = attackerPoisonRecording();
  expect(validateReplay(data)).toBe(true);
  expect(replayBattle(data.initial, 66).nativeAttackerPoisonClock).toBe(true);
  expect(replayBattle(data.initial, 65).nativeAttackerPoisonClock).toBeUndefined();
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
  const unit = viewer.battle!.units[0];
  expect(unit.native?.effects?.poison?.tickAt).toBeGreaterThan(0);
  const hp = unit.hp;
  expect(compatibleReplayVersion(65)).toBe(true);
  expect(viewer.openReplay({ ...data, version: 65 })).toBe(true);
  viewer.seekReplay(last.at);
  while (viewer.replay!.seeking) viewer.step(0.05);
  expect(viewer.battle!.units[0].hp).toBeLessThan(hp);
});
