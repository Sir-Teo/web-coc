import { expect, it } from 'vitest';
import { GameModel, makeBuilding } from '../src/game/model';
import { replayBattle } from '../src/game/replay';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { spawnGarrisonDefender } from '../src/game/garrison-combat';
import { defendingHero } from '../src/game/defending-heroes';
import { createGuardian } from '../src/game/native-guardians';
import { nativeDirectBattle } from './fixtures/native-direct-attacks';
import { attackerHitPoisonRecording } from './fixtures/attacker-hit-poison';
import { headhunterHeroBattle } from './fixtures/headhunter-hero-rules';
import {
  attackingHeadhunterRecording,
  chargingHeadhunterHeroRecording,
} from './fixtures/attacking-headhunter';

const damage = [63, 69, 75, 81];
function arena(level = 1, air = false, x = 5) {
  const r = headhunterHeroBattle(level, air, 181),
    hero = r.battle.defenders!.find((d) => d.kind === 'hero')!;
  hero.stunnedUntil = 100;
  r.model.activeTroop = 'headhunter';
  if (!r.model.deploy(x, 5)) throw Error('Headhunter arena deployment failed');
  const unit = r.battle.units[0];
  const step = () => {
    if (r.battle.elapsed > 15) throw Error('Headhunter checkpoint missing');
    r.model.step(0.05);
  };
  const until = (at: number) => {
    while (r.battle.elapsed < at - 1e-9) step();
  };
  const untilAttacks = (count: number) => {
    while ((unit.native?.attacks ?? 0) < count) step();
  };
  return { ...r, hero, unit, step, until, untilAttacks };
}

for (let level = 1; level <= 4; level++)
  for (const x of [5, 1.6])
    it(`Headhunter ${level} charges .6 s against a Hero after approaching from ${x}`, () => {
      const r = arena(level, false, x);
      while (!r.unit.attacking) r.step();
      const engaged = r.battle.elapsed;
      expect(r.unit.native!.attacks ?? 0).toBe(0);
      r.untilAttacks(1);
      const first = r.battle.elapsed,
        shot = r.battle.projectiles!.find((p) => p.sourceId === r.unit.id)!;
      expect(first - engaged + 0.05).toBeCloseTo(0.6, 8);
      expect(shot.damage).toBeCloseTo(damage[level - 1] * 4, 8);
      expect(shot.native).toMatchObject({
        name: `Headhunter_Card_lvl${level}`,
        kind: 'headhunter',
        level,
      });
      expect(r.hero.hp).toBe(r.hero.maxHp);
      expect(r.hero.hitPoison).toBeUndefined();
      r.until(shot.impact);
      expect(r.hero.hitPoison).toMatchObject({
        level: level + 4,
        speed: [-0.4, -0.42, -0.44, -0.46][level - 1],
        attack: [-0.55, -0.6, -0.65, -0.68][level - 1],
      });
      r.untilAttacks(2);
      expect(r.battle.elapsed - first).toBeCloseTo(0.6, 8);
    });

it('retains fourfold damage and poison on an airborne Hero', () => {
  const r = arena(4, true);
  r.untilAttacks(1);
  const shot = r.battle.projectiles!.find((p) => p.sourceId === r.unit.id)!;
  expect(shot.toAir).toBe(true);
  expect(shot.damage).toBe(324);
  r.until(shot.impact);
  expect(r.hero.hitPoison?.level).toBe(8);
});

it('cancels an ordinary defender charge as soon as an unalerted Hero becomes available', () => {
  const r = arena();
  r.hero.spawnedAt = 0.3;
  const guard = spawnGarrisonDefender(r.battle, 'golem', 8, 1, 5.5, 5, 0);
  guard.alerted = true;
  guard.stunnedUntil = 100;
  r.step();
  expect(r.unit.native!.attackWindup!.target).toEqual({ id: guard.id, building: false });
  r.until(0.3);
  const changed = r.battle.elapsed;
  expect(r.hero.alerted).not.toBe(true);
  expect(r.unit.native!.attackWindup!.target).toEqual({ id: r.hero.id, building: false });
  r.untilAttacks(1);
  expect(r.battle.elapsed - changed + 0.05).toBeCloseTo(0.6, 8);
  expect(guard.hp).toBe(guard.maxHp);
  expect(r.battle.projectiles!.find((p) => p.sourceId === r.unit.id)!.targetId).toBe(r.hero.id);
});

it('keeps a committed Hero charge and starts fresh when that Hero falls', () => {
  const r = arena();
  r.step();
  const next = defendingHero({ kind: 'king', level: 110, x: 5.5, y: 5 }, 1);
  next.stunnedUntil = 100;
  r.battle.defenders!.push(next);
  r.until(0.2);
  expect(r.unit.defenderTarget).toBe(r.hero.id);
  r.hero.hp = 0;
  r.step();
  const changed = r.battle.elapsed;
  r.untilAttacks(1);
  expect(r.battle.elapsed - changed + 0.05).toBeCloseTo(0.6, 8);
  expect(r.battle.projectiles!.find((p) => p.sourceId === r.unit.id)!.targetId).toBe(next.id);
});

