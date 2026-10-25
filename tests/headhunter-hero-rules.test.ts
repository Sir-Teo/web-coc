import { expect, it } from 'vitest';
import { GameModel, makeBuilding } from '../src/game/model';
import { nativeUnitStats } from '../src/game/native-units';
import { spawnGarrisonDefender } from '../src/game/garrison-combat';
import { spawnSkeleton } from '../src/game/defenders';
import { createGuardian } from '../src/game/native-guardians';
import { defendingHero } from '../src/game/defending-heroes';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { validateReplay } from '../src/game/replay';
import { headhunterHeroBattle, headhunterHeroRecording } from './fixtures/headhunter-hero-rules';

function arena(level = 1, air = false) {
  const { model, battle } = headhunterHeroBattle(level, air);
  const hero = battle.defenders!.find((d) => d.kind === 'hero')!;
  hero.stunnedUntil = 100;
  model.activeTroop = 'headhunter';
  expect(model.deploy(5, 5)).toBe(true);
  const unit = battle.units[0];
  return { model, battle, hero, unit };
}

it.each([1, 2, 3, 4])('level %s applies four times direct damage to a defending Hero', (level) => {
  const { model, battle, hero, unit } = arena(level);
  const stats = nativeUnitStats('headhunter', level);
  expect(stats.preferHeroes).toBe(true);
  expect(stats.heroMultiplier).toBe(4);
  model.step(0.05);
  const shot = battle.projectiles!.find((shot) => shot.sourceId === unit.id)!;
  expect(shot.targetId).toBe(hero.id);
  expect(shot.damage).toBeCloseTo(stats.damage * 4, 9);
  expect(hero.hp).toBe(hero.maxHp);
  while (battle.elapsed < shot.impact + 1e-9) model.step(0.05);
  expect(hero.maxHp - hero.hp).toBeCloseTo(stats.damage * 4, 9);
});

it('chases a distant unalerted Hero past a committed building and closer defenders', () => {
  const { model, battle, hero, unit } = arena();
  hero.x = 25;
  hero.home.x = 25;
  unit.target = 2;
  const archer = spawnGarrisonDefender(battle, 'archer', 9, 1, 5.5, 5, 0);
  archer.alerted = true;
  archer.stunnedUntil = 100;
  const skeleton = spawnSkeleton(battle, makeBuilding(3, 'skeletontrap', 5, 5, 1), 0, 0);
  skeleton.alerted = true;
  skeleton.stunnedUntil = 100;
  model.step(0.05);
  expect(hero.alerted).not.toBe(true);
  expect(unit.defenderTarget).toBe(hero.id);
  expect(unit.x).toBeGreaterThan(5);
  expect(battle.projectiles?.find((shot) => shot.sourceId === unit.id)).toBeUndefined();
});

it('switches away from an ordinary defender as soon as a Hero becomes available', () => {
  const { model, battle, hero, unit } = arena();
  hero.spawnedAt = 0.1;
  const archer = spawnGarrisonDefender(battle, 'archer', 9, 1, 5.5, 5, 0);
  archer.alerted = true;
  archer.stunnedUntil = 100;
  model.step(0.05);
  expect(unit.defenderTarget).toBe(archer.id);
  expect(battle.projectiles!.find((shot) => shot.sourceId === unit.id)!.damage).toBe(63);
  model.step(0.05);
  expect(unit.defenderTarget).toBe(hero.id);
});

it('returns to normal defender targeting and damage after all Heroes fall', () => {
  const { model, battle, hero, unit } = arena();
  hero.hp = 0;
  const archer = spawnGarrisonDefender(battle, 'archer', 9, 1, 5.5, 5, 0);
  archer.alerted = true;
  archer.stunnedUntil = 100;
  model.step(0.05);
  expect(unit.defenderTarget).toBe(archer.id);
  expect(battle.projectiles!.find((shot) => shot.sourceId === unit.id)!.damage).toBe(63);
  archer.hp = 0;
  model.step(0.05);
  expect(unit.defenderTarget).toBeUndefined();
  expect(unit.target).toBe(2);
});

