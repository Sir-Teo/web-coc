import { expect, it } from 'vitest';
import { GameModel, makeBuilding, type Unit } from '../src/game/model';
import { nativeUnitStats } from '../src/game/native-units';
import { spawnGarrisonDefender } from '../src/game/garrison-combat';
import { hurtUnit } from '../src/game/native-status';
import { hurtDefender } from '../src/game/defenders';
import { replayBattle } from '../src/game/replay';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { nativeDirectBattle } from './fixtures/native-direct-attacks';
import { babyDragonRecording, babyDragonAllyRecording } from './fixtures/attacking-baby-dragon';

function companion(
  r: ReturnType<typeof nativeDirectBattle>,
  distance = 1,
  kind: Unit['kind'] = 'minion',
) {
  const u: Unit = {
    ...structuredClone(r.unit),
    id: 500,
    kind,
    level: 1,
    x: r.unit.x + distance,
    y: r.unit.y,
    hp: 100,
    maxHp: 100,
    path: [],
    cooldown: 100,
    native: { effects: { frozenUntil: 100 } },
  };
  r.battle.units.push(u);
  return u;
}

for (let level = 1; level <= 12; level++)
  for (const calm of [false, true])
    for (const x of [11.4, 6.9])
      it(`Baby Dragon ${level} ${calm ? 'calm' : 'Tantrum'} source phases from ${x}`, () => {
        const r = nativeDirectBattle('babydragon', level, undefined, x),
          target = r.battle.buildings.find((b) => b.id === 2)!,
          stats = nativeUnitStats('babydragon', level),
          damage = stats.damage * (calm ? 1 : 2),
          period = calm ? 1 : 2 / 3;
        if (calm) companion(r);
        while (!r.unit.attacking) r.step();
        const engaged = r.battle.elapsed;
        expect(target.hp).toBe(target.maxHp);
        r.untilAttacks(1);
        const first = r.battle.elapsed,
          shot = r.battle.projectiles!.find((p) => p.sourceId === r.unit.id)!;
        expect(first - engaged + 0.05).toBeCloseTo(Math.ceil(period / 0.05 - 1e-8) * 0.05, 8);
        expect(shot).toMatchObject({
          weapon: 'native',
          fromAir: true,
          splash: 0.3,
          damage,
          native: {
            kind: 'babydragon',
            level,
            name:
              level >= 10
                ? 'babydragon_projectile_lvl10'
                : level >= 5
                  ? 'babydragon_projectile_lvl3'
                  : level >= 3
                    ? 'babydragon_projectile_lvl2'
                    : 'babydragon_projectile',
          },
        });
        expect(shot.impact - shot.launched).toBeCloseTo(
          Math.hypot(shot.x - shot.fromX, shot.y - shot.fromY) / 4.75,
          8,
        );
        expect(target.hp).toBe(target.maxHp);
        r.untilAttacks(2);
        expect(Math.abs(r.unit.native!.lastAttackAt! - first - period)).toBeLessThan(0.05 + 1e-8);
        r.until(shot.impact);
        expect(target.hp).toBeCloseTo(target.maxHp - damage, 8);
      });

it('Tantrum retains two-thirds-second repeats across step boundaries', () => {
  const r = nativeDirectBattle('babydragon'),
    releases: number[] = [];
  for (let count = 1; count <= 10; count++) {
    r.untilAttacks(count);
    releases.push(r.unit.native!.lastAttackAt!);
  }
  expect(releases[9] - releases[0]).toBeCloseTo(6, 8);
});

it('a flyer arriving during charge switches the remaining action time to normal speed', () => {
  const r = nativeDirectBattle('babydragon');
  r.until(0.2);
  companion(r);
  r.untilAttacks(1);
  expect(r.unit.native!.alone).toBe(false);
  expect(r.battle.elapsed).toBeCloseTo(0.9, 8);
  expect(r.battle.projectiles!.find((p) => p.sourceId === r.unit.id)!.damage).toBe(75);
});
it('a departing flyer speeds up the remaining charge without restarting it', () => {
  const r = nativeDirectBattle('babydragon'),
    buddy = companion(r);
  r.until(0.3);
  buddy.hp = 0;
  r.untilAttacks(1);
  expect(r.unit.native!.alone).toBe(true);
  expect(r.battle.elapsed).toBeCloseTo(0.8, 8);
  expect(r.battle.projectiles!.find((p) => p.sourceId === r.unit.id)!.damage).toBe(150);
});

for (const c of [
  { kind: 'minion', distance: 4.5, alone: false },
  { kind: 'minion', distance: 4.50001, alone: true },
  { kind: 'archer', distance: 1, alone: true },
] as const)
  it(`Tantrum boundary: ${c.kind} at ${c.distance}`, () => {
    const r = nativeDirectBattle('babydragon');
    companion(r, c.distance, c.kind);
    r.step();
    expect(r.unit.native!.alone).toBe(c.alone);
  });

it('Freeze holds the active charge and its pose offset', () => {
  const r = nativeDirectBattle('babydragon');
  r.until(0.2);
  const before = structuredClone(r.unit.native!.attackWindup!);
  (r.unit.native!.effects ??= {}).frozenUntil = 1.2;
  r.until(1.15);
  expect(r.unit.native!.attackWindup).toEqual(before);
  r.untilAttacks(1);
  expect(r.battle.elapsed).toBeCloseTo(1.7, 8);
});
for (const slowed of [false, true])
  it(`Tantrum composes with external action-speed modifiers, slowed=${slowed}`, () => {
    const r = nativeDirectBattle('babydragon');
    r.unit.native!.effects = slowed
      ? { poison: { since: 0, until: 100, dps: 0, speed: 0, attackSpeed: -0.5 } }
      : { boost: { until: 100, damage: 0, speed: 0, attackSpeed: 1 } };
    r.untilAttacks(1);
    const period = slowed ? 4 / 3 : 1 / 3,
      first = r.battle.elapsed;
    expect(first).toBeCloseTo(Math.ceil(period / 0.05 - 1e-8) * 0.05, 8);
    r.untilAttacks(7);
    expect(r.battle.elapsed - first).toBeCloseTo(period * 6, 8);
  });

