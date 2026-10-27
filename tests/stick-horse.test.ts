import { expect, it } from 'vitest';
import { GameModel, makeBuilding, type Battle } from '../src/game/model';
import {
  stickHorseBattle,
  stickHorseRecording,
  stickHorseWallRecording,
} from './fixtures/stick-horse';
import { heroAttackInterval } from '../src/game/native-hero-abilities';
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
    damageBuilding: (b, damage) => {
      b.hp -= damage;
    },
    effect: () => {},
  };
}

it.each([
  [1, 1.17, 12, 1.2],
  [3, 1.14, 14, 1.4],
  [6, 1.11, 16, 1.6],
  [9, 1.08, 18, 1.8],
  [12, 1.05, 20, 2],
  [15, 1.02, 22, 2.2],
  [18, 0.99, 24, 2.4],
  [21, 0.96, 26, 2.6],
  [24, 0.93, 28, 2.8],
  [27, 0.9, 30, 3],
])(
  'applies level %s source interval %s, duration %s and movement bonus %s before the first combat sample',
  (level, interval, duration, speed) => {
    const { battle, hero, unit, base } = stickHorseBattle(level);
    expect(hero.abilityUsed).toBeFalsy();
    expect(unit.native?.effects?.attackInterval).toEqual({ until: duration, seconds: interval });
    expect(unit.native?.effects?.jumpUntil).toBe(duration);
    expect(unit.native?.effects?.boost?.speed).toBe(speed);
    battle.elapsed = 1;
    unit.x = 6.5;
    unit.target = 2;
    unit.native!.targetAt = 0;
    const before = battle.buildings[1].hp;
    stepNativeUnit(context(battle), unit, { damage: base.damage, speed: base.speed }, 0.05);
    expect(unit.cooldown).toBeCloseTo(interval, 12);
    expect(before - battle.buildings[1].hp).toBeCloseTo(base.damage, 12);
    expect(heroAttackInterval(unit, duration, base.rate)).toBe(base.rate);
  },
);

it('applies the movement bonus on the very first simulation sample', () => {
  const { model, unit, base } = stickHorseBattle();
  model.step(0.05);
  expect(Math.hypot(unit.x - 5, unit.y - 6.5)).toBeCloseTo((base.speed + 1.2) * 0.05, 12);
});

it('does not restart the deployment boost on an ability press or Recall redeployment', () => {
  const { model, battle, hero, unit } = stickHorseBattle(1, undefined, false, [], true);
  model.step(0.05);
  expect(model.activateNativeHeroAbility('king')).toBe(true);
  expect(unit.native?.effects?.attackInterval?.until).toBe(12);
  model.activeSpell = 'recall';
  expect(model.castSpell(unit.x, unit.y)).toBe(true);
  while (hero.unitId !== null) {
    expect(battle.elapsed).toBeLessThan(10);
    model.step(0.05);
  }
  expect(model.deployNativeHero('king', 5, 6.5)).toBe(true);
  const deployed = battle.units.find((u) => u.id === hero.unitId)!;
  expect(deployed.native?.effects?.attackInterval).toBeUndefined();
  model.step(0.05);
  expect(deployed.native?.effects?.attackInterval).toBeUndefined();
  expect(deployed.native?.effects?.jumpUntil).toBeUndefined();
});

it('combines the source interval with passive Vampstache speed without changing hit damage', () => {
  const { battle, unit, base } = stickHorseBattle(27, undefined, false, [
    { slug: 'vampstache', level: 18 },
  ]);
  battle.elapsed = 1;
  unit.x = 6.5;
  unit.target = 2;
  unit.native!.targetAt = 0;
  const before = battle.buildings[1].hp;
  stepNativeUnit(context(battle), unit, { damage: base.damage, speed: base.speed }, 0.05);
  expect(unit.cooldown).toBeCloseTo(0.9 / 1.22, 12);
  expect(before - battle.buildings[1].hp).toBeCloseTo(base.damage, 12);
});

it.each(['normal', 'poison', 'frost'] as const)(
  'uses the temporary interval against a defender with %s status',
  (status) => {
    const { battle, unit, base } = stickHorseBattle(27);
    battle.buildings = [makeBuilding(1, 'townhall', 36, 36, 18)];
    const target = defendingHero({ kind: 'king', level: 110, x: 5.5, y: 6.5 }, 0);
    target.alerted = true;
    battle.defenders = [target];
    unit.defenderTarget = target.id;
    battle.elapsed = 1;
    if (status === 'poison')
      unit.native!.effects!.poison = {
        since: 0,
        until: 100,
        speed: -0.35,
        attackSpeed: -0.35,
        dps: 0,
      };
    if (status === 'frost') unit.native!.effects!.chill = { until: 100, percent: 0.5 };
    stepNativeUnit(context(battle), unit, { damage: base.damage, speed: base.speed }, 0.05);
    expect(unit.cooldown).toBeCloseTo(
      0.9 / (status === 'poison' ? 0.65 : status === 'frost' ? 0.5 : 1),
      12,
    );
    expect(target.maxHp - target.hp).toBeCloseTo(base.damage, 9);
  },
);

