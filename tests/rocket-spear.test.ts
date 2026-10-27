import { expect, it } from 'vitest';
import { GameModel, makeBuilding, type Battle } from '../src/game/model';
import { rocketSpearBattle, rocketSpearRecording } from './fixtures/rocket-spear';
import {
  statsFor,
  stepNativeUnit,
  resolveNativeImpact,
  type NativeTroopContext,
} from '../src/game/native-troops';
import { defendingHero } from '../src/game/defending-heroes';
import { spawnSkeleton } from '../src/game/defenders';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';

function context(battle: Battle): NativeTroopContext {
  return {
    battle,
    buildings: battle.buildings,
    buildingsById: new Map(battle.buildings.map((b) => [b.id, b])),
    passableWalls: new Set(),
    nextId: () => 3000,
    troopLevel: () => 1,
    damageBuilding: (b, amount) => {
      b.hp = Math.max(0, b.hp - amount);
    },
    effect: () => {},
  };
}

it.each([
  [1, 350, 7],
  [9, 560, 8],
  [18, 770, 9],
  [27, 980, 10],
])(
  'uses level %s source range, damage and native rocket for %s extra damage and %s throws',
  (level, extra, count) => {
    const { model, battle, unit, base } = rocketSpearBattle(level);
    model.activateNativeHeroAbility('champion');
    unit.target = 2;
    unit.native!.targetAt = 0;
    battle.elapsed = 1;
    const start = { x: unit.x, y: unit.y };
    stepNativeUnit(context(battle), unit, { damage: base.damage, speed: base.speed }, 0.05);
    const shot = battle.projectiles!.find((p) => p.sourceId === unit.id)!;
    expect({ x: unit.x, y: unit.y }).toEqual(start);
    expect(shot.native?.name).toBe('RocketSpearProjectile');
    expect(shot.damage).toBe(base.damage + extra);
    expect(shot.splash).toBe(0.9);
    expect(unit.native?.effects?.extraDamage?.hits).toBe(count - 1);
    expect(unit.native?.effects?.extraDamage?.range).toBe(10.05);
    expect(shot.impact - shot.launched).toBeCloseTo(10.5 / 12, 12);
  },
);

it.each([
  [1, 7, 350],
  [27, 10, 980],
])(
  'spends exactly %s-tier charges on throws and restores ordinary spears',
  (level, count, extra) => {
    const { model, battle, unit, base } = rocketSpearBattle(level);
    battle.buildings[1] = makeBuilding(2, 'airdefense', 7, 5, 16);
    model.activateNativeHeroAbility('champion');
    unit.target = 2;
    unit.native!.targetAt = 0;
    const ctx = context(battle);
    for (let i = 0; i <= count; i++) {
      battle.elapsed = 1 + i * 0.05;
      unit.cooldown = 0;
      stepNativeUnit(ctx, unit, { damage: base.damage, speed: base.speed }, 0.05);
      const shot = battle.projectiles!.at(-1)!;
      expect(shot.native?.name).toBe(i < count ? 'RocketSpearProjectile' : base.projectile);
      expect(shot.damage).toBe(base.damage + (i < count ? extra : 0));
      expect(shot.splash ?? 0).toBe(i < count ? 0.9 : 0);
    }
    expect(unit.native?.effects?.extraDamage).toBeUndefined();
  },
);

it('does not spend charges while cooling down, acquiring or approaching a distant target', () => {
  const { model, battle, unit, base } = rocketSpearBattle();
  model.activateNativeHeroAbility('champion');
  const ctx = context(battle);
  unit.cooldown = 1;
  stepNativeUnit(ctx, unit, { damage: base.damage, speed: base.speed }, 0.05);
  expect(unit.native?.effects?.extraDamage?.hits).toBe(7);
  unit.cooldown = 0;
  unit.x = 1;
  unit.y = 1;
  battle.elapsed = 1;
  stepNativeUnit(ctx, unit, { damage: base.damage, speed: base.speed }, 0.05);
  expect(unit.native?.effects?.extraDamage?.hits).toBe(7);
  expect(battle.projectiles ?? []).toHaveLength(0);
});

it('keeps Haste Vial active after the last rocket charge is spent', () => {
  const { model, battle, unit, base } = rocketSpearBattle(1, 81, [
    { slug: 'haste-vial', level: 18 },
  ]);
  battle.buildings[1] = makeBuilding(2, 'airdefense', 7, 5, 16);
  model.activateNativeHeroAbility('champion');
  unit.target = 2;
  unit.native!.targetAt = 0;
  const ctx = context(battle);
  for (let i = 0; i < 8; i++) {
    battle.elapsed = 1 + i * 0.05;
    unit.cooldown = 0;
    stepNativeUnit(ctx, unit, { damage: base.damage, speed: base.speed }, 0.05);
    expect(unit.cooldown).toBeCloseTo(0.6 / 1.16, 12);
  }
  expect(unit.native?.effects?.extraDamage).toBeUndefined();
  expect(unit.native?.effects?.attackInterval?.until).toBe(10);
  expect(battle.projectiles!.at(-1)!.native?.name).toBe('AmazonQueen_javelin');
  expect(battle.projectiles!.at(-1)!.damage).toBe(base.damage);
});

