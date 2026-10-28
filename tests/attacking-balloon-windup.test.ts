import { expect, it } from 'vitest';
import { GameModel, makeBuilding } from '../src/game/model';
import { nativeUnitStats } from '../src/game/native-units';
import { spawnGarrisonDefender } from '../src/game/garrison-combat';
import { hurtUnit } from '../src/game/native-status';
import { replayBattle } from '../src/game/replay';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { nativeDirectBattle } from './fixtures/native-direct-attacks';
import {
  balloonRecording,
  balloonIceBlockRecording,
  balloonDeathRecording,
} from './fixtures/attacking-balloon';

for (let level = 1; level <= 13; level++)
  for (const x of [11.4, 6.9])
    it(`Balloon source tier ${level} charges .75 s after approaching from ${x}`, () => {
      const r = nativeDirectBattle('balloon', level, undefined, x),
        target = r.battle.buildings.find((b) => b.id === 2)!,
        hp = target.hp,
        damage = nativeUnitStats('balloon', level).damage;
      while (!r.unit.attacking) r.step();
      const engaged = r.battle.elapsed;
      expect(target.hp).toBe(hp);
      r.untilAttacks(1);
      const first = r.battle.elapsed;
      expect(first - engaged + 0.05).toBeCloseTo(0.75, 8);
      expect(target.hp).toBeCloseTo(hp - damage, 8);
      expect(r.battle.projectiles?.some((p) => p.sourceId === r.unit.id) ?? false).toBe(false);
      expect(r.unit.native!.attackWindup!.recovery).toBeCloseTo(1.5, 8);
      r.untilAttacks(2);
      expect(r.battle.elapsed - first).toBeCloseTo(3, 8);
      expect(target.hp).toBeCloseTo(hp - damage * 2, 8);
    });

it('Freeze and stun hold the first charge and following recovery', () => {
  const r = nativeDirectBattle('balloon');
  while (!r.unit.attacking) r.step();
  const engaged = r.battle.elapsed;
  (r.unit.native!.effects ??= {}).frozenUntil = engaged + 1;
  r.untilAttacks(1);
  expect(r.battle.elapsed - engaged + 0.05).toBeCloseTo(1.75, 8);
  const first = r.battle.elapsed;
  r.step();
  r.unit.native!.effects!.stunUntil = r.battle.elapsed + 1;
  r.untilAttacks(2);
  expect(r.battle.elapsed - first).toBeCloseTo(4, 8);
});

for (const slowed of [false, true])
  it(`scales both phases, slowed=${slowed}`, () => {
    const r = nativeDirectBattle('balloon');
    r.step();
    r.unit.native!.effects = slowed
      ? { poison: { since: 0, until: 100, dps: 0, speed: 0, attackSpeed: -0.5 } }
      : { boost: { until: 100, damage: 0, speed: 0, attackSpeed: 1 } };
    while (!r.unit.attacking) r.step();
    const engaged = r.battle.elapsed,
      scale = slowed ? 2 : 0.5;
    r.untilAttacks(1);
    const first = r.battle.elapsed;
    expect(first - engaged + 0.05).toBeCloseTo(Math.ceil((0.75 * scale) / 0.05 - 1e-8) * 0.05, 8);
    r.untilAttacks(2);
    expect(r.battle.elapsed - first).toBeCloseTo(3 * scale, 8);
  });

it('carries sub-step remainder instead of adding drift at every release', () => {
  const r = nativeDirectBattle('balloon'),
    releases: number[] = [];
  while (!r.unit.attacking) r.step();
  for (let count = 1; count <= 4; count++) {
    while ((r.unit.native!.attacks ?? 0) < count) r.model.step(0.08);
    releases.push(r.battle.elapsed);
  }
  expect(Math.abs(releases[3] - releases[0] - 9)).toBeLessThan(0.08 + 1e-8);
});

it('an adjacent replacement spends remaining recovery once before a fresh .75 s charge', () => {
  const r = nativeDirectBattle('balloon'),
    target = r.battle.buildings.find((b) => b.id === 2)!;
  r.battle.buildings.push(makeBuilding(3, 'goldstorage', 13, 10, 18));
  r.untilAttacks(1);
  const first = r.battle.elapsed;
  r.model.damage(target, target.hp);
  r.untilAttacks(2);
  expect(r.unit.target).toBe(3);
  expect(r.battle.elapsed - first).toBeCloseTo(2.25, 8);
});