for (const kind of ['golem', 'dragon', 'guardian'] as const)
  it(`charges then deals normal direct damage to a ${kind}`, () => {
    const r = arena();
    r.hero.hp = 0;
    const guard =
      kind === 'guardian'
        ? createGuardian(r.battle, { ...r.battle.buildings[0], guardian: 'smasher' }, -20000)!
        : spawnGarrisonDefender(r.battle, kind, kind === 'golem' ? 8 : 7, 1, 7.5, 5, 0);
    if (guard.kind === 'guardian') {
      Object.assign(guard, { x: 7.5, y: 5, phase: 'fighting', spawnedAt: 0 });
      r.battle.defenders!.push(guard);
    }
    guard.alerted = true;
    guard.stunnedUntil = 100;
    r.untilAttacks(1);
    const shot = r.battle.projectiles!.find((p) => p.sourceId === r.unit.id)!;
    expect(shot.damage).toBe(63);
    expect(shot.targetId).toBe(guard.id);
    expect(shot.toAir).toBe(kind === 'dragon');
  });

for (const slowed of [false, true])
  it(`scales first and repeat charges, slowed=${slowed}`, () => {
    const r = arena();
    r.unit.native!.effects = slowed
      ? { poison: { since: 0, until: 100, dps: 0, speed: 0, attackSpeed: -0.5 } }
      : { boost: { until: 100, damage: 0, speed: 0, attackSpeed: 1 } };
    while (!r.unit.attacking) r.step();
    const engaged = r.battle.elapsed,
      scale = slowed ? 2 : 0.5;
    r.untilAttacks(1);
    const first = r.battle.elapsed;
    expect(first - engaged + 0.05).toBeCloseTo(0.6 * scale, 8);
    r.untilAttacks(2);
    expect(r.battle.elapsed - first).toBeCloseTo(0.6 * scale, 8);
  });

it('Freeze holds a pending card charge and wall jumping still pursues a distant Hero', () => {
  const r = arena();
  r.step();
  const engaged = r.battle.elapsed;
  r.unit.native!.effects = { frozenUntil: engaged + 1 };
  r.untilAttacks(1);
  expect(r.battle.elapsed - engaged + 0.05).toBeCloseTo(1.6, 8);
  const w = arena();
  w.hero.x = w.hero.home.x = 13;
  const walls = Array.from({ length: 48 }, (_, y) => makeBuilding(1000 + y, 'wall', 8, y, 10));
  w.battle.buildings.push(...walls);
  w.untilAttacks(1);
  expect(w.unit.x).toBeGreaterThan(9);
  expect(walls.every((b) => b.hp === b.maxHp)).toBe(true);
});

for (const version of [180, 181])
  for (const level of [1, 4]) {
    for (const guard of [false, true, 'air'] as const)
      it(`level ${level} ${guard || 'Cannon'} preserves complete version ${version} replay state`, () => {
        const r = attackingHeadhunterRecording(version, level, guard),
          viewer = new GameModel();
        expect(viewer.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(
          true,
        );
        for (const s of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
          viewer.seekReplay(s.at);
          while (viewer.replay!.seeking) viewer.step(0.05);
          expect(JSON.parse(JSON.stringify(viewer.battle))).toEqual(s.battle);
        }
      });
    for (const air of [false, true])
      it(`level ${level} air=${air} Hero preserves complete version ${version} replay state`, () => {
        const r = chargingHeadhunterHeroRecording(level, air, version),
          viewer = new GameModel();
        expect(viewer.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(
          true,
        );
        for (const s of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
          viewer.seekReplay(s.at);
          while (viewer.replay!.seeking) viewer.step(0.05);
          expect(JSON.parse(JSON.stringify(viewer.battle))).toEqual(s.battle);
        }
      });
  }

for (const version of [180, 181])
  for (const air of [false, true])
    it(`version ${version} air=${air} Recall retains its own card count and poison expiry`, () => {
      const r = attackerHitPoisonRecording('headhunter', air, version),
        viewer = new GameModel();
      expect(r.shots).toHaveLength(version === 181 ? 1 : 2);
      expect(r.direct).toBe(252 * r.shots.length);
      expect(viewer.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(true);
      for (const s of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
        viewer.seekReplay(s.at);
        while (viewer.replay!.seeking) viewer.step(0.05);
        expect(JSON.parse(JSON.stringify(viewer.battle))).toEqual(s.battle);
      }
      viewer.seekReplay(r.expired);
      while (viewer.replay!.seeking) viewer.step(0.05);
      const defender = viewer.battle!.defenders!.find((d) => d.id === r.defenderId)!;
      expect(defender.maxHp - defender.hp).toBeCloseTo(r.total, 6);
      expect(defender.hitPoison).toBeUndefined();
    });

it('only carried Headhunters enable the new clock', () => {
  const s = structuredClone(nativeDirectBattle('headhunter').data.initial);
  expect(replayBattle(s).nativeHeadhunterWindup).toBe(true);
  expect(replayBattle(s, 180).nativeHeadhunterWindup).toBeUndefined();
  s.army.headhunter = 0;
  expect(replayBattle(s).nativeHeadhunterWindup).toBeUndefined();
});
