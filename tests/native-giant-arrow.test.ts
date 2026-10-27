import { expect, it } from 'vitest';
import { spawnSkeleton } from '../src/game/defenders';
import { GameModel, makeBuilding, type Unit } from '../src/game/model';
import { heroAbilities } from '../src/game/native-heroes';
import { num } from '../src/game/native-data';
import { MAP_SIZE } from '../src/game/grid';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { giantArrowBattle, nativeGiantArrowRecording } from './fixtures/native-giant-arrow';
import { launchArcherPiercing } from '../src/game/native-super-archer';
import { stepGiantArrows } from '../src/game/native-giant-arrow';
import type { NativeTroopContext } from '../src/game/native-troops';
import { activeBoost } from '../src/game/native-boost';

it.each(Array.from({ length: 18 }, (_, i) => i + 1))(
  'Giant Arrow level %s pierces with captured source damage and Air Defense bonus',
  (level) => {
    const { model, battle, until } = giantArrowBattle(level);
    const hp = new Map(battle.buildings.map((b) => [b.id, b.hp]));
    const ability = heroAbilities(battle.nativeHeroes![0]).find(
      (a) => a.name === 'ArcherQueenPierceProjectile',
    )!;
    expect(model.activateNativeHeroAbility('queen')).toBe(true);
    const shot = battle.nativeGiantArrows![0];
    expect(shot).toMatchObject({
      projectile: 'QueenPierceProjectile',
      speed: 35,
      radius: 1,
      damage: num(ability.row, 'Damage'),
      airDefenseMultiplier: 2,
      dirX: 1,
      dirY: 0,
      fromX: 6.9,
      fromY: 11.5,
    });
    expect(shot.fromX + shot.dirX * shot.length).toBe(MAP_SIZE);
    expect(model.activateNativeHeroAbility('queen')).toBe(false);
    until(0.65);
    for (const b of battle.buildings)
      expect(b.hp, `${level}:${b.id}`).toBe(
        Math.max(
          0,
          hp.get(b.id)! -
            ([2, 3, 4, 5].includes(b.id) ? shot.damage * (b.kind === 'airdefense' ? 2 : 1) : 0),
        ),
      );
    expect(new Set(shot.hit.map((h) => h.target.id)).size).toBe(shot.hit.length);
    expect(shot.hit.every((h, i) => !i || h.at >= shot.hit[i - 1].at)).toBe(true);
  },
);

it('copies the current wall heading before a defender or ordinary building target', () => {
  const { model, battle, queenId } = giantArrowBattle();
  const queen = battle.units.find((u) => u.id === queenId)!;
  battle.buildings.push(makeBuilding(9, 'wall', 10, 16, 18));
  queen.native!.wallTarget = 9;
  const defender = spawnSkeleton(battle, makeBuilding(30, 'skeletontrap', 14, 11, 1), 0, 0);
  queen.defenderTarget = defender.id;
  queen.target = 2;
  model.activateNativeHeroAbility('queen');
  const shot = battle.nativeGiantArrows![0];
  expect(shot.dirY / shot.dirX).toBeCloseTo((16.5 - queen.y) / (10.5 - queen.x), 12);
});

it('captures equipment damage independently of an actual Rage Spell boost', () => {
  const { model, battle, queenId, until } = giantArrowBattle();
  const queen = battle.units.find((u) => u.id === queenId)!;
  model.activeSpell = 'rage';
  expect(model.castSpell(queen.x, queen.y)).toBe(true);
  until(1.65);
  expect(activeBoost(queen.native!.effects!.boost, battle.elapsed)!.damage).toBeGreaterThan(0);
  expect(model.activateNativeHeroAbility('queen')).toBe(true);
  expect(battle.nativeGiantArrows![0].damage).toBe(750);
});

it('passes through an Overgrowth-immune contact once while still damaging invisible collateral', () => {
  const { model, battle, until } = giantArrowBattle();
  model.activateNativeHeroAbility('queen');
  const mine = battle.buildings.find((b) => b.id === 2)!,
    mineHp = mine.hp;
  const air = battle.buildings.find((b) => b.id === 3)!,
    airHp = air.hp;
  battle.buildingEffects = { 2: { overgrownUntil: 0.5 }, 3: { invisibleUntil: 10 } };
  until(0.65);
  expect(mine.hp).toBe(mineHp);
  expect(air.hp).toBe(Math.max(0, airHp - 1500));
  expect(battle.nativeGiantArrows![0].hit.filter((hit) => hit.target.id === 2)).toHaveLength(1);
  until(0.75);
  expect(mine.hp).toBe(mineHp);
});

