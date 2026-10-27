import { expect, it } from 'vitest';
import { GameModel, makeBuilding, type Battle } from '../src/game/model';
import { spawnSkeleton, type Defender } from '../src/game/defenders';
import { spawnGarrisonDefender } from '../src/game/garrison-combat';
import { createGuardian } from '../src/game/native-guardians';
import type { HeroItemSetup } from '../src/game/native-heroes';
import {
  statsFor,
  stepNativeUnit,
  resolveNativeImpact,
  type NativeTroopContext,
} from '../src/game/native-troops';
import { heroDefenderBattle, heroDefenderRecording } from './fixtures/hero-defender-attacks';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';

function arena(level = 1, air = false, version?: number, extra: HeroItemSetup[] = []) {
  const { model, battle } = heroDefenderBattle(
    'queen',
    1,
    [{ slug: 'monolith-arrow', level }, ...extra],
    version,
    air,
  );
  model.deployNativeHero('queen', 5, 6.5);
  const unit = battle.units[0];
  const source = statsFor(battle, unit);
  const enemy = battle.defenders!.find((d) => d.kind === 'hero')!;
  const ctx: NativeTroopContext = {
    battle,
    buildings: battle.buildings,
    buildingsById: new Map(battle.buildings.map((b) => [b.id, b])),
    passableWalls: new Set(),
    nextId: () => 3000,
    troopLevel: () => 1,
    damageBuilding: () => {},
    effect: () => {},
  };
  const fire = (target: Defender = enemy, scale = 1) => {
    target.x = 8.5;
    target.y = 6.5;
    target.alerted = true;
    unit.defenderTarget = target.id;
    stepNativeUnit(ctx, unit, { damage: source.damage * scale, speed: source.speed }, 0.05);
    return battle.projectiles!.at(-1)!;
  };
  return { model, battle, unit, enemy, source, ctx, fire };
}

for (const [level, percentages] of [
  [1, [0.095, 0.07, 0.07, 0.04]],
  [27, [0.14, 0.1, 0.1, 0.05]],
] as const) {
  for (const air of [false, true]) {
    it.each([180, 181, 250, 251])(
      `captures level ${level} target-max-HP damage against air=${air} at %s housing`,
      (housing) => {
        const { battle, enemy, source, ctx, fire } = arena(level, air);
        battle.nativeMonolithHousing = housing;
        enemy.hp /= 2;
        const hp = enemy.hp;
        const percent = percentages[[180, 181, 250, 251].indexOf(housing)];
        const p = fire();
        expect(p.damage).toBeCloseTo(source.damage + enemy.maxHp * percent, 9);
        expect(p.toAir).toBe(air);
        expect(enemy.hp).toBe(hp);
        resolveNativeImpact(ctx, p);
        expect(enemy.hp).toBeCloseTo(hp - p.damage, 9);
      },
    );
  }
}

it.each(['hero', 'garrison', 'skeleton', 'guardian'] as const)(
  'applies the bonus to an actual %s defender',
  (kind) => {
    const { battle, enemy, source, fire, ctx } = arena();
    let target: Defender = enemy;
    if (kind === 'garrison') target = spawnGarrisonDefender(battle, 'archer', 9, 2, 8.5, 6.5, 0);
    if (kind === 'skeleton')
      target = spawnSkeleton(battle, makeBuilding(2, 'skeletontrap', 8, 6, 1), 0, 0);
    if (kind === 'guardian') {
      target = createGuardian(
        battle,
        {
          ...makeBuilding(2, 'townhall', 8, 6, 18),
          guardian: 'smasher',
        },
        -20000,
      )!;
      target.phase = 'fighting';
      target.spawnedAt = 0;
    }
    battle.defenders = [target];
    const p = fire(target);
    expect(p.damage).toBeCloseTo(source.damage + target.maxHp * 0.095, 9);
    resolveNativeImpact(ctx, p);
    expect(target.hp).toBeCloseTo(Math.max(0, target.maxHp - p.damage), 9);
  },
);

it.each([0.5, 2])('leaves the HP bonus independent of a %s attack damage scale', (scale) => {
  const { source, enemy, fire } = arena();
  expect(fire(enemy, scale).damage).toBeCloseTo(source.damage * scale + enemy.maxHp * 0.095, 9);
});

it('retains captured housing, target max HP and frost after the Queen is removed', () => {
  const { battle, enemy, fire, ctx } = arena(1, false, undefined, [
    { slug: 'frozen-arrow', level: 1 },
  ]);
  const p = fire();
  expect(p.native?.name).toBe('ArcherQueenMonolithProjectile3');
  expect(p.native?.frost).toEqual({ seconds: 0.75, percent: 0.25 });
  battle.nativeMonolithHousing = 251;
  battle.units = [];
  battle.nativeHeroes = [];
  enemy.maxHp *= 2;
  const hp = enemy.hp;
  battle.elapsed = p.impact + 0.1;
  resolveNativeImpact(ctx, p);
  expect(hp - enemy.hp).toBeCloseTo(p.damage, 9);
  expect(enemy.frost).toEqual({ until: p.impact + 0.75, percent: 0.25 });
});

it('does not give a Queen copy the roster item bonus', () => {
  const { battle, unit, enemy, ctx } = arena();
  const copy = { ...structuredClone(unit), id: 9999, defenderTarget: enemy.id };
  enemy.alerted = true;
  battle.units.push(copy);
  const source = statsFor(battle, copy);
  stepNativeUnit(ctx, copy, { damage: source.damage, speed: source.speed }, 0.05);
  expect(battle.projectiles![0].damage).toBe(source.damage);
  expect(battle.projectiles![0].native?.name).toBe('ArcherQueen arrow lvl1');
});

it('preserves version 88 native Monolith arrows without the defender HP bonus', () => {
  const { fire, source } = arena(27, false, 88);
  const p = fire();
  expect(p.native?.name).toBe('ArcherQueenMonolithProjectile3');
  expect(p.damage).toBe(source.damage);
});

it.each([false, true])(
  'reconstructs real air=%s Monolith hits after Recall in portable backward seeks',
  (air) => {
    const r = heroDefenderRecording(
      'queen',
      true,
      [
        { slug: 'monolith-arrow', level: 1 },
        { slug: 'frozen-arrow', level: 1 },
      ],
      air,
    );
    const viewer = new GameModel();
    expect(viewer.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(true);
    const initial = r.snapshots[0].battle as Battle;
    const initialEnemy = initial.defenders!.find((d) => d.id === r.enemyId)!;
    const queen = initial.units.find((u) => u.id === r.unitId)!;
    const base = statsFor(initial, queen).damage;
    expect(r.shots[0].damage).toBeCloseTo(base + initialEnemy.maxHp * 0.095, 9);
    for (const snapshot of [...r.snapshots].reverse()) {
      viewer.seekReplay(snapshot.at);
      while (viewer.replay!.seeking) viewer.step(0.05);
      expect(JSON.parse(JSON.stringify(viewer.battle))).toEqual(snapshot.battle);
      if (snapshot.at >= r.recalled!)
        expect(viewer.battle!.units.some((u) => u.id === r.unitId)).toBe(false);
    }
  },
);
