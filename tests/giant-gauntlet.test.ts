import { expect, it } from 'vitest';
import { GameModel, makeBuilding, type Battle, type Unit } from '../src/game/model';
import { gauntletBattle, gauntletRecording } from './fixtures/giant-gauntlet';
import { statsFor, stepNativeUnit, type NativeTroopContext } from '../src/game/native-troops';
import { defendingHero } from '../src/game/defending-heroes';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { buildingEffects } from '../src/game/native-status';

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
function swing(battle: Battle, unit: Unit) {
  unit.x = 6.5;
  const stats = statsFor(battle, unit);
  stepNativeUnit(context(battle), unit, { damage: stats.damage, speed: stats.speed }, 0.05);
  return stats.damage;
}

it.each([
  [1, 14, 0.2],
  [3, 14.5, 0.25],
  [6, 15, 0.3],
  [9, 15.5, 0.35],
  [12, 16, 0.4],
  [15, 16.5, 0.45],
  [18, 17, 0.5],
  [21, 17.5, 0.5],
  [24, 18, 0.55],
  [27, 19, 0.6],
])(
  'applies level %s ground splash for %s seconds alongside source damage reduction %s',
  (level, duration, shield) => {
    const { model, battle, unit } = gauntletBattle(level);
    expect(model.activateNativeHeroAbility('king')).toBe(true);
    expect(unit.native?.effects?.splash).toMatchObject({ until: duration, radius: 2.5 });
    expect(unit.native?.effects?.shield).toEqual({ until: duration, percent: shield });
    battle.elapsed = 1;
    unit.target = 2;
    unit.native!.targetAt = 0;
    const damage = swing(battle, unit);
    expect(battle.buildings[1].maxHp - battle.buildings[1].hp).toBeCloseTo(damage, 9);
    expect(battle.buildings[2].maxHp - battle.buildings[2].hp).toBeCloseTo(damage, 9);
    expect(battle.buildings[3].hp).toBe(battle.buildings[3].maxHp);
  },
);

it('keeps ordinary hits before activation and stops area damage at the exact expiry', () => {
  const { model, battle, unit } = gauntletBattle();
  unit.target = 2;
  unit.native!.targetAt = 0;
  battle.elapsed = 1;
  swing(battle, unit);
  expect(battle.buildings[2].hp).toBe(battle.buildings[2].maxHp);
  model.activateNativeHeroAbility('king');
  unit.cooldown = 0;
  battle.elapsed = 14.95;
  swing(battle, unit);
  const secondary = battle.buildings[2].hp;
  expect(secondary).toBeLessThan(battle.buildings[2].maxHp);
  unit.cooldown = 0;
  battle.elapsed = 15;
  const primary = battle.buildings[1].hp;
  const damage = swing(battle, unit);
  expect(battle.buildings[1].hp).toBeCloseTo(primary - damage, 9);
  expect(battle.buildings[2].hp).toBe(secondary);
});

it.each(['cooldown', 'freeze'] as const)('does not deal splash while held by %s', (held) => {
  const { model, battle, unit } = gauntletBattle();
  model.activateNativeHeroAbility('king');
  unit.target = 2;
  unit.native!.targetAt = 0;
  battle.elapsed = 1;
  if (held === 'cooldown') unit.cooldown = 1;
  else unit.native!.effects!.frozenUntil = 2;
  swing(battle, unit);
  expect(battle.buildings.slice(1).every((b) => b.hp === b.maxHp)).toBe(true);
});

it('hits nearby ground defenders from a building impact, excluding air, unborn and distant units', () => {
  const { model, battle, unit } = gauntletBattle();
  model.activateNativeHeroAbility('king');
  unit.target = 2;
  unit.native!.targetAt = 0;
  battle.elapsed = 1;
  const ground = defendingHero({ kind: 'king', level: 110, x: 9, y: 6.5 }, 0);
  const boundary = defendingHero({ kind: 'king', level: 110, x: 11, y: 6.5 }, 1);
  const outside = defendingHero({ kind: 'king', level: 110, x: 11.01, y: 6.5 }, 2);
  const air = defendingHero({ kind: 'prince', level: 95, x: 9, y: 6.5 }, 3);
  const future = defendingHero({ kind: 'king', level: 110, x: 9, y: 6.5 }, 4);
  future.spawnedAt = 2;
  battle.defenders = [ground, boundary, outside, air, future];
  const damage = swing(battle, unit);
  for (const d of [ground, boundary]) expect(d.maxHp - d.hp).toBeCloseTo(damage, 9);
  for (const d of [outside, air, future]) expect(d.hp).toBe(d.maxHp);
});