for (const air of [false, true])
  it(`native splash hits each ${air ? 'air' : 'ground'} defender once and stays on that layer`, () => {
    const r = nativeDirectBattle('babydragon'),
      kind = air ? 'dragon' : 'golem',
      level = air ? 7 : 8,
      primary = spawnGarrisonDefender(r.battle, kind, level, 1, 12, 11.5, 0),
      near = spawnGarrisonDefender(r.battle, kind, level, 1, 12.1, 11.5, 0),
      other = spawnGarrisonDefender(
        r.battle,
        air ? 'golem' : 'dragon',
        air ? 8 : 7,
        1,
        12.1,
        11.5,
        0,
      ),
      building = makeBuilding(3, 'goldstorage', 12, 10, 18);
    r.battle.buildings.push(building);
    for (const d of [primary, near, other]) {
      d.alerted = true;
      d.stunnedUntil = 100;
    }
    r.untilAttacks(1);
    const shot = r.battle.projectiles!.find((p) => p.sourceId === r.unit.id)!;
    expect(shot).toMatchObject({
      fromAir: true,
      toAir: air,
      targetDefender: true,
      targetId: primary.id,
      damage: 150,
    });
    expect(primary.hp).toBe(primary.maxHp);
    r.until(shot.impact);
    expect(primary.hp).toBe(primary.maxHp - 150);
    expect(near.hp).toBe(near.maxHp - 150);
    expect(other.hp).toBe(other.maxHp);
    expect(building.hp).toBe(building.maxHp - (air ? 0 : 150));
  });

it('a building shot splashes ground defenders and Wall footprints once at impact', () => {
  const r = nativeDirectBattle('babydragon');
  r.untilAttacks(1);
  const shot = r.battle.projectiles!.find((p) => p.sourceId === r.unit.id)!,
    target = r.battle.buildings.find((b) => b.id === 2)!,
    wall = makeBuilding(3, 'wall', 14, 11, 18),
    ground = spawnGarrisonDefender(r.battle, 'golem', 8, 1, 14.5, 11.5, 0),
    air = spawnGarrisonDefender(r.battle, 'dragon', 7, 1, 14.5, 11.5, 0);
  r.battle.buildings.push(wall);
  for (const d of [ground, air]) {
    d.alerted = true;
    d.stunnedUntil = 100;
  }
  r.until(shot.impact);
  expect(target.hp).toBe(target.maxHp - 150);
  expect(wall.hp).toBe(wall.maxHp - 150);
  expect(ground.hp).toBe(ground.maxHp - 150);
  expect(air.hp).toBe(air.maxHp);
});

it('a released splash survives defeat of its shooter and primary defender', () => {
  const r = nativeDirectBattle('babydragon'),
    primary = spawnGarrisonDefender(r.battle, 'golem', 8, 1, 12, 11.5, 0),
    near = spawnGarrisonDefender(r.battle, 'golem', 8, 1, 12.1, 11.5, 0);
  for (const d of [primary, near]) {
    d.alerted = true;
    d.stunnedUntil = 100;
  }
  r.untilAttacks(1);
  const shot = r.battle.projectiles!.find((p) => p.sourceId === r.unit.id)!;
  hurtDefender(r.battle, primary, primary.hp);
  hurtUnit(r.battle, r.unit, r.unit.hp);
  r.until(shot.impact);
  expect(near.hp).toBe(near.maxHp - 150);
});

for (const version of [185, 186])
  for (const level of [1, 12]) {
    for (const guard of [false, true, 'air'] as const)
      it(`tier ${level} ${guard || 'Cannon'} reproduces version ${version} portable states`, () => {
        const r = babyDragonRecording(version, level, guard),
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
    it(`tier ${level} real ally arrival retains version ${version} portable shots`, () => {
      const r = babyDragonAllyRecording(level, version),
        viewer = new GameModel(),
        stats = nativeUnitStats('babydragon', level),
        calm = r.snapshots.find((s) => s.at === r.calm)!.battle;
      expect(calm.units.find((u) => u.id === r.id)!.native!.alone).toBe(false);
      expect(calm.projectiles!.find((p) => p.sourceId === r.id)!.damage).toBe(stats.damage * 2);
      expect(r.damage).toBe(stats.damage * 2);
      expect(
        r.snapshots
          .find((s) => s.at === r.second)!
          .battle.projectiles!.find((p) => p.sourceId === r.id)!.damage,
      ).toBe(stats.damage);
      expect(viewer.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(true);
      for (const s of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
        viewer.seekReplay(s.at);
        while (viewer.replay!.seeking) viewer.step(0.05);
        expect(JSON.parse(JSON.stringify(viewer.battle))).toEqual(s.battle);
      }
    });
  }

it('only carried Baby Dragons enable version 186 behavior', () => {
  const r = nativeDirectBattle('babydragon');
  expect(replayBattle(r.data.initial, 185).nativeBabyDragonWindup).toBeUndefined();
  expect(replayBattle(r.data.initial, 186).nativeBabyDragonWindup).toBe(true);
  r.data.initial.army.babydragon = 0;
  expect(replayBattle(r.data.initial, 186).nativeBabyDragonWindup).toBeUndefined();
});
