import { expect, it } from 'vitest';
import { GameModel, makeBuilding, type Battle, type Unit } from '../src/game/model';
import { nativeUnitStats } from '../src/game/native-units';
import {
  nativeHitPoison,
  applyDefenderHitPoison,
  tickDefenderHitPoison,
  defenderHitPoisonScales,
} from '../src/game/defender-hit-poison';
import { defenderPoisonScales } from '../src/game/defender-poison';
import { defendingHero, stepDefendingHeroes } from '../src/game/defending-heroes';
import { spawnSkeleton } from '../src/game/defenders';
import { spawnGarrisonDefender } from '../src/game/garrison-combat';
import { createGuardian, stepGuardian } from '../src/game/native-guardians';
import type { NativeTroopContext } from '../src/game/native-troops';
import { stepNativeUnit } from '../src/game/native-troops';
import type { Defender } from '../src/game/defenders';
import {
  defenderStatusTint,
  NATIVE_FREEZE_TINT,
  NATIVE_POISON_TINT,
} from '../src/game/unit-status-tint';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { validateReplay } from '../src/game/replay';
import { attackerHitPoisonRecording } from './fixtures/attacker-hit-poison';

const hh = () => nativeHitPoison(nativeUnitStats('headhunter', 1))!;

const targetUnit = (x: number, y: number): Unit => ({
  id: 500,
  kind: 'giant',
  x,
  y,
  hp: 2000,
  maxHp: 2000,
  cooldown: 100,
  target: null,
  path: [],
  pathAt: 0,
  attacking: false,
});

it('Poison Lizard ignores repairing Builders and unborn Skeletons when seeking unalerted units', () => {
  const model = new GameModel();
  model.startBattle(0, true);
  const battle = model.battle!;
  battle.buildings = [makeBuilding(1, 'townhall', 36, 36, 18)];
  const skeleton = spawnSkeleton(battle, makeBuilding(2, 'skeletontrap', 6, 5, 1), 10, 0);
  const builder: Defender = {
    id: -30000,
    kind: 'repairer',
    level: 2,
    sourceId: 99,
    mode: 'ground',
    x: 5.5,
    y: 5,
    hp: 100,
    maxHp: 100,
    spawnedAt: 0,
    cooldown: 0,
    target: null,
    path: [],
    pathAt: 0,
    attacking: false,
    readyAt: 0,
  };
  battle.defenders!.push(builder);
  const lizard: Unit = {
    ...targetUnit(5, 5),
    kind: 'poisonlizard',
    level: 1,
    cooldown: 0,
    defenderTarget: skeleton.id,
    native: {},
  };
  battle.units = [lizard];
  const stats = nativeUnitStats('poisonlizard', 1);
  const ctx: NativeTroopContext = {
    battle,
    buildings: battle.buildings,
    buildingsById: new Map([[1, battle.buildings[0]]]),
    passableWalls: new Set(),
    nextId: () => 1000,
    troopLevel: () => 1,
    damageBuilding: () => {},
    effect: () => {},
  };
  stepNativeUnit(ctx, lizard, { damage: stats.damage, speed: stats.speed }, 0.05);
  expect(lizard.defenderTarget).toBeUndefined();
  expect(battle.projectiles ?? []).toHaveLength(0);
});

it('slows actual defending Hero movement and its attack clock', () => {
  const run = (poisoned: boolean) => {
    const model = new GameModel();
    model.startBattle(0, true);
    const battle = model.battle!;
    battle.buildings = [makeBuilding(1, 'townhall', 36, 36, 18)];
    const hero = defendingHero({ kind: 'king', level: 110, x: 10, y: 10 }, 0);
    hero.cooldown = 1;
    battle.defenders = [hero];
    battle.units = [targetUnit(14, 10)];
    if (poisoned) applyDefenderHitPoison(hero, hh(), 0);
    battle.elapsed = 0.1;
    stepDefendingHeroes(battle, 0.1, () => {});
    const dx = hero.x - 10,
      dy = hero.y - 10;
    return { moved: Math.sqrt(dx * dx + dy * dy), clock: 1 - hero.cooldown };
  };
  const plain = run(false),
    poisoned = run(true);
  expect(plain.moved).toBeGreaterThan(0);
  expect(poisoned.moved / plain.moved).toBeCloseTo(0.6, 9);
  expect(poisoned.clock / plain.clock).toBeCloseTo(0.45, 9);
});