it('hits a primary defender once and splashes ground defenders and building footprints around it', () => {
  const { model, battle, unit } = gauntletBattle();
  model.activateNativeHeroAbility('king');
  const target = defendingHero({ kind: 'king', level: 110, x: 6.75, y: 6.5 }, 0);
  const ground = defendingHero({ kind: 'king', level: 110, x: 9.25, y: 6.5 }, 1);
  const outside = defendingHero({ kind: 'king', level: 110, x: 9.26, y: 6.5 }, 2);
  const air = defendingHero({ kind: 'prince', level: 95, x: 7, y: 6.5 }, 3);
  target.alerted = true;
  battle.defenders = [target, ground, outside, air];
  unit.defenderTarget = target.id;
  battle.elapsed = 1;
  const damage = swing(battle, unit);
  for (const d of [target, ground]) expect(d.maxHp - d.hp).toBeCloseTo(damage, 9);
  for (const d of [outside, air]) expect(d.hp).toBe(d.maxHp);
  expect(battle.buildings[1].maxHp - battle.buildings[1].hp).toBeCloseTo(damage, 9);
  expect(battle.buildings[2].hp).toBe(battle.buildings[2].maxHp);
});

it('reaches an invisible building with splash while leaving a buried Tesla and trap intact', () => {
  const { model, battle, unit } = gauntletBattle();
  model.activateNativeHeroAbility('king');
  buildingEffects(battle, battle.buildings[2]).invisibleUntil = 100;
  const tesla = makeBuilding(20, 'tesla', 10, 5, 16);
  const trap = makeBuilding(21, 'bomb', 10, 6, 1);
  battle.buildings.push(tesla, trap);
  unit.target = 2;
  unit.native!.targetAt = 0;
  battle.elapsed = 1;
  const damage = swing(battle, unit);
  expect(battle.buildings[2].maxHp - battle.buildings[2].hp).toBeCloseTo(damage, 9);
  expect(tesla.hp).toBe(tesla.maxHp);
  expect(trap.hp).toBe(trap.maxHp);
});

it('heals Vampstache once for the swing across multiple splash targets', () => {
  const { model, battle, unit } = gauntletBattle(27, undefined, [
    { slug: 'vampstache', level: 18 },
  ]);
  model.activateNativeHeroAbility('king');
  unit.hp = 100;
  unit.target = 2;
  unit.native!.targetAt = 0;
  battle.elapsed = 1;
  swing(battle, unit);
  expect(battle.buildings[2].hp).toBeLessThan(battle.buildings[2].maxHp);
  expect(unit.hp).toBe(400);
});

it('does not give a giant King wall-jumping movement', () => {
  const { model, battle, unit } = gauntletBattle();
  battle.buildings = [
    makeBuilding(1, 'townhall', 36, 36, 18),
    makeBuilding(2, 'clancastle', 14, 5, 14),
    ...Array.from({ length: 48 }, (_, y) => makeBuilding(100 + y, 'wall', 8, y, 18)),
  ];
  unit.x = 5;
  model.activateNativeHeroAbility('king');
  for (let i = 0; i < 80; i++) model.step(0.05);
  expect(unit.x).toBeLessThan(8);
  expect(battle.buildings.some((b) => b.kind === 'wall' && b.hp < b.maxHp)).toBe(true);
});