it('resolves Giant Arrow and Super Archer arrivals in time order within the same late simulation sample', () => {
  const { model, battle, queenId } = giantArrowBattle();
  const target = makeBuilding(30, 'goldmine', 10, 10, 16);
  target.hp = 1000;
  battle.buildings = [target];
  const queen = battle.units.find((u) => u.id === queenId)!;
  queen.x = 6;
  const damage: { at: number; power: number }[] = [];
  const ctx: NativeTroopContext = {
    battle,
    buildings: battle.buildings,
    buildingsById: new Map([[target.id, target]]),
    passableWalls: new Set(),
    nextId: () => 1000,
    troopLevel: () => 1,
    damageBuilding: (b, power, at = battle.elapsed) => {
      damage.push({ at, power });
      b.hp = Math.max(0, b.hp - power);
    },
    effect: () => {},
  };
  const archer: Unit = {
    id: 200,
    kind: 'superarcher',
    level: 1,
    x: 6,
    y: 11.5,
    hp: 100,
    maxHp: 100,
    cooldown: 0,
    target: null,
    path: [],
    pathAt: 0,
    attacking: false,
  };
  // Enqueue the slower shot first to expose controller-order mistakes.
  launchArcherPiercing(ctx, archer, 1000, { building: target });
  model.activateNativeHeroAbility('queen');
  battle.elapsed = 1;
  stepGiantArrows(ctx);
  expect(damage.map((hit) => hit.power)).toEqual([750, 1000]);
  expect(damage[0].at).toBeLessThan(damage[1].at);
  expect(battle.nativeGiantArrows![0].hit.map((hit) => hit.target.id)).toEqual([target.id]);
  expect(battle.nativeArcherShots![0].hit.map((hit) => hit.target.id)).toEqual([target.id]);
  expect(target.hp).toBe(0);
});

it('hits both defender layers once and ignores off-path or later-born defenders', () => {
  const { model, battle, until } = giantArrowBattle();
  const defenders = [
    { mode: 'ground' as const, y: 12.5, born: 0 },
    { mode: 'air' as const, y: 10.5, born: 0 },
    { mode: 'ground' as const, y: 12.501, born: 0 },
    { mode: 'air' as const, y: 11.5, born: 1 },
  ].map(({ mode, y, born }, i) => {
    const source = makeBuilding(30 + i, 'skeletontrap', 0, 0, 1);
    source.skeletonMode = mode;
    const d = spawnSkeleton(battle, source, born, 0);
    Object.assign(d, { x: 18, y, hp: 10000, maxHp: 10000, stunnedUntil: 100 });
    return d;
  });
  model.activateNativeHeroAbility('queen');
  until(0.65);
  expect(defenders.map((d) => d.hp)).toEqual([9250, 9250, 10000, 10000]);
  until(0.75);
  expect(defenders.map((d) => d.hp)).toEqual([9250, 9250, 10000, 10000]);
});

it('keeps a launched arrow fighting after the Queen falls and clips its lifetime to the map', () => {
  const { model, battle, queenId, until } = giantArrowBattle();
  model.activateNativeHeroAbility('queen');
  const shot = battle.nativeGiantArrows![0];
  const queen = battle.units.find((u) => u.id === queenId)!;
  queen.hp = 0;
  queen.spent = true;
  for (const kind of Object.keys(battle.remaining) as (keyof typeof battle.remaining)[])
    battle.remaining[kind] = 0;
  until(0.65);
  expect(battle.finished).toBe(false);
  expect(shot.hit.length).toBeGreaterThan(0);
  expect(shot.length / shot.speed).toBeLessThan(2);
  while (!battle.finished && battle.elapsed < 3) model.step(0.05);
  expect(battle.finished).toBe(true);
  expect(shot.travelled).toBe(shot.length);
});

it.each([false, true])(
  'portable Giant Arrow Recall=%s reconstructs the complete battle through backward seeks',
  (recall) => {
    const r = nativeGiantArrowRecording(18, recall);
    const model = new GameModel();
    expect(model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(true);
    for (const snapshot of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
      model.seekReplay(snapshot.at);
      while (model.replay!.seeking) model.step(0.05);
      expect(JSON.parse(JSON.stringify(model.battle))).toEqual(snapshot.battle);
    }
  },
);

it('retains version 130 without an activation arrow or piercing damage', () => {
  const { model, battle, until } = giantArrowBattle(18, 130);
  const hp = battle.buildings.find((b) => b.id === 3)!.hp;
  model.activateNativeHeroAbility('queen');
  until(0.65);
  expect(battle.nativeGiantArrow).toBeUndefined();
  expect(battle.nativeGiantArrows).toBeUndefined();
  expect(battle.buildings.find((b) => b.id === 3)!.hp).toBe(hp);
});
