import { expect, it } from 'vitest';
import { GameModel, makeBuilding } from '../src/game/model';
import { emptyArmy, emptySpells } from '../src/game/army';
import { castNativeSpell, stepNativeSpells } from '../src/game/native-spells';
import { stepDefendingHeroes } from '../src/game/defending-heroes';

function poisonedKing(legacy = false) {
  const model = new GameModel();
  model.state.obstacles = [];
  model.state.buildings = [
    makeBuilding(1, 'townhall', 30, 30, 18),
    makeBuilding(2, 'herohall', 10, 10, 1),
  ];
  model.state.nextId = 100;
  model.state.army = { ...emptyArmy(), giant: 1 };
  model.state.spells = emptySpells();
  model.state.king = { level: 1 };
  model.state.heroLineup = ['king'];
  model.startBattle(0, true);
  const battle = model.battle!;
  if (legacy) delete battle.nativeDefendingHeroPoison;
  const defender = battle.defenders!.find((defender) => defender.kind === 'hero')!;
  model.activeTroop = 'giant';
  expect(model.deploy(5, 5)).toBe(true);
  const attacker = battle.units[0];
  attacker.x = defender.x + 0.5;
  attacker.y = defender.y;
  const hp = defender.hp;
  const cast = castNativeSpell(battle, 'Poison', 1, 'attack', defender.x, defender.y);
  battle.elapsed = cast.firstHit + 0.01;
  stepNativeSpells({ battle, damageBuilding: () => {}, effect: () => {} });
  expect(defender.poison?.attack).toBe(-0.35);
  return { battle, defender, attacker, hp };
}

it('native Poison slows the defending King attack clock', () => {
  const { battle, defender } = poisonedKing();
  defender.cooldown = 1;
  stepDefendingHeroes(battle, 0.1, () => {});
  expect(defender.cooldown).toBeCloseTo(1 - 0.1 * 0.65, 9);
});

it('native Poison honors the source hero damage multiplier on defenders', () => {
  const { defender, hp } = poisonedKing();
  expect(hp - defender.hp).toBeCloseTo(90 * 0.4 * (0.4 / 5) * 0.05, 8);
});

it('native Poison slows the defending King movement', async () => {
  const { nativeUnitStats } = await import('../src/game/native-units');
  const { battle, defender, attacker } = poisonedKing();
  attacker.x = defender.x + 5;
  attacker.y = defender.y;
  const from = defender.x;
  defender.path = [{ x: attacker.x, y: attacker.y }];
  defender.pathAt = 1;
  stepDefendingHeroes(battle, 0.1, () => {});
  expect(defender.x - from).toBeCloseTo(nativeUnitStats('barbarianking', 1).speed * 0.1 * 0.74, 8);
});

it('keeps the released version-59 poison calculation on defending heroes', () => {
  const { battle, defender, hp } = poisonedKing(true);
  expect(hp - defender.hp).toBeCloseTo(90 * 0.4 * (0.4 / 5), 8);
  defender.cooldown = 1;
  stepDefendingHeroes(battle, 0.1, () => {});
  expect(defender.cooldown).toBeCloseTo(1 - 0.1 * 1.35, 9);
});

it('reconstructs defending hero poison exactly through portable replay seeks and version 59', async () => {
  const { defendingHeroPoisonRecording } = await import('./fixtures/defending-hero-poison');
  const { replayBattle, validateReplay, compatibleReplayVersion } =
    await import('../src/game/replay');
  const { makeReplayFile, parseReplayFile } = await import('../src/game/replay-file');
  const { data, snapshots, later } = defendingHeroPoisonRecording();
  expect(validateReplay(data)).toBe(true);
  expect(replayBattle(data.initial, 60).nativeDefendingHeroPoison).toBe(true);
  expect(replayBattle(data.initial, 59).nativeDefendingHeroPoison).toBeUndefined();
  const viewer = new GameModel();
  expect(viewer.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data))))).toBe(true);
  for (const snapshot of [...snapshots].reverse()) {
    viewer.seekReplay(snapshot.at);
    while (viewer.replay!.seeking) viewer.step(0.05);
    expect(JSON.parse(JSON.stringify(viewer.battle))).toEqual(snapshot.battle);
  }
  viewer.seekReplay(later);
  while (viewer.replay!.seeking) viewer.step(0.05);
  const current = viewer.battle!.defenders!.find((defender) => defender.kind === 'hero')!;
  expect(current.poison?.attack).toBe(-0.35);
  expect(current.hp).toBeLessThan(current.maxHp);
  const currentHp = current.hp;
  expect(compatibleReplayVersion(59)).toBe(true);
  expect(viewer.openReplay({ ...data, version: 59 })).toBe(true);
  viewer.seekReplay(later);
  while (viewer.replay!.seeking) viewer.step(0.05);
  const old = viewer.battle!.defenders!.find((defender) => defender.kind === 'hero')!;
  expect(old.hp).toBeLessThan(currentHp);
});
