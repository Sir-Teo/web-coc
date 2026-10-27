import { expect, it } from 'vitest';
import { GameModel, makeBuilding } from '../src/game/model';
import { emptyArmy, emptySpells } from '../src/game/army';
import { castNativeSpell, stepNativeSpells } from '../src/game/native-spells';
import { defendingHero } from '../src/game/defending-heroes';
import { createGuardian } from '../src/game/native-guardians';
import { spawnGarrisonDefender } from '../src/game/garrison-combat';
import { spawnSkeleton } from '../src/game/defenders';
import {
  defenderStatusTint,
  NATIVE_FREEZE_TINT,
  NATIVE_POISON_TINT,
} from '../src/game/unit-status-tint';
import { defenderFreezeTintRecording } from './fixtures/defender-freeze-tint';
import { replayBattle, validateReplay } from '../src/game/replay';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';

function arena() {
  const model = new GameModel();
  model.state.obstacles = [];
  model.state.buildings = [makeBuilding(1, 'townhall', 36, 36, 18)];
  model.state.army = { ...emptyArmy(), giant: 1 };
  model.state.spells = emptySpells();
  model.state.king = undefined;
  model.startBattle(0, true);
  const battle = model.battle!;
  const hero = defendingHero({ kind: 'king', level: 1, x: 10, y: 10 }, 0);
  const guardian = createGuardian(battle, battle.buildings[0], -2)!;
  const garrison = spawnGarrisonDefender(battle, 'dragon', 5, 1, 10, 10, 0);
  const skeleton = spawnSkeleton(battle, makeBuilding(2, 'skeletontrap', 10, 10, 5), 0, 0);
  battle.defenders = [hero, guardian, garrison, skeleton];
  for (const defender of battle.defenders) {
    defender.x = defender.y = 10;
    defender.spawnedAt = 0;
  }
  const pulse = (name: string, level = 1) => {
    const cast = castNativeSpell(battle, name, level, 'attack', 10, 10);
    battle.elapsed = cast.firstHit + 0.01;
    stepNativeSpells({ battle, damageBuilding: () => {}, effect: () => {} });
    return cast;
  };
  return { battle, pulse };
}

it('tints all four living defender families for full Freeze, then restores Poison at thaw', () => {
  const { battle, pulse } = arena();
  for (const defender of battle.defenders!)
    defender.poison = { since: 0, until: 100, speed: -0.26, attack: -0.35 };
  pulse('Freeze');
  for (const defender of battle.defenders!) {
    expect(defender.frozenUntil).toBe(defender.stunnedUntil);
    expect(defenderStatusTint(defender, battle.elapsed)?.color).toBe(NATIVE_FREEZE_TINT);
    expect(defenderStatusTint(defender, defender.frozenUntil!)?.color).toBe(NATIVE_POISON_TINT);
    defender.hp = 0;
    expect(defenderStatusTint(defender, battle.elapsed)).toBeUndefined();
  }
});

it.each(['Lightning', 'Totem Spell'])('does not give %s stuns a Freeze cue', (name) => {
  const { battle, pulse } = arena();
  for (const defender of battle.defenders!) defender.hp = defender.maxHp = 1e6;
  pulse(name);
  for (const defender of battle.defenders!) {
    expect(defender.stunnedUntil).toBeGreaterThan(battle.elapsed);
    expect(defender.frozenUntil).toBeUndefined();
    expect(defenderStatusTint(defender, battle.elapsed)).toBeUndefined();
  }
});

it.each(['hero', 'skeleton', 'garrison', 'guardian'] as const)(
  'reconstructs version-68 %s Freeze cues without changing version-67 combat',
  (kind) => {
    const { data: recording, defenderId, frozen, expired } = defenderFreezeTintRecording(kind);
    // Pin the visual-only release: later combat versions deliberately change Hero timing.
    const data = { ...recording, version: 68 };
    expect(validateReplay(data)).toBe(true);
    expect(replayBattle(data.initial, 68).nativeDefenderFreezeCue).toBe(true);
    expect(replayBattle(data.initial, 67).nativeDefenderFreezeCue).toBeUndefined();
    const viewer = new GameModel();
    expect(viewer.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data))))).toBe(true);
    const snapshots = [frozen, expired].map((at) => {
      viewer.seekReplay(at);
      while (viewer.replay!.seeking) viewer.step(0.05);
      const defender = viewer.battle!.defenders!.find((d) => d.id === defenderId)!;
      expect(defender.hp).toBeGreaterThan(0);
      expect(defenderStatusTint(defender, viewer.battle!.elapsed)?.color).toBe(
        at === frozen ? NATIVE_FREEZE_TINT : undefined,
      );
      return { at, battle: JSON.parse(JSON.stringify(viewer.battle)) };
    });
    for (const snapshot of [...snapshots].reverse()) {
      viewer.seekReplay(snapshot.at);
      while (viewer.replay!.seeking) viewer.step(0.05);
      expect(JSON.parse(JSON.stringify(viewer.battle))).toEqual(snapshot.battle);
    }
    expect(viewer.openReplay({ ...data, version: 67 })).toBe(true);
    for (const snapshot of snapshots) {
      viewer.seekReplay(snapshot.at);
      while (viewer.replay!.seeking) viewer.step(0.05);
      const expected = JSON.parse(JSON.stringify(snapshot.battle));
      delete expected.nativeDefenderFreezeCue;
      for (const defender of expected.defenders) delete defender.frozenUntil;
      expect(JSON.parse(JSON.stringify(viewer.battle))).toEqual(expected);
    }
  },
);

it('a shorter second Freeze cannot shorten the visual deadline', () => {
  const { battle, pulse } = arena();
  pulse('Freeze', 8);
  const until = battle.defenders![0].frozenUntil;
  pulse('Freeze', 1);
  expect(battle.defenders!.every((defender) => defender.frozenUntil === until)).toBe(true);
});

it('keeps version-67 defender state free of the new visual deadline', () => {
  const { battle, pulse } = arena();
  delete battle.nativeDefenderFreezeCue;
  pulse('Freeze');
  for (const defender of battle.defenders!) {
    expect(defender.stunnedUntil).toBeGreaterThan(battle.elapsed);
    expect(defender.frozenUntil).toBeUndefined();
  }
});