it('applies Guardian resistance to actual movement and attack-clock slows', () => {
  const run = (poisoned: boolean) => {
    const model = new GameModel();
    model.startBattle(0, true);
    const battle = model.battle!;
    const hall = { ...makeBuilding(1, 'townhall', 10, 10, 18), guardian: 'smasher' as const };
    battle.buildings = [hall];
    const guardian = createGuardian(battle, hall, -20000)!;
    guardian.phase = 'fighting';
    guardian.spawnedAt = 0;
    guardian.x = 12;
    guardian.y = 15;
    const target = targetUnit(12, 20);
    battle.units = [target];
    battle.defenders = [guardian];
    if (poisoned) applyDefenderHitPoison(guardian, hh(), 0);
    const ctx: NativeTroopContext = {
      battle,
      buildings: battle.buildings,
      buildingsById: new Map([[hall.id, hall]]),
      passableWalls: new Set(),
      nextId: () => 1000,
      troopLevel: () => 1,
      damageBuilding: () => {},
      effect: () => {},
    };
    battle.elapsed = 0.1;
    stepGuardian(ctx, guardian, 0.1);
    const dx = guardian.x - 12,
      dy = guardian.y - 15;
    const moved = Math.sqrt(dx * dx + dy * dy);
    target.x = guardian.x + 1;
    target.y = guardian.y;
    guardian.clock = 0;
    guardian.releaseAt = 100;
    battle.elapsed = 0.2;
    stepGuardian(ctx, guardian, 0.1);
    return { moved, clock: guardian.clock };
  };
  const plain = run(false),
    poisoned = run(true);
  expect(plain.moved).toBeGreaterThan(0);
  expect(poisoned.moved / plain.moved).toBeCloseTo(0.88, 9);
  expect(poisoned.clock / plain.clock).toBeCloseTo(0.835, 9);
});

it.each([
  [1, 220, -0.4, -0.55],
  [2, 260, -0.42, -0.6],
  [3, 280, -0.44, -0.65],
  [4, 300, -0.46, -0.68],
])('reads level %s Headhunter poison from its intrinsic ability', (level, dps, speed, attack) => {
  expect(nativeHitPoison(nativeUnitStats('headhunter', level))).toMatchObject({
    spell: 'Poison',
    level: level + 4,
    duration: 3,
    dps,
    speed,
    attack,
    heroDamageScale: 0.05,
    guardianDamageScale: 0.3,
    affectsAir: true,
  });
});

it.each([
  [1, 80, -0.26, -0.35],
  [15, 140, -0.42, -0.55],
])('reads level %s Poison Lizard hit poison', (level, dps, speed, attack) => {
  expect(nativeHitPoison(nativeUnitStats('poisonlizard', level))).toMatchObject({
    spell: 'PoisonLizardAttack',
    duration: 3,
    dps,
    speed,
    attack,
    heroDamageScale: 1,
    affectsAir: true,
  });
});

it.each(['hero', 'garrison', 'guardian', 'skeleton'] as const)(
  'ticks %s damage once, with class scaling and exact expiry',
  (kind) => {
    const model = new GameModel();
    model.startBattle(0, true);
    const battle = model.battle!;
    const defender =
      kind === 'hero'
        ? defendingHero({ kind: 'king', level: 1, x: 5, y: 5 }, 0)
        : kind === 'garrison'
          ? spawnGarrisonDefender(battle, 'dragon', 5, 1, 5, 5, 0)
          : kind === 'guardian'
            ? createGuardian(battle, makeBuilding(1, 'townhall', 30, 30, 18), -20000)!
            : spawnSkeleton(battle, makeBuilding(2, 'skeletontrap', 5, 5, 1), 0, 0);
    defender.spawnedAt = 0;
    defender.hp = defender.maxHp = 2000;
    applyDefenderHitPoison(defender, hh(), 1);
    const dps = kind === 'hero' ? 11 : kind === 'guardian' ? 66 : 220;
    expect(defender.hitPoison?.dps).toBe(dps);
    tickDefenderHitPoison(defender, 2);
    expect(defender.hp).toBe(2000 - dps);
    tickDefenderHitPoison(defender, 2);
    expect(defender.hp).toBe(2000 - dps);
    tickDefenderHitPoison(defender, 10);
    expect(defender.hp).toBe(2000 - dps * 3);
    expect(defender.hitPoison).toBeUndefined();
  },
);

