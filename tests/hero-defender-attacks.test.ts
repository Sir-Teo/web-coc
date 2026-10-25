import { expect, it } from 'vitest';
import { GameModel, type Battle } from '../src/game/model';
import type { HeroKind } from '../src/game/native-hero-data';
import { heroDefenderBattle, heroDefenderRecording } from './fixtures/hero-defender-attacks';
import {
  statsFor,
  stepNativeUnit,
  resolveNativeImpact,
  type NativeTroopContext,
} from '../src/game/native-troops';
import { unitDamageScale } from '../src/game/native-status';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';

function context(battle: Battle): NativeTroopContext {
  return {
    battle,
    buildings: battle.buildings,
    buildingsById: new Map(battle.buildings.map((b) => [b.id, b])),
    passableWalls: new Set(),
    nextId: () => 3000,
    troopLevel: () => 1,
    damageBuilding: () => {},
    effect: () => {},
  };
}
function attack(kind: HeroKind, air = false, version?: number) {
  const { model, battle } = heroDefenderBattle(kind, 1, [], version, air);
  model.deployNativeHero(kind, 5, 6.5);
  const hero = battle.nativeHeroes![0];
  const unit = battle.units.find((u) => u.id === hero.unitId)!;
  const enemy = battle.defenders!.find((d) => d.kind === 'hero')!;
  enemy.x = 5.5;
  enemy.home.x = 5.5;
  enemy.alerted = true;
  unit.defenderTarget = enemy.id;
  const source = statsFor(battle, unit);
  const damage = source.damage * unitDamageScale(unit, battle.elapsed);
  const ctx = context(battle);
  stepNativeUnit(ctx, unit, { damage, speed: source.speed }, 0.05);
  return { model, battle, unit, enemy, source, damage, ctx };
}

for (const air of [false, true]) {
  it.each(['warden', 'duke'] as HeroKind[])(
    `uses a direct source hit for %s against air=${air}`,
    (kind) => {
      const { battle, enemy, source, damage } = attack(kind, air);
      expect(source.projectile).toBe('');
      expect(battle.projectiles?.length ?? 0).toBe(0);
      expect(enemy.maxHp - enemy.hp).toBeCloseTo(damage, 9);
    },
  );
  it.each(['queen', 'prince', 'champion'] as HeroKind[])(
    `captures the source projectile for %s against air=${air}`,
    (kind) => {
      const { battle, enemy, source, damage } = attack(kind, air);
      const shot = battle.projectiles![0];
      expect(shot.native?.name).toBe(source.projectile);
      expect(shot.targetDefender).toBe(true);
      expect(shot.toAir).toBe(air);
      expect(shot.damage).toBeCloseTo(damage, 9);
      expect(enemy.hp).toBe(enemy.maxHp);
    },
  );
}

it('keeps the King ground-only with a direct melee hit', () => {
  const ground = attack('king');
  expect(ground.enemy.maxHp - ground.enemy.hp).toBeCloseTo(ground.damage, 9);
  const air = attack('king', true);
  expect(air.enemy.hp).toBe(air.enemy.maxHp);
  expect(air.battle.projectiles?.length ?? 0).toBe(0);
});

it.each(['queen', 'warden', 'duke'] as HeroKind[])(
  'preserves the version 87 generic packet for %s',
  (kind) => {
    const { battle, enemy } = attack(kind, false, 87);
    expect(enemy.hp).toBe(enemy.maxHp);
    expect(battle.projectiles![0].weapon).toBe(kind === 'duke' ? 'bomb' : 'arrow');
    expect(battle.projectiles![0].native).toBeUndefined();
  },
);

it.each([1, 110])('uses the source Queen level %s arrow and speed', (level) => {
  const { model, battle } = heroDefenderBattle('queen', level);
  model.deployNativeHero('queen', 5, 6.5);
  const unit = battle.units[0];
  const enemy = battle.defenders!.find((d) => d.kind === 'hero')!;
  enemy.x = 9;
  enemy.alerted = true;
  unit.defenderTarget = enemy.id;
  const source = statsFor(battle, unit);
  stepNativeUnit(context(battle), unit, { damage: source.damage, speed: source.speed }, 0.05);
  const p = battle.projectiles![0];
  expect(p.native?.name).toBe(level === 1 ? 'ArcherQueen arrow lvl1' : 'ArcherQueen arrow lvl3');
  expect(p.impact - p.launched).toBeCloseTo(Math.hypot(p.x - p.fromX, p.y - p.fromY) / 16.5, 12);
});