it('keeps a committed Hero and chooses another when that Hero falls', () => {
  const { model, battle, hero, unit } = arena();
  model.step(0.05);
  const closer = defendingHero({ kind: 'king', level: 110, x: 5.5, y: 5 }, 1);
  closer.stunnedUntil = 100;
  battle.defenders!.push(closer);
  model.step(0.05);
  expect(unit.defenderTarget).toBe(hero.id);
  hero.hp = 0;
  model.step(0.05);
  expect(unit.defenderTarget).toBe(closer.id);
});

it('does not apply the Hero hit multiplier to Guardians', () => {
  const { model, battle, hero, unit } = arena();
  hero.hp = 0;
  const guardian = createGuardian(battle, { ...battle.buildings[0], guardian: 'smasher' }, -20000)!;
  expect(guardian).not.toBeNull();
  guardian.x = 7;
  guardian.y = 5;
  guardian.alerted = true;
  guardian.stunnedUntil = 100;
  guardian.phase = 'fighting';
  guardian.spawnedAt = 0;
  battle.defenders!.push(guardian);
  model.step(0.05);
  expect(unit.defenderTarget).toBe(guardian.id);
  expect(battle.projectiles!.find((shot) => shot.sourceId === unit.id)!.damage).toBe(63);
});

it('keeps the old unmultiplied hit when a version-72 Headhunter finds an alerted Hero', () => {
  const { model, battle, hero, unit } = arena();
  delete battle.nativeHeadhunterHeroRules;
  hero.alerted = true;
  model.step(0.05);
  const shot = battle.projectiles!.find((shot) => shot.sourceId === unit.id)!;
  expect(shot.targetId).toBe(hero.id);
  expect(shot.damage).toBe(63);
});

it('jumps an unbroken wall while chasing a Hero instead of firing at the wall', () => {
  const { model, battle, hero, unit } = arena();
  hero.x = hero.home.x = 13;
  const walls = Array.from({ length: 48 }, (_, y) => makeBuilding(1000 + y, 'wall', 8, y, 10));
  battle.buildings.push(...walls);
  for (let i = 0; i < 40; i++) model.step(0.05);
  expect(unit.defenderTarget).toBe(hero.id);
  expect(unit.x).toBeGreaterThan(9);
  expect(walls.every((wall) => wall.hp === wall.maxHp)).toBe(true);
  expect(battle.projectiles?.every((shot) => !shot.targetBuilding)).toBe(true);
});

it.each([false, true])(
  'reconstructs real shots against an %s air Hero and preserves version 72',
  (air) => {
    const { data, snapshots, hit, unitId, defenderId } = headhunterHeroRecording(air);
    expect(validateReplay(data)).toBe(true);
    const viewer = new GameModel();
    expect(viewer.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data))))).toBe(true);
    for (const snapshot of [...snapshots].reverse()) {
      viewer.seekReplay(snapshot.at);
      while (viewer.replay!.seeking) viewer.step(0.05);
      expect(JSON.parse(JSON.stringify(viewer.battle))).toEqual(snapshot.battle);
    }
    viewer.seekReplay(hit);
    while (viewer.replay!.seeking) viewer.step(0.05);
    const hero = viewer.battle!.defenders!.find((d) => d.id === defenderId)!;
    expect(hero.maxHp - hero.hp).toBeCloseTo(252, 9);
    expect(viewer.openReplay({ ...data, version: 72 })).toBe(true);
    viewer.seekReplay(hit);
    while (viewer.replay!.seeking) viewer.step(0.05);
    // An unalerted frozen Hero was not selected at all in the old attack path.
    const old = viewer.battle!.defenders!.find((d) => d.id === defenderId)!;
    expect(old.hp).toBe(old.maxHp);
    expect(viewer.battle!.units.find((unit) => unit.id === unitId)!.defenderTarget).toBeUndefined();
  },
);