it('keeps the Champion jumping walls while chasing a defending unit with ordinary spears', () => {
  const { battle, unit, base } = rocketSpearBattle();
  battle.buildings = [
    makeBuilding(1, 'townhall', 36, 36, 18),
    ...Array.from({ length: 48 }, (_, y) => makeBuilding(100 + y, 'wall', 7, y, 1)),
  ];
  const target = defendingHero({ kind: 'king', level: 110, x: 12, y: 6.5 }, 0);
  target.alerted = true;
  battle.defenders = [target];
  unit.defenderTarget = target.id;
  const ctx = context(battle);
  for (let i = 1; i <= 100 && unit.x <= 8; i++) {
    battle.elapsed = i * 0.05;
    unit.cooldown -= 0.05;
    stepNativeUnit(ctx, unit, { damage: base.damage, speed: base.speed }, 0.05);
  }
  expect(unit.x).toBeGreaterThan(8);
  expect(battle.buildings.filter((b) => b.kind === 'wall').every((b) => b.hp === b.maxHp)).toBe(
    true,
  );
});

it.each([false, true])(
  'hits primary and nearby air=%s defenders once, using impact-time birth and death checks',
  (air) => {
    const { model, battle, unit, base } = rocketSpearBattle();
    battle.buildings = [makeBuilding(1, 'townhall', 36, 36, 18)];
    const primary = defendingHero(
      { kind: air ? 'prince' : 'king', level: air ? 95 : 110, x: 14, y: 6.5 },
      0,
    );
    primary.alerted = true;
    const secondary = defendingHero(
      { kind: air ? 'prince' : 'king', level: air ? 95 : 110, x: 14.5, y: 6.5 },
      1,
    );
    const otherLayer = defendingHero(
      { kind: air ? 'king' : 'prince', level: 1, x: 14.2, y: 6.5 },
      2,
    );
    battle.defenders = [primary, secondary, otherLayer];
    unit.defenderTarget = primary.id;
    model.activateNativeHeroAbility('champion');
    const ctx = context(battle);
    stepNativeUnit(ctx, unit, { damage: base.damage, speed: base.speed }, 0.05);
    const shot = battle.projectiles![0];
    expect(shot.native?.name).toBe('RocketSpearProjectile');
    const unborn = defendingHero({ kind: air ? 'prince' : 'king', level: 1, x: 14.3, y: 6.5 }, 3);
    unborn.spawnedAt = shot.impact + 0.1;
    const skeleton = spawnSkeleton(
      battle,
      makeBuilding(8, 'skeletontrap', 14, 6, 1),
      shot.impact + 0.1,
      0,
    );
    skeleton.mode = air ? 'air' : 'ground';
    battle.defenders!.push(unborn);
    const hp = [primary.hp, otherLayer.hp, unborn.hp, skeleton.hp];
    secondary.hp = shot.damage;
    battle.units = [];
    battle.nativeHeroes = [];
    battle.elapsed = shot.impact + 1;
    resolveNativeImpact(ctx, shot);
    expect(hp[0] - primary.hp).toBeCloseTo(shot.damage, 9);
    expect(secondary.hp).toBe(0);
    expect(secondary.defeatedAt).toBe(shot.impact);
    expect(otherLayer.hp).toBe(hp[1]);
    expect(unborn.hp).toBe(hp[2]);
    expect(skeleton.hp).toBe(hp[3]);
  },
);

it('preserves version 80 range, unspent charges and ordinary damage', () => {
  const { model, battle, unit, base } = rocketSpearBattle(1, 80);
  battle.buildings[1] = makeBuilding(2, 'airdefense', 7, 5, 16);
  model.activateNativeHeroAbility('champion');
  unit.target = 2;
  unit.native!.targetAt = 0;
  battle.elapsed = 1;
  stepNativeUnit(context(battle), unit, { damage: base.damage, speed: base.speed }, 0.05);
  expect(battle.projectiles![0].damage).toBe(base.damage);
  expect(battle.projectiles![0].native?.name).toBe(base.projectile);
  expect(unit.native?.effects?.extraDamage?.hits).toBe(7);
});

it.each([1, 27])(
  'reconstructs real level %s charge depletion and ordinary throws through portable backward seeks',
  (level) => {
    const { data, snapshots, shots, count, bonus, baseDamage, ordinary } =
      rocketSpearRecording(level);
    expect(
      shots
        .slice(0, count)
        .every(
          (s) =>
            s.projectile.native?.name === 'RocketSpearProjectile' &&
            s.projectile.damage === baseDamage + bonus,
        ),
    ).toBe(true);
    expect(shots[count].projectile.native?.name).toBe('AmazonQueen_javelin');
    expect(shots[count].projectile.damage).toBe(baseDamage);
    const viewer = new GameModel();
    expect(viewer.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data))))).toBe(true);
    for (const snapshot of [...snapshots].reverse()) {
      viewer.seekReplay(snapshot.at);
      while (viewer.replay!.seeking) viewer.step(0.05);
      expect(JSON.parse(JSON.stringify(viewer.battle))).toEqual(snapshot.battle);
    }
    expect(viewer.openReplay({ ...data, version: 80 })).toBe(true);
    viewer.seekReplay(ordinary);
    while (viewer.replay!.seeking) viewer.step(0.05);
    const current = snapshots.at(-1)!.battle as Battle;
    const damage = (b: Battle) => b.buildings.reduce((sum, b) => sum + b.maxHp - b.hp, 0);
    expect(damage(viewer.battle!)).toBeLessThan(damage(current));
  },
);