it.each([false, true])('crosses intact walls while pursuing defender=%s', (defender) => {
  const { model, battle, unit } = stickHorseBattle(1, undefined, true);
  if (defender) {
    const target = defendingHero({ kind: 'king', level: 110, x: 14, y: 6.5 }, 0);
    target.alerted = true;
    // Freeze the defending Hero so this checks the attacker's route through a fixed barrier.
    target.frozenUntil = 100;
    battle.defenders = [target];
    unit.defenderTarget = target.id;
  }
  for (let i = 0; i < 80 && unit.x < 10; i++) model.step(0.05);
  expect(unit.x).toBeGreaterThan(9);
  expect(battle.buildings.filter((b) => b.kind === 'wall').every((b) => b.hp === b.maxHp)).toBe(
    true,
  );
});

it('invalidates a jumping route at the exact expiry and resumes attacking intact blocking walls', () => {
  const { battle, unit, base } = stickHorseBattle(1, undefined, true);
  const ctx = context(battle);
  battle.elapsed = 11.95;
  stepNativeUnit(ctx, unit, { damage: base.damage, speed: base.speed + 1.2 }, 0.05);
  expect(unit.path.some((p) => p.x >= 8)).toBe(true);
  for (let i = 0; i < 80; i++) {
    battle.elapsed = 12 + i * 0.05;
    unit.cooldown -= 0.05;
    unit.pathAt -= 0.05;
    stepNativeUnit(ctx, unit, { damage: base.damage, speed: base.speed }, 0.05);
  }
  expect(unit.x).toBeLessThan(8);
  expect(battle.buildings.some((b) => b.kind === 'wall' && b.hp < b.maxHp)).toBe(true);
  expect(unit.cooldown).toBeLessThanOrEqual(base.rate);
});

it('preserves version 82 deployment delay, ordinary attack rate and wall blocking', () => {
  const { model, battle, unit, base } = stickHorseBattle(27, 82, true);
  expect(unit.native?.effects?.attackInterval).toBeUndefined();
  for (let i = 0; i < 80; i++) model.step(0.05);
  expect(unit.x).toBeLessThan(8);
  expect(battle.buildings.some((b) => b.kind === 'wall' && b.hp < b.maxHp)).toBe(true);
  unit.x = 13.5;
  unit.y = 6.5;
  unit.target = 2;
  unit.native!.targetAt = 0;
  unit.cooldown = 0;
  stepNativeUnit(context(battle), unit, { damage: base.damage, speed: base.speed }, 0.05);
  expect(unit.cooldown).toBe(base.rate);
});

it.each([1, 27])(
  'reconstructs level %s deployment, boosted hits and expiry through portable backward seeks',
  (level) => {
    const { data, snapshots, hits, interval, baseInterval } = stickHorseRecording(level);
    expect(data.actions.some((a) => a.type === 'ability')).toBe(false);
    expect(hits.some((h) => h.boosted)).toBe(true);
    expect(hits.some((h) => !h.boosted)).toBe(true);
    for (const hit of hits)
      expect(hit.interval).toBeCloseTo(hit.boosted ? interval : baseInterval, 12);
    const viewer = new GameModel();
    expect(viewer.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data))))).toBe(true);
    for (const snapshot of [...snapshots].reverse()) {
      viewer.seekReplay(snapshot.at);
      while (viewer.replay!.seeking) viewer.step(0.05);
      expect(JSON.parse(JSON.stringify(viewer.battle))).toEqual(snapshot.battle);
    }
  },
);

it.each([1, 27])(
  'reconstructs level %s intact-wall traversal and preserves historical blocking',
  (level) => {
    const { data, crossed, snapshot, unitId } = stickHorseWallRecording(level);
    const viewer = new GameModel();
    expect(viewer.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data))))).toBe(true);
    for (const at of [crossed, 0, crossed]) {
      viewer.seekReplay(at);
      while (viewer.replay!.seeking) viewer.step(0.05);
      if (at === crossed) expect(JSON.parse(JSON.stringify(viewer.battle))).toEqual(snapshot);
    }
    expect(viewer.battle!.units.find((u) => u.id === unitId)!.x).toBeGreaterThan(9);
    expect(viewer.openReplay({ ...data, version: 82 })).toBe(true);
    viewer.seekReplay(crossed);
    while (viewer.replay!.seeking) viewer.step(0.05);
    expect(viewer.battle!.units.find((u) => u.id === unitId)!.x).toBeLessThan(8);
  },
);