it('leaves Overgrowth immunity intact during actual splash attacks', () => {
  const { model, battle } = gauntletBattle();
  model.activateNativeHeroAbility('king');
  buildingEffects(battle, battle.buildings[2]).overgrownUntil = 100;
  for (let i = 0; i < 60 && battle.buildings[1].hp === battle.buildings[1].maxHp; i++)
    model.step(0.05);
  expect(battle.buildings[1].hp).toBeLessThan(battle.buildings[1].maxHp);
  expect(battle.buildings[2].hp).toBe(battle.buildings[2].maxHp);
});

it('does not grant equipment splash to a King copy outside the Hero roster', () => {
  const { model, battle, unit } = gauntletBattle();
  model.activateNativeHeroAbility('king');
  const copy = { ...structuredClone(unit), id: 9999, target: 2 };
  copy.native!.targetAt = 0;
  battle.units.push(copy);
  battle.elapsed = 1;
  swing(battle, copy);
  expect(battle.buildings[1].hp).toBeLessThan(battle.buildings[1].maxHp);
  expect(battle.buildings[2].hp).toBe(battle.buildings[2].maxHp);
});

it('stops jumping at Stick Horse expiry while the Gauntlet is still active', () => {
  const { model, battle, unit } = gauntletBattle(1, undefined, [{ slug: 'stick-horse', level: 1 }]);
  battle.buildings = [
    makeBuilding(1, 'townhall', 36, 36, 18),
    makeBuilding(2, 'clancastle', 14, 5, 14),
    ...Array.from({ length: 48 }, (_, y) => makeBuilding(100 + y, 'wall', 8, y, 18)),
  ];
  model.activateNativeHeroAbility('king');
  const ctx = context(battle);
  const stats = statsFor(battle, unit);
  for (let i = 0; i <= 31; i++) {
    battle.elapsed = 11.95 + i * 0.05;
    unit.cooldown -= 0.05;
    unit.pathAt -= 0.05;
    stepNativeUnit(
      ctx,
      unit,
      { damage: stats.damage, speed: stats.speed + (i === 0 ? 1.2 : 0) },
      0.05,
    );
  }
  expect(battle.elapsed).toBeLessThan(unit.native!.effects!.splash!.until);
  expect(unit.x).toBeLessThan(8);
  expect(battle.buildings.some((b) => b.kind === 'wall' && b.hp < b.maxHp)).toBe(true);
});

it('preserves version 84 primary-only hits despite stored Gauntlet metadata', () => {
  const { model, battle, unit } = gauntletBattle(27, 84);
  model.activateNativeHeroAbility('king');
  battle.elapsed = 1;
  unit.target = 2;
  unit.native!.targetAt = 0;
  const damage = swing(battle, unit);
  expect(battle.buildings[1].maxHp - battle.buildings[1].hp).toBeCloseTo(damage, 9);
  expect(battle.buildings[2].hp).toBe(battle.buildings[2].maxHp);
});

it.each([1, 27])(
  'reconstructs level %s real activation, splash and expiry through portable backward seeks',
  (level) => {
    const { data, snapshots, hits, ordinary } = gauntletRecording(level);
    expect(hits.some((h) => h.active)).toBe(true);
    const lastActive = hits.filter((h) => h.active).at(-1)!;
    const ordinaryHit = hits.find((h) => !h.active)!;
    expect(lastActive.secondary).toBe(lastActive.primary);
    expect(ordinaryHit.secondary).toBe(lastActive.secondary);
    expect(ordinaryHit.primary).toBeLessThan(ordinaryHit.secondary);
    const viewer = new GameModel();
    expect(viewer.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data))))).toBe(true);
    for (const snapshot of [...snapshots].reverse()) {
      viewer.seekReplay(snapshot.at);
      while (viewer.replay!.seeking) viewer.step(0.05);
      expect(JSON.parse(JSON.stringify(viewer.battle))).toEqual(snapshot.battle);
    }
    expect(viewer.openReplay({ ...data, version: 84 })).toBe(true);
    viewer.seekReplay(ordinary);
    while (viewer.replay!.seeking) viewer.step(0.05);
    expect(viewer.battle!.buildings[2].hp).toBe(viewer.battle!.buildings[2].maxHp);
  },
);
