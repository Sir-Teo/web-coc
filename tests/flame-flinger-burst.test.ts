import { expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { GameModel, makeBuilding } from '../src/game/model';
import { nativeUnitStats } from '../src/game/native-units';
import { flameFlingerBurstStats, releaseFlameFlingerShot } from '../src/game/native-flame-flinger';
import type { NativeTroopContext } from '../src/game/native-troops';
import { spawnGarrisonDefender } from '../src/game/garrison-combat';
import { replayBattle } from '../src/game/replay';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import {
  flameFlingerBurstBattle,
  flameFlingerBurstRecording,
} from './fixtures/flame-flinger-burst';

for (const level of [1, 2, 3, 4, 5])
  it(`Flame Flinger ${level} charges then releases three source-spaced projectiles at its average DPS`, () => {
    const r = flameFlingerBurstBattle(level, 228),
      ability = flameFlingerBurstStats(level);
    expect(ability).toMatchObject({ count: 3, delay: 0.128, firstHit: 4.48 });
    expect(ability.period).toBeCloseTo(5.312, 10);
    expect((ability.damage * 3) / ability.period).toBeCloseTo(
      nativeUnitStats('flameflinger', level).dps,
      10,
    );
    while (!r.unit.native?.attackWindup?.engaged) r.step();
    const started = r.deployed;
    r.until(started + ability.firstHit - 0.05);
    expect(r.packets).toHaveLength(0);
    r.untilShots(3);
    expect(r.packets).toHaveLength(3);
    expect(r.packets[0].launched).toBeCloseTo(started + ability.firstHit, 8);
    for (let i = 0; i < 3; i++) {
      expect(r.packets[i].launched - r.packets[0].launched).toBeCloseTo(i * 0.128, 8);
      expect(r.packets[i].damage).toBeCloseTo(ability.damage, 8);
      expect(r.packets[i].fromAir).toBe(false);
      expect(r.packets[i].toAir).toBe(false);
    }
    r.untilShots(4);
    expect(r.packets[3].launched - r.packets[0].launched).toBeCloseTo(ability.period, 8);
  });

for (const status of ['frozenUntil', 'stunUntil'] as const)
  it(`${status} holds the two unreleased projectiles without catch-up`, () => {
    const r = flameFlingerBurstBattle(1, 228);
    r.untilShots(1);
    const first = r.packets[0].launched,
      until = r.battle.elapsed + 0.25;
    r.unit.native!.effects = { [status]: until };
    r.until(until - 0.05);
    expect(r.packets).toHaveLength(1);
    r.untilShots(3);
    expect(r.packets[1].launched - first).toBeCloseTo(0.128 + 0.25, 8);
    expect(r.packets[2].launched - r.packets[1].launched).toBeCloseTo(0.128, 8);
  });

it('a hidden committed building cancels the remaining take', () => {
  const r = flameFlingerBurstBattle(1, 228);
  r.untilShots(1);
  const target = r.battle.buildings.find((b) => b.id === 2)!;
  (r.battle.buildingEffects ??= {})[target.id] = { invisibleUntil: 100 };
  r.until(r.battle.elapsed + 0.5);
  expect(r.packets).toHaveLength(1);
  expect(r.unit.native!.flameFlingerBurst!.shotsLeft).toBe(0);
});

it('released shots preserve all three burn areas after caster loss and hold the battle open', () => {
  const r = flameFlingerBurstBattle(1, 228);
  r.untilShots(3);
  r.unit.hp = 0;
  r.battle.remaining.archer = 0;
  r.until(8);
  expect(r.battle.finished).toBe(false);
  expect(r.battle.nativeSpells?.filter((c) => c.name === 'FireSpiritExplosion')).toHaveLength(3);
  while (!r.battle.finished) r.step();
  expect(r.battle.elapsed).toBeGreaterThan(35);
  expect(r.battle.elapsed).toBeLessThan(38);
});

for (const version of [227, 228])
  for (const level of [1, 5])
    for (const x of [5, 11.4])
      it(`Flame Flinger ${level} from${x} reconstructs complete version${version} portable burst states`, () => {
        const r = flameFlingerBurstRecording(level, version, x),
          viewer = new GameModel();
        if (version === 227) {
          const hashes: Record<string, string> = {
            '1:5': 'fcf39344908be3140c7e415dbabbf0bfb1cfe567617b517c33daaf9640953f0f',
            '1:11.4': 'cbacc5a5afb51fba6e72c7261f4ed1f461174ace878165fd216c723d488bd412',
            '5:5': 'd58de922066ec7ab9d8120c2059dfbac65a29407dd4e77f3934e43854d26f9d7',
            '5:11.4': 'c24416629e703625e7434efa499668db5e2faaf77f9b9795160e5a9764b95b42',
          };
          expect(createHash('sha256').update(JSON.stringify(r.snapshots)).digest('hex')).toBe(
            hashes[`${level}:${x}`],
          );
        }
        expect(viewer.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(
          true,
        );
        for (const snapshot of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
          viewer.seekReplay(snapshot.at);
          while (viewer.replay!.seeking) viewer.step(0.05);
          expect(JSON.parse(JSON.stringify(viewer.battle))).toEqual(snapshot.battle);
        }
      });

it('only new carried Flame Flinger armies enable charged three-projectile attacks', () => {
  const r = flameFlingerBurstBattle(1, 227);
  expect(r.battle.nativeFlameFlingerBursts).toBeUndefined();
  expect(replayBattle(r.data.initial, 228).nativeFlameFlingerBursts).toBe(true);
  r.data.initial.army.flameflinger = 0;
  expect(replayBattle(r.data.initial, 228).nativeFlameFlingerBursts).toBeUndefined();
});

for (const level of [1, 5])
  it(`a level${level} direct impact applies one Wall multiplier and one ground splash`, () => {
    const r = flameFlingerBurstBattle(level, 228),
      stats = nativeUnitStats('flameflinger', level),
      damage = flameFlingerBurstStats(level).damage,
      wall = makeBuilding(3, 'wall', 13, 11, 18),
      trap = makeBuilding(4, 'bomb', 13, 11, 1),
      storage = r.battle.buildings.find((b) => b.id === 2)!;
    r.battle.buildings.push(wall, trap);
    const ground = spawnGarrisonDefender(r.battle, 'golem', 8, 1, 13.5, 11.5, 0),
      air = spawnGarrisonDefender(r.battle, 'dragon', 7, 1, 13.5, 11.5, 0);
    for (const d of [ground, air]) {
      d.alerted = true;
      d.stunnedUntil = 100;
    }
    const before = {
      wall: wall.hp,
      storage: storage.hp,
      ground: ground.hp,
      air: air.hp,
      trap: trap.hp,
    };
    const ctx: NativeTroopContext = {
      battle: r.battle,
      buildings: r.battle.buildings,
      buildingsById: new Map(r.battle.buildings.map((b) => [b.id, b])),
      passableWalls: new Set(),
      nextId: () => 1000,
      troopLevel: () => level,
      damageBuilding: (b, d, at) => r.model.damage(b, d, at),
      effect: () => {},
    };
    releaseFlameFlingerShot(ctx, r.unit, stats, damage, { building: wall }, r.battle.elapsed);
    const packet = r.battle.projectiles.at(-1)!;
    expect(packet.damage).toBe(damage);
    r.until(packet.impact);
    expect(before.wall - wall.hp).toBeCloseTo(damage * 8, 8);
    expect(before.storage - storage.hp).toBeCloseTo(damage, 8);
    expect(before.ground - ground.hp).toBeCloseTo(damage, 8);
    expect(air.hp).toBe(before.air);
    expect(trap.hp).toBe(before.trap);
  });

it('partial Freeze slows the charge and shot spacing in active attack time', () => {
  const r = flameFlingerBurstBattle(1, 228);
  r.unit.native!.effects = { chill: { until: 100, percent: 0.5 } };
  r.untilShots(3);
  expect(r.packets[0].launched).toBeCloseTo(4.48 * 2, 8);
  expect(r.packets[1].launched - r.packets[0].launched).toBeCloseTo(0.128 * 2, 8);
  expect(r.packets[2].launched - r.packets[1].launched).toBeCloseTo(0.128 * 2, 8);
});

it('fractional steps retain the first two complete burst release times', () => {
  const run = (steps: number[]) => {
    const r = flameFlingerBurstBattle(5, 228);
    r.step();
    let i = 0;
    while ((r.unit.native?.attacks ?? 0) < 6) r.step(steps[i++ % steps.length]);
    return r.packets.slice(0, 6).map((p) => p.launched);
  };
  const normal = run([0.05]),
    irregular = run([0.03, 0.11, 0.02, 0.07, 0.13]);
  expect(irregular).toHaveLength(normal.length);
  for (let i = 0; i < normal.length; i++) expect(irregular[i]).toBeCloseTo(normal[i], 8);
});

for (const target of ['garrison', 'air-garrison'] as const)
  it(`an actual ${target} release reconstructs the charged attack and persistent burns`, () => {
    const r = flameFlingerBurstRecording(5, 228, 11.4, target),
      viewer = new GameModel();
    expect(r.packets.length).toBeGreaterThanOrEqual(3);
    expect(r.packets.every((p) => p.fromAir === false && p.toAir === false)).toBe(true);
    expect(viewer.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(true);
    for (const snapshot of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
      viewer.seekReplay(snapshot.at);
      while (viewer.replay!.seeking) viewer.step(0.05);
      expect(JSON.parse(JSON.stringify(viewer.battle))).toEqual(snapshot.battle);
    }
  });

for (const lost of [false, true])
  it(`a committed ground defender ${lost ? 'dying cancels unreleased shots' : 'retreating does not truncate the take'}`, () => {
    const r = flameFlingerBurstBattle(1, 228);
    r.battle.buildings = r.battle.buildings.filter((b) => b.kind === 'townhall');
    const target = spawnGarrisonDefender(r.battle, 'golem', 8, 1, 13.5, 11.5, 0);
    target.alerted = true;
    target.stunnedUntil = 100;
    r.untilShots(1);
    expect(r.unit.native!.attackWindup!.target).toMatchObject({ building: false, id: target.id });
    if (lost) target.hp = 0;
    else target.x = 40;
    r.until(r.battle.elapsed + 0.5);
    expect(r.packets).toHaveLength(lost ? 1 : 3);
    expect(r.unit.native!.flameFlingerBurst!.shotsLeft).toBe(0);
  });
