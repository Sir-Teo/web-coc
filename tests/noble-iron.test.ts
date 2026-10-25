import { expect, it } from 'vitest';
import { GameModel, makeBuilding, type Battle } from '../src/game/model';
import {
  nobleIronBattle,
  nobleIronRecording,
  chargedHeroRecallRecording,
} from './fixtures/noble-iron';
import { refreshHeroPassives } from '../src/game/native-hero-abilities';
import { stepNativeUnit, type NativeTroopContext } from '../src/game/native-troops';
import { defendingHero } from '../src/game/defending-heroes';
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

it.each([
  [1, 350, 5, 10],
  [3, 420, 6, 10.5],
  [9, 560, 7, 11],
  [12, 630, 8, 11.5],
  [15, 700, 9, 11.5],
  [18, 770, 10, 12],
])(
  'grants level %s source damage and %s bonus across %s throws at %s tiles on deployment',
  (level, extra, count, range) => {
    const { battle, hero, unit, base } = nobleIronBattle(level);
    expect(hero.abilityUsed).toBeFalsy();
    expect(unit.native?.effects?.extraDamage).toMatchObject({
      amount: extra,
      hits: count,
      range,
      projectile: 'TurboStartProjectile',
    });
    unit.target = 2;
    unit.native!.targetAt = 0;
    battle.elapsed = 1;
    stepNativeUnit(context(battle), unit, { damage: base.damage, speed: base.speed }, 0.05);
    const shot = battle.projectiles![0];
    expect(unit.x).toBe(5);
    expect(shot.native?.name).toBe('TurboStartProjectile');
    expect(shot.fromAir).toBe(true);
    expect(shot.damage).toBe(base.damage + extra);
    expect(unit.native?.effects?.extraDamage?.hits).toBe(count - 1);
  },
);

it('spends the final shot once and does not refill during passive refresh or an ability press', () => {
  const { model, battle, hero, unit, base } = nobleIronBattle();
  battle.buildings[1] = makeBuilding(2, 'cannon', 7, 5, 21);
  unit.target = 2;
  unit.native!.targetAt = 0;
  const ctx = context(battle);
  for (let i = 0; i < 6; i++) {
    battle.elapsed = 1 + i * 0.05;
    unit.cooldown = 0;
    stepNativeUnit(ctx, unit, { damage: base.damage, speed: base.speed }, 0.05);
    expect(battle.projectiles!.at(-1)!.native?.name).toBe(
      i < 5 ? 'TurboStartProjectile' : 'MinionHeroAttackProjectile',
    );
    refreshHeroPassives(ctx, hero, unit);
  }
  expect(unit.native?.effects?.extraDamage).toBeUndefined();
  expect(model.activateNativeHeroAbility('prince')).toBe(true);
  refreshHeroPassives(ctx, hero, unit);
  expect(unit.native?.effects?.extraDamage).toBeUndefined();
});

it.each([false, true])(
  'applies charged damage to an air=%s defender through the native projectile',
  (air) => {
    const { battle, unit, base } = nobleIronBattle();
    battle.buildings = [makeBuilding(1, 'townhall', 36, 36, 18)];
    const d = defendingHero(
      { kind: air ? 'prince' : 'king', level: air ? 95 : 110, x: 14, y: 6.5 },
      0,
    );
    d.alerted = true;
    battle.defenders = [d];
    unit.defenderTarget = d.id;
    battle.elapsed = 1;
    stepNativeUnit(context(battle), unit, { damage: base.damage, speed: base.speed }, 0.05);
    expect(battle.projectiles![0].native?.name).toBe('TurboStartProjectile');
    expect(battle.projectiles![0].toAir).toBe(air);
    expect(battle.projectiles![0].damage).toBe(base.damage + 350);
  },
);

it('preserves version 81 deployment without Noble Iron charged shots', () => {
  expect(nobleIronBattle(18, 81).unit.native?.effects?.extraDamage).toBeUndefined();
});

it('does not grant a fresh Noble Iron batch after recalling a fully spent Prince', () => {
  const { model, battle, hero, unit } = nobleIronBattle(1, undefined, true);
  while (unit.native?.effects?.extraDamage) {
    expect(battle.elapsed).toBeLessThan(20);
    model.step(0.05);
  }
  model.activeSpell = 'recall';
  expect(model.castSpell(unit.x, unit.y)).toBe(true);
  while (hero.unitId !== null) {
    expect(battle.elapsed).toBeLessThan(25);
    model.step(0.05);
  }
  expect(hero.recalledAttackExtra).toBeUndefined();
  expect(model.deployNativeHero('prince', 5, 6.5)).toBe(true);
  const deployed = battle.units.find((u) => u.id === hero.unitId)!;
  expect(deployed.native?.effects?.extraDamage).toBeUndefined();
  model.step(0.05);
  expect(deployed.native?.effects?.extraDamage).toBeUndefined();
});

it.each([1, 18])(
  'reconstructs actual level %s deployment, depletion and ordinary shots through portable backward seeks',
  (level) => {
    const { data, snapshots, shots, count, bonus, baseDamage, ordinary } =
      nobleIronRecording(level);
    expect(data.actions.some((a) => a.type === 'ability')).toBe(false);
    expect(
      shots
        .slice(0, count)
        .every((p) => p.native?.name === 'TurboStartProjectile' && p.damage === baseDamage + bonus),
    ).toBe(true);
    expect(shots[count].native?.name).toBe('MinionHeroAttackProjectile');
    expect(shots[count].damage).toBe(baseDamage);
    const viewer = new GameModel();
    expect(viewer.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data))))).toBe(true);
    for (const snapshot of [...snapshots].reverse()) {
      viewer.seekReplay(snapshot.at);
      while (viewer.replay!.seeking) viewer.step(0.05);
      expect(JSON.parse(JSON.stringify(viewer.battle))).toEqual(snapshot.battle);
    }
    expect(viewer.openReplay({ ...data, version: 81 })).toBe(true);
    viewer.seekReplay(ordinary);
    while (viewer.replay!.seeking) viewer.step(0.05);
    const damage = (b: Battle) => b.buildings.reduce((sum, b) => sum + b.maxHp - b.hp, 0);
    expect(damage(viewer.battle!)).toBeLessThan(damage(snapshots.at(-1)!.battle as Battle));
  },
);

it.each(['prince', 'champion'] as const)(
  'retains remaining %s charges through actual Recall and redeployment',
  (kind) => {
    const { data, snapshots, fired, remaining, newId, bonus, baseDamage, shots } =
      chargedHeroRecallRecording(kind);
    const current = snapshots.at(-1)!.battle as Battle;
    expect(current.units.find((u) => u.id === newId)!.native?.effects?.extraDamage?.hits).toBe(
      remaining - 1,
    );
    expect(shots.find((p) => p.sourceId === newId)!.damage).toBe(baseDamage + bonus);
    const viewer = new GameModel();
    expect(viewer.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data))))).toBe(true);
    for (const snapshot of [...snapshots].reverse()) {
      viewer.seekReplay(snapshot.at);
      while (viewer.replay!.seeking) viewer.step(0.05);
      expect(JSON.parse(JSON.stringify(viewer.battle))).toEqual(snapshot.battle);
    }
    expect(viewer.openReplay({ ...data, version: 81 })).toBe(true);
    viewer.seekReplay(fired);
    while (viewer.replay!.seeking) viewer.step(0.05);
    expect(
      viewer.battle!.units.find((u) => u.id === newId)!.native?.effects?.extraDamage,
    ).toBeUndefined();
  },
);