it('a replacement during charge starts a full fresh charge', () => {
  const r = nativeDirectBattle('balloon'),
    target = r.battle.buildings.find((b) => b.id === 2)!;
  r.battle.buildings.push(makeBuilding(3, 'goldstorage', 13, 10, 18));
  while (!r.unit.attacking) r.step();
  r.until(r.battle.elapsed + 0.25);
  r.model.damage(target, target.hp);
  r.step();
  const changed = r.battle.elapsed;
  r.untilAttacks(1);
  expect(r.battle.elapsed - changed + 0.05).toBeCloseTo(0.75, 8);
});

it('centers the ground blast on the Balloon, including nearby footprints and defenders', () => {
  const r = nativeDirectBattle('balloon');
  while (!r.unit.attacking) r.step();
  const effects: Parameters<typeof r.model.onEffect>[0][] = [];
  r.model.onEffect = (e) => effects.push(e);
  const near = makeBuilding(3, 'goldstorage', 13, 12, 18),
    wall = makeBuilding(4, 'wall', 12, 11, 18),
    outside = makeBuilding(5, 'wall', 10, 11, 18),
    trap = makeBuilding(6, 'bomb', 13, 11, 1);
  r.battle.buildings.push(near, wall, outside, trap);
  const ground = spawnGarrisonDefender(r.battle, 'golem', 8, 1, 13.3, 11.5, 0),
    air = spawnGarrisonDefender(r.battle, 'dragon', 7, 1, 13.3, 11.5, 0);
  for (const d of [ground, air]) {
    d.alerted = true;
    d.stunnedUntil = 100;
  }
  r.untilAttacks(1);
  const damage = nativeUnitStats('balloon', 1).damage;
  expect(near.hp).toBe(near.maxHp - damage);
  expect(wall.hp).toBe(wall.maxHp - damage);
  expect(outside.hp).toBe(outside.maxHp);
  expect(trap.hp).toBe(trap.maxHp);
  expect(ground.hp).toBe(ground.maxHp - damage);
  expect(air.hp).toBe(air.maxHp);
  expect(effects.find((e) => e.type === 'blast' && e.sourceId === r.unit.id)).toMatchObject({
    x: r.unit.x,
    y: r.unit.y,
    radius: 1.2,
  });
});

it('ground defender releases use a self-centered blast and never a generic bomb projectile', () => {
  const r = nativeDirectBattle('balloon'),
    ground = spawnGarrisonDefender(r.battle, 'golem', 8, 1, 12, 11.5, 0),
    air = spawnGarrisonDefender(r.battle, 'dragon', 7, 1, 12, 11.5, 0);
  for (const d of [ground, air]) {
    d.alerted = true;
    d.stunnedUntil = 100;
  }
  while (!r.unit.attacking) r.step();
  const engaged = r.battle.elapsed;
  r.untilAttacks(1);
  expect(r.unit.defenderTarget).toBe(ground.id);
  expect(r.battle.elapsed - engaged + 0.05).toBeCloseTo(0.75, 8);
  expect(ground.hp).toBe(ground.maxHp - 75);
  expect(air.hp).toBe(air.maxHp);
  expect(r.battle.projectiles?.some((p) => p.sourceId === r.unit.id) ?? false).toBe(false);
});

it('continues to prefer defenses and fly over intact Walls', () => {
  const r = nativeDirectBattle('balloon'),
    cannon = makeBuilding(3, 'cannon', 25, 10, 21),
    walls = Array.from({ length: 48 }, (_, y) => makeBuilding(1000 + y, 'wall', 12, y, 18));
  r.battle.buildings.push(cannon, ...walls);
  const guard = spawnGarrisonDefender(r.battle, 'golem', 8, 1, 11.5, 11.5, 0);
  guard.alerted = true;
  guard.stunnedUntil = 100;
  r.step();
  expect(r.unit.target).toBe(cannon.id);
  expect(r.unit.defenderTarget).toBeUndefined();
  r.untilAttacks(1);
  expect(r.unit.x).toBeGreaterThan(12);
  expect(walls.every((w) => w.hp === w.maxHp)).toBe(true);
});