it('refreshes duration with the strongest active components without rewinding damage time', () => {
  const defender = defendingHero({ kind: 'king', level: 1, x: 5, y: 5 }, 0);
  const hp = defender.hp;
  applyDefenderHitPoison(defender, nativeHitPoison(nativeUnitStats('headhunter', 4))!, 0);
  tickDefenderHitPoison(defender, 1);
  applyDefenderHitPoison(defender, hh(), 0.5);
  expect(defender.hitPoison).toMatchObject({
    ticked: 1,
    until: 3.5,
    dps: 15,
    speed: -0.46,
    attack: -0.68,
  });
  tickDefenderHitPoison(defender, 4);
  expect(hp - defender.hp).toBeCloseTo(15 * 3.5, 9);
});

it('uses the strongest area/on-hit slow and preserves Freeze-before-Poison color priority', () => {
  const model = new GameModel();
  model.startBattle(0, true);
  const battle = model.battle!;
  const defender = defendingHero({ kind: 'king', level: 1, x: 5, y: 5 }, 0);
  applyDefenderHitPoison(defender, hh(), 0);
  battle.elapsed = 0.5;
  defender.poison = { since: 0, until: 5, speed: -0.2, attack: -0.1 };
  expect(defenderPoisonScales(battle, defender).move).toBeCloseTo(0.6, 12);
  expect(defenderPoisonScales(battle, defender).attack).toBeCloseTo(0.45, 12);
  expect(defenderStatusTint(defender, 0.5)?.color).toBe(NATIVE_POISON_TINT);
  defender.frozenUntil = 1;
  expect(defenderStatusTint(defender, 0.5)?.color).toBe(NATIVE_FREEZE_TINT);
  expect(defenderStatusTint(defender, 1.5)?.color).toBe(NATIVE_POISON_TINT);
  const guardian = defenderHitPoisonScales(defender, 1.5, 0.3)!;
  expect(guardian.move).toBeCloseTo(0.88, 12);
  expect(guardian.attack).toBeCloseTo(0.835, 12);
});

it('does not apply hit poison to unborn defenders and clips a lethal tick to the defeat time', () => {
  const defender = defendingHero({ kind: 'king', level: 1, x: 5, y: 5 }, 0);
  defender.spawnedAt = 1;
  applyDefenderHitPoison(defender, hh(), 0);
  expect(defender.hitPoison).toBeUndefined();
  defender.hp = 11;
  applyDefenderHitPoison(defender, hh(), 1);
  tickDefenderHitPoison(defender, 3);
  expect(defender.hp).toBe(0);
  expect(defender.defeatedAt).toBe(2);
  expect(defender.hitPoison).toBeUndefined();
});

it.each([
  { kind: 'headhunter' as const, air: false },
  { kind: 'headhunter' as const, air: true },
  { kind: 'lizard' as const, air: false },
  { kind: 'lizard' as const, air: true },
])(
  'reconstructs actual $kind hits on an air=$air defender, Recall and expiry through portable backward seeks',
  ({ kind, air }) => {
    const { data, snapshots, hit, expired, defenderId, direct, total, dps, shots, recallAt } =
      // Compare the poison boundary using the same immediate-release timing in both engines.
      attackerHitPoisonRecording(kind, air, 180);
    if (kind === 'lizard') expect(shots.at(-1)!.impact).toBeGreaterThan(recallAt);
    expect(validateReplay(data)).toBe(true);
    const hitState = snapshots.find((snapshot) => snapshot.at === hit)!.battle as Battle;
    expect(hitState.defenders!.find((d) => d.id === defenderId)!.hitPoison?.dps).toBe(dps);
    const viewer = new GameModel();
    expect(viewer.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data))))).toBe(true);
    const seek = (at: number) => {
      viewer.seekReplay(at);
      while (viewer.replay!.seeking) viewer.step(0.05);
    };
    for (const snapshot of [...snapshots].reverse()) {
      seek(snapshot.at);
      expect(JSON.parse(JSON.stringify(viewer.battle))).toEqual(snapshot.battle);
    }
    const loss = () => {
      const defender = viewer.battle!.defenders!.find((d) => d.id === defenderId)!;
      return defender.maxHp - defender.hp;
    };
    seek(expired);
    expect(loss()).toBeCloseTo(total, 6);
    expect(viewer.battle!.defenders!.find((d) => d.id === defenderId)!.hitPoison).toBeUndefined();
    expect(viewer.openReplay({ ...data, version: 75 })).toBe(true);
    seek(expired);
    expect(loss()).toBeCloseTo(kind === 'headhunter' ? direct : 0, 6);
  },
);