it('uses the Monolith Arrow projectile without requiring paired frost equipment', () => {
  const { model, battle } = heroDefenderBattle('queen', 1, [{ slug: 'monolith-arrow', level: 27 }]);
  model.deployNativeHero('queen', 5, 6.5);
  const unit = battle.units[0];
  const enemy = battle.defenders!.find((d) => d.kind === 'hero')!;
  enemy.alerted = true;
  unit.defenderTarget = enemy.id;
  const source = statsFor(battle, unit);
  stepNativeUnit(context(battle), unit, { damage: source.damage, speed: source.speed }, 0.05);
  expect(battle.projectiles![0].native?.name).toBe('ArcherQueenMonolithProjectile3');
});

it('uses the captured Queen hit deadline when sampled after a lethal impact', () => {
  const { battle, enemy, ctx } = attack('queen');
  const shot = battle.projectiles![0];
  enemy.hp = shot.damage;
  battle.elapsed = shot.impact + 1;
  resolveNativeImpact(ctx, shot);
  expect(enemy.hp).toBe(0);
  expect(enemy.defeatedAt).toBe(shot.impact);
});

it('keeps the version 87 lethal frost timestamp on its original sampling clock', () => {
  const { model, battle } = heroDefenderBattle(
    'queen',
    1,
    [{ slug: 'frozen-arrow', level: 1 }],
    87,
  );
  model.deployNativeHero('queen', 5, 6.5);
  const unit = battle.units[0];
  const enemy = battle.defenders!.find((d) => d.kind === 'hero')!;
  enemy.x = 5.5;
  enemy.alerted = true;
  unit.defenderTarget = enemy.id;
  const source = statsFor(battle, unit);
  const ctx = context(battle);
  stepNativeUnit(ctx, unit, { damage: source.damage, speed: source.speed }, 0.05);
  const shot = battle.projectiles![0];
  enemy.hp = shot.damage;
  battle.elapsed = shot.impact + 1;
  resolveNativeImpact(ctx, shot);
  expect(enemy.defeatedAt).toBe(battle.elapsed);
});

it('does not let an overdue Queen arrow hit a defender born after its impact deadline', () => {
  const { battle, enemy, ctx } = attack('queen');
  const shot = battle.projectiles![0];
  enemy.spawnedAt = shot.impact + 0.01;
  battle.elapsed = shot.impact + 1;
  resolveNativeImpact(ctx, shot);
  expect(enemy.hp).toBe(enemy.maxHp);
});

it('gives a Queen copy its native base arrow without borrowing roster equipment', () => {
  const { model, battle } = heroDefenderBattle('queen', 1, [{ slug: 'frozen-arrow', level: 1 }]);
  model.deployNativeHero('queen', 5, 6.5);
  const copy = { ...structuredClone(battle.units[0]), id: 9999 };
  const enemy = battle.defenders!.find((d) => d.kind === 'hero')!;
  enemy.x = 5.5;
  enemy.alerted = true;
  copy.defenderTarget = enemy.id;
  battle.units.push(copy);
  const source = statsFor(battle, copy);
  stepNativeUnit(context(battle), copy, { damage: source.damage, speed: source.speed }, 0.05);
  expect(battle.projectiles![0].native).toMatchObject({ name: 'ArcherQueen arrow lvl1' });
  expect(battle.projectiles![0].native?.frost).toBeUndefined();
});

it.each(['queen', 'warden', 'duke'] as const)(
  'reconstructs actual %s defender attacks through portable backward seeks',
  (kind) => {
    const { data, snapshots, shots, hits } = heroDefenderRecording(kind);
    if (kind === 'queen') expect(shots[0].native?.name).toBe('ArcherQueen arrow lvl1');
    else {
      expect(shots).toEqual([]);
      expect(hits.length).toBeGreaterThan(0);
    }
    const viewer = new GameModel();
    expect(viewer.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data))))).toBe(true);
    for (const snapshot of [...snapshots].reverse()) {
      viewer.seekReplay(snapshot.at);
      while (viewer.replay!.seeking) viewer.step(0.05);
      expect(JSON.parse(JSON.stringify(viewer.battle))).toEqual(snapshot.battle);
    }
  },
);

it('retains an airborne Queen arrow after actual Recall removes its shooter', () => {
  const { data, snapshots, recalled, unitId } = heroDefenderRecording('queen', true);
  expect(recalled).toBeDefined();
  const viewer = new GameModel();
  expect(viewer.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data))))).toBe(true);
  for (const snapshot of [...snapshots].reverse()) {
    viewer.seekReplay(snapshot.at);
    while (viewer.replay!.seeking) viewer.step(0.05);
    expect(JSON.parse(JSON.stringify(viewer.battle))).toEqual(snapshot.battle);
    if (snapshot.at >= recalled!)
      expect(viewer.battle!.units.some((u) => u.id === unitId)).toBe(false);
  }
});