it('real Ice Block holds the release clock through a refresh checkpoint', () => {
  const r = balloonIceBlockRecording(),
    frozen = r.snapshots.find((s) => s.at === r.frozen)!.battle.units.find((u) => u.id === r.id)!,
    held = r.snapshots.find((s) => s.at === r.held)!.battle.units.find((u) => u.id === r.id)!;
  expect(frozen.native!.effects!.frozenUntil).toBeGreaterThan(r.held);
  expect(held.native!.attackWindup).toEqual(frozen.native!.attackWindup);
  expect(
    r.snapshots.find((s) => s.at === r.after)!.battle.units.find((u) => u.id === r.id)!.native!
      .attacks,
  ).toBeGreaterThan(frozen.native!.attacks ?? 0);
});

for (let level = 1; level <= 13; level++)
  it(`source tier ${level} retains independent delayed ground death damage during Freeze`, () => {
    const r = nativeDirectBattle('balloon', level);
    while (!r.unit.attacking) r.step();
    const target = r.battle.buildings.find((b) => b.id === 2)!,
      ground = spawnGarrisonDefender(r.battle, 'golem', 8, 1, r.unit.x + 0.2, r.unit.y, 0),
      air = spawnGarrisonDefender(r.battle, 'dragon', 7, 1, r.unit.x + 0.2, r.unit.y, 0);
    for (const d of [ground, air]) {
      d.alerted = true;
      d.stunnedUntil = 100;
    }
    (r.unit.native!.effects ??= {}).frozenUntil = 100;
    hurtUnit(r.battle, r.unit, r.unit.maxHp);
    r.step();
    const blast = r.battle.nativeDeaths!.find((b) => b.sourceId === r.unit.id)!;
    expect(blast.at - r.unit.defeatedAt!).toBeCloseTo(0.416, 8);
    expect(blast).toMatchObject({
      radius: 1.2,
      damage: nativeUnitStats('balloon', level).deathDamage,
      air: false,
    });
    r.until(blast.at - 0.05);
    expect(target.hp).toBe(target.maxHp);
    r.until(blast.at);
    expect(target.hp).toBe(target.maxHp - blast.damage);
    expect(ground.hp).toBe(ground.maxHp - blast.damage);
    expect(air.hp).toBe(air.maxHp);
  });

for (const version of [189, 190])
  for (const level of [1, 13]) {
    for (const guard of [false, true])
      it(`tier ${level} actual ${guard ? 'Golem' : 'Cannon'} fight reproduces version ${version}`, () => {
        const r = balloonRecording(version, level, guard),
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
    for (const make of [balloonIceBlockRecording, balloonDeathRecording])
      it(`tier ${level} ${make.name} preserves version ${version} portable states`, () => {
        const r = make(level, version),
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

it('only carried Balloons enable the new version', () => {
  const r = nativeDirectBattle('balloon', 1);
  expect(replayBattle(r.data.initial, 189).nativeBalloonWindup).toBeUndefined();
  expect(replayBattle(r.data.initial, 190).nativeBalloonWindup).toBe(true);
  r.data.initial.army.balloon = 0;
  expect(replayBattle(r.data.initial, 190).nativeBalloonWindup).toBeUndefined();
});

for (let level = 1; level <= 13; level++)
  it(`tier ${level} previews and moves at source speed/range while version 189 retains its stats`, () => {
    const home = new GameModel();
    expect(home.troopStats('balloon', level)).toMatchObject({ speed: 1.3, range: 0 });
    const current = nativeDirectBattle('balloon', level),
      old = nativeDirectBattle('balloon', level, 189);
    current.step();
    old.step();
    expect(current.unit.x - 11.4).toBeCloseTo(1.3 * 0.05, 8);
    expect(old.unit.x - 11.4).toBeCloseTo(1.25 * 0.05, 8);
    expect(old.model.troopStats('balloon', level)).toMatchObject({ speed: 1.25, range: 0.5 });
  });
