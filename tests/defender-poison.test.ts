import { expect, it } from 'vitest';
import { GameModel, makeBuilding } from '../src/game/model';
import { emptyArmy, emptySpells } from '../src/game/army';
import { castNativeSpell, stepNativeSpells } from '../src/game/native-spells';
import { spawnGarrisonDefender, stepGarrisonDefender } from '../src/game/garrison-combat';
import { garrisonStats } from '../src/game/garrison-kinds';

function poisonedDragon() {
  const model = new GameModel();
  model.state.obstacles = [];
  model.state.buildings = [makeBuilding(1, 'townhall', 30, 30, 18)];
  model.state.nextId = 100;
  model.state.army = { ...emptyArmy(), giant: 1 };
  model.state.spells = emptySpells();
  model.state.king = undefined;
  model.startBattle(0, true);
  const battle = model.battle!;
  const defender = spawnGarrisonDefender(battle, 'dragon', 5, 1, 10, 10, 0);
  model.activeTroop = 'giant';
  expect(model.deploy(5, 5)).toBe(true);
  const attacker = battle.units[0];
  attacker.x = defender.x + 0.5;
  attacker.y = defender.y;
  const cast = castNativeSpell(battle, 'Poison', 1, 'attack', defender.x, defender.y);
  battle.elapsed = cast.firstHit + 0.01;
  stepNativeSpells({ battle, damageBuilding: () => {}, effect: () => {} });
  expect(defender.poison?.attack).toBe(-0.35);
  return { battle, defender, attacker };
}

it('native Poison slows the garrison Dragon attack clock', () => {
  const { battle, defender, attacker } = poisonedDragon();
  defender.cooldown = 1;
  defender.target = attacker.id;
  defender.engaged = true;
  stepGarrisonDefender(battle, defender, 0.1, () => {});
  expect(defender.cooldown).toBeCloseTo(1 - 0.1 * 0.65, 9);
});

it('native Poison slows the garrison Dragon movement', () => {
  const { battle, defender, attacker } = poisonedDragon();
  attacker.x = defender.x + 5;
  attacker.y = defender.y;
  const from = defender.x;
  stepGarrisonDefender(battle, defender, 0.1, () => {});
  expect(defender.x - from).toBeCloseTo(garrisonStats('dragon', 5).speed * 0.1 * 0.74, 8);
});

async function poisonedSkeleton(mode: 'ground' | 'air' = 'ground') {
  const { spawnSkeleton } = await import('../src/game/defenders');
  const { battle, attacker } = poisonedDragon();
  battle.defenders = [];
  battle.nativeSpells = [];
  const trap = makeBuilding(2, 'skeletontrap', 10, 10);
  trap.skeletonMode = mode;
  const defender = spawnSkeleton(battle, trap, 0, 0);
  attacker.kind = mode === 'air' ? 'dragon' : 'giant';
  attacker.x = defender.x + 0.2;
  attacker.y = defender.y;
  const cast = castNativeSpell(battle, 'Poison', 1, 'attack', defender.x, defender.y);
  battle.elapsed = cast.firstHit + 0.01;
  stepNativeSpells({ battle, damageBuilding: () => {}, effect: () => {} });
  expect(defender.hp).toBeGreaterThan(0);
  return { battle, defender, attacker };
}

it('native Poison slows the Skeleton Trap defender attack clock', async () => {
  const { stepDefenders } = await import('../src/game/defenders');
  const { battle, defender } = await poisonedSkeleton();
  defender.cooldown = 1;
  stepDefenders(battle, 0.1, () => {});
  expect(defender.cooldown).toBeCloseTo(1 - 0.1 * 0.65, 9);
});

it.each(['ground', 'air'] as const)(
  'native Poison slows %s Skeleton Trap movement',
  async (mode) => {
    const { stepDefenders } = await import('../src/game/defenders');
    const { skeletonStats } = await import('../src/game/skeleton-stats');
    const { battle, defender, attacker } = await poisonedSkeleton(mode);
    attacker.x = defender.x + 5;
    attacker.y = defender.y;
    defender.target = attacker.id;
    defender.path = [{ x: attacker.x, y: attacker.y }];
    defender.pathAt = 1;
    const from = defender.x;
    stepDefenders(battle, 0.1, () => {});
    expect(defender.x - from).toBeCloseTo(skeletonStats(mode).speed * 0.1 * 0.74, 8);
  },
);

it('combines Poison with the Baby Dragon Tantrum attack boost', () => {
  const { battle, defender, attacker } = poisonedDragon();
  defender.kind = 'babydragon';
  defender.level = 6;
  defender.cooldown = 1;
  defender.target = attacker.id;
  defender.engaged = true;
  stepGarrisonDefender(battle, defender, 0.1, () => {});
  expect(defender.tantrum).toBe(true);
  expect(defender.cooldown).toBeCloseTo(1 - 0.1 * 1.5 * 0.65, 9);
});

it('preserves the released version-60 garrison attack clock', () => {
  const { battle, defender, attacker } = poisonedDragon();
  delete battle.nativeDefenderPoison;
  defender.cooldown = 1;
  defender.target = attacker.id;
  defender.engaged = true;
  stepGarrisonDefender(battle, defender, 0.1, () => {});
  expect(defender.cooldown).toBeCloseTo(0.9, 9);
});

it('restores the garrison attack clock when poison expires', () => {
  const { battle, defender, attacker } = poisonedDragon();
  battle.elapsed = defender.poison!.until;
  defender.cooldown = 1;
  defender.target = attacker.id;
  defender.engaged = true;
  stepGarrisonDefender(battle, defender, 0.1, () => {});
  expect(defender.cooldown).toBeCloseTo(0.9, 9);
});

it('reconstructs actual garrison poison inputs across portable seeks and keeps version 60', async () => {
  const { defenderPoisonRecording } = await import('./fixtures/defender-poison');
  const { replayBattle, validateReplay, compatibleReplayVersion } =
    await import('../src/game/replay');
  const { makeReplayFile, parseReplayFile } = await import('../src/game/replay-file');
  const { data, snapshots, later, defenderId } = defenderPoisonRecording();
  expect(validateReplay(data)).toBe(true);
  expect(replayBattle(data.initial, 61).nativeDefenderPoison).toBe(true);
  expect(replayBattle(data.initial, 60).nativeDefenderPoison).toBeUndefined();
  const viewer = new GameModel();
  expect(viewer.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data))))).toBe(true);
  for (const snapshot of [...snapshots].reverse()) {
    viewer.seekReplay(snapshot.at);
    while (viewer.replay!.seeking) viewer.step(0.05);
    expect(JSON.parse(JSON.stringify(viewer.battle))).toEqual(snapshot.battle);
  }
  viewer.seekReplay(later);
  while (viewer.replay!.seeking) viewer.step(0.05);
  const current = viewer.battle!.defenders!.find((defender) => defender.id === defenderId)!;
  expect(current.poison?.attack).toBe(-0.35);
  const cooldown = current.cooldown;
  expect(compatibleReplayVersion(60)).toBe(true);
  expect(viewer.openReplay({ ...data, version: 60 })).toBe(true);
  viewer.seekReplay(later);
  while (viewer.replay!.seeking) viewer.step(0.05);
  const old = viewer.battle!.defenders!.find((defender) => defender.id === defenderId)!;
  expect(old.cooldown).not.toBe(cooldown);
});
