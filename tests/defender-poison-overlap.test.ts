import { expect, it } from 'vitest';
import { GameModel, makeBuilding } from '../src/game/model';
import { emptyArmy, emptySpells } from '../src/game/army';
import { castNativeSpell, stepNativeSpells } from '../src/game/native-spells';
import { spawnGarrisonDefender } from '../src/game/garrison-combat';
import { defendingHero } from '../src/game/defending-heroes';
import { createGuardian } from '../src/game/native-guardians';

function arena(
  levels: number[],
  offsets: number[] = [],
  kind: 'dragon' | 'hero' | 'guardian' = 'dragon',
  legacy = false,
) {
  const model = new GameModel();
  model.state.obstacles = [];
  model.state.buildings = [makeBuilding(1, 'townhall', 36, 36, 18)];
  model.state.nextId = 100;
  model.state.army = { ...emptyArmy(), giant: 1 };
  model.state.spells = emptySpells();
  model.state.king = undefined;
  model.startBattle(0, true);
  const battle = model.battle!;
  if (legacy) delete battle.nativeDefenderPoisonOverlap;
  const defender =
    kind === 'hero'
      ? defendingHero({ kind: 'king', level: 1, x: 10, y: 10 }, 0)
      : kind === 'guardian'
        ? createGuardian(battle, battle.buildings[0], -2)!
        : spawnGarrisonDefender(battle, 'dragon', 5, 1, 10, 10, 0);
  defender.x = 10;
  defender.y = 10;
  defender.spawnedAt = 0;
  battle.defenders = [defender];
  for (const [i, level] of levels.entries())
    castNativeSpell(battle, 'Poison', level, 'attack', 10, 10, { at: offsets[i] ?? 0 });
  const hp = defender.hp;
  const first = Math.min(...battle.nativeSpells!.map((cast) => cast.firstHit));
  const until = (at: number) => {
    while (battle.elapsed < at - 1e-9) {
      battle.elapsed = Math.round((battle.elapsed + 0.05) * 1e9) / 1e9;
      stepNativeSpells({ battle, damageBuilding: () => {}, effect: () => {} });
    }
  };
  return { battle, defender, first, until, damage: () => hp - defender.hp };
}

it('fully ramped native Poison clouds never exceed their maximum DPS', () => {
  for (const levels of [[1], [1, 1]]) {
    const { defender, first, until } = arena(levels);
    until(first + 5.6);
    const hp = defender.hp;
    until(first + 6);
    expect(hp - defender.hp).toBeCloseTo(90 * 0.4, 9);
  }
});

it('caps staggered clouds at the same maximum damage rate', () => {
  const { defender, first, until } = arena([1, 1], [0, 0.2]);
  until(first + 6);
  const hp = defender.hp;
  until(first + 7.2);
  expect(hp - defender.hp).toBeCloseTo(90 * 1.2, 8);
});

it('retains the faster initial ramp from overlapping clouds', () => {
  const single = arena([1]);
  const double = arena([1, 1]);
  for (const run of [single, double]) run.until(run.first);
  expect(double.damage()).toBeCloseTo(single.damage() * 2, 8);
  expect(double.damage()).toBeLessThan(90 * 0.4);
});

it('keeps the strongest slow and maximum DPS regardless of cloud ordering', () => {
  const a = arena([1, 12]);
  const b = arena([12, 1]);
  for (const run of [a, b]) run.until(run.first + 6);
  expect(a.damage()).toBeCloseTo(b.damage(), 8);
  for (const run of [a, b]) {
    expect(run.defender.poison).toMatchObject({ speed: -0.52, attack: -0.74 });
    const hp = run.defender.hp;
    run.until(run.first + 6.4);
    expect(hp - run.defender.hp).toBeCloseTo(380 * 0.4, 8);
  }
});

it.each([
  ['hero', 0.05],
  ['guardian', 0.3],
] as const)('retains %s damage scaling under the shared cap', (kind, scale) => {
  const { defender, first, until } = arena([1, 1], [], kind);
  until(first + 5.6);
  const hp = defender.hp;
  until(first + 6);
  expect(hp - defender.hp).toBeCloseTo(90 * 0.4 * scale, 8);
});

it('keeps the version-61 overlapping-cloud damage calculation', () => {
  const { defender, first, until } = arena([1, 1], [], 'dragon', true);
  until(first + 5.6);
  const hp = defender.hp;
  until(first + 6);
  expect(hp - defender.hp).toBeCloseTo(90 * 0.4 * 2, 9);
  expect(defender.poison!.damage).toBeUndefined();
});

it('reconstructs staggered recorded clouds through portable backward seeks and version 61', async () => {
  const { defenderPoisonRecording } = await import('./fixtures/defender-poison');
  const { replayBattle, validateReplay, compatibleReplayVersion } =
    await import('../src/game/replay');
  const { makeReplayFile, parseReplayFile } = await import('../src/game/replay-file');
  const { data, snapshots, later, defenderId } = defenderPoisonRecording(2);
  expect(validateReplay(data)).toBe(true);
  expect(replayBattle(data.initial, 62).nativeDefenderPoisonOverlap).toBe(true);
  expect(replayBattle(data.initial, 61).nativeDefenderPoisonOverlap).toBeUndefined();
  const viewer = new GameModel();
  expect(viewer.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data))))).toBe(true);
  for (const snapshot of [...snapshots].reverse()) {
    viewer.seekReplay(snapshot.at);
    while (viewer.replay!.seeking) viewer.step(0.05);
    expect(JSON.parse(JSON.stringify(viewer.battle))).toEqual(snapshot.battle);
  }
  viewer.seekReplay(later);
  while (viewer.replay!.seeking) viewer.step(0.05);
  const hp = viewer.battle!.defenders!.find((defender) => defender.id === defenderId)!.hp;
  expect(compatibleReplayVersion(61)).toBe(true);
  expect(viewer.openReplay({ ...data, version: 61 })).toBe(true);
  viewer.seekReplay(later);
  while (viewer.replay!.seeking) viewer.step(0.05);
  expect(viewer.battle!.defenders!.find((defender) => defender.id === defenderId)!.hp).toBeLessThan(
    hp,
  );
});

it('drops an expired stronger cloud from the damage cap and slow', () => {
  const run = arena([12]);
  run.until(run.first);
  expect(run.defender.poison!.damage!.dps).toBe(380);
  run.battle.nativeSpells = [];
  run.until(run.first + 1);
  const next = castNativeSpell(run.battle, 'Poison', 1, 'attack', 10, 10);
  run.until(next.firstHit);
  expect(run.defender.poison).toMatchObject({
    speed: -0.26,
    attack: -0.35,
    damage: { dps: 90, cap: 36 },
  });
});
