import { expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { GameModel, type Unit } from '../src/game/model';
import { troopLauncherTarget, resolveTroopLauncherImpact } from '../src/game/native-troop-launcher';
import type { NativeTroopContext } from '../src/game/native-troops';
import { replayBattle } from '../src/game/replay';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { troopLauncherBattle, troopLauncherRecording } from './fixtures/attacking-troop-launcher';

for (const version of [222, 223])
  for (const level of [1, 4])
    for (const [x, friendAt] of [
      [11.4, 1],
      [5, 3],
    ])
      it(`Troop Launcher ${level} from${x} keeps complete version${version} portable states`, () => {
        const r = troopLauncherRecording(level, version, x, friendAt),
          viewer = new GameModel();
        if (version === 222) {
          const hashes: Record<string, string> = {
            '1:11.4': 'f6880c7723962a1abdb689e24eebd297cf094defb58449fc0234748d9432466c',
            '1:5': '250bf92c7828abe1278cd8aeb5705316a059335039c73c4162e26ccdf0e56b19',
            '4:11.4': '6f2711219ab7f3cf97dd01a3e0ad52717acc478294bae24c46fdb80eac87267c',
            '4:5': '154e154f82893c2e73581983dda073dbfa116b558a70ac0c5dc7bc8bce5309eb',
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

for (let level = 1; level <= 4; level++)
  it(`Troop Launcher ${level} waits for a friendly group and sends real healing barrels`, () => {
    const r = troopLauncherBattle(level, 223);
    r.until(1);
    expect(r.packets).toHaveLength(0);
    r.untilShots(2);
    expect(r.packets[0].launched).toBeCloseTo(1.2, 8);
    expect(r.packets[1].launched - r.packets[0].launched).toBeCloseTo(6, 8);
    for (const shot of r.packets) {
      expect(shot.targetBuilding).toBe(false);
      expect(shot.targetDefender).toBeUndefined();
      expect(shot.native).toMatchObject({
        troopLauncher: true,
        healing: { remaining: 0 },
        name: `CommandTower Barrel${level}`,
      });
      expect(shot.damage).toBe(6);
      expect(shot.impact - shot.launched).toBeCloseTo(2.2, 8);
      expect(r.battle.units.some((u) => u.id === shot.targetId)).toBe(true);
    }
  });

it('an unaccompanied Troop Launcher waits while its source health drain continues', () => {
  const r = troopLauncherBattle(1, 223, 11.4, Infinity),
    hp = r.unit.hp;
  r.until(5);
  expect(r.packets).toHaveLength(0);
  expect(r.unit.hp).toBeCloseTo(hp - 125, 8);
});

it('only new carried Troop Launcher armies enable friendly targeting and payload attack phases', () => {
  const r = troopLauncherBattle(1, 222);
  expect(replayBattle(r.data.initial, 222).nativeTroopLauncherFriendly).toBeUndefined();
  expect(replayBattle(r.data.initial, 223)).toMatchObject({
    nativeTroopLauncherFriendly: true,
    nativeGiantWindup: true,
    nativeBarbarianWindup: true,
    nativeArcherWindup: true,
    nativeWallBreakerWindup: true,
    nativeWallBreakerSplash: true,
  });
  r.data.initial.army.trooplauncher = 0;
  expect(replayBattle(r.data.initial, 223).nativeTroopLauncherFriendly).toBeUndefined();
});

for (let level = 1; level <= 4; level++)
  it(`Troop Launcher ${level} spends exactly its stock and releases every source payload`, () => {
    const r = troopLauncherBattle(level, 223),
      stock = [5, 5, 6, 7][level - 1];
    // Isolate its lifetime/cadence from the payload winning the otherwise harmless test village.
    for (const b of r.battle.buildings) b.hp = b.maxHp = 1e9;
    r.untilShots(stock);
    const last = r.packets.at(-1)!;
    expect(last.launched).toBeCloseTo(1.2 + (stock - 1) * 6, 8);
    expect(r.unit.hp).toBe(0);
    r.until(last.impact + 1.3);
    expect(r.packets).toHaveLength(stock);
    expect(r.spawns.every((u) => u.level === level + 8)).toBe(true);
    const count = (kind: string) => r.spawns.filter((u) => u.kind === kind).length;
    expect(count('giant')).toBe(stock);
    expect(count('swordsman')).toBe(stock * 2);
    expect(count('archer')).toBe(stock * (level >= 3 ? 4 : 3));
    expect(count('wallbreaker')).toBe(stock * (level >= 2 ? 2 : 1));
  });

it('a released barrel keeps the battle open and summons troops after the parent and recipients fall', () => {
  const r = troopLauncherBattle(1, 223);
  r.untilShots(1);
  const shot = r.packets[0];
  for (const u of r.battle.units) u.hp = 0;
  r.until(shot.impact - 0.1);
  expect(r.battle.finished).toBe(false);
  r.until(shot.impact + 1.3);
  expect(r.spawns).toHaveLength(7);
  expect(r.battle.units.some((u) => u.hp > 0 && u.level === 9)).toBe(true);
});

for (const hold of ['frozenUntil', 'stunUntil'] as const)
  it(`${hold} holds a friendly barrel charge without wasting stock`, () => {
    const r = troopLauncherBattle(1, 223);
    r.until(1.1);
    (r.unit.native!.effects ??= {})[hold] = r.battle.elapsed + 1.025;
    r.until(2.1);
    expect(r.packets).toHaveLength(0);
    r.untilShots(2);
    expect(r.packets[0].launched).toBeCloseTo(2.25, 8);
    expect(r.packets[1].launched - r.packets[0].launched).toBeCloseTo(6, 8);
  });

it('a group present from deployment still waits for SpawnIdle and a fresh charge', () => {
  const r = troopLauncherBattle(1, 223, 11.4, 0);
  r.untilShots(1);
  expect(r.packets[0].launched).toBeCloseTo(1, 8);
});

function allyLike(base: Unit, id: number, kind: Unit['kind'], x: number, y: number): Unit {
  return {
    ...structuredClone(base),
    id,
    kind,
    x,
    y,
    level: 1,
    native: {},
    hp: 20,
    maxHp: 20,
    hero: undefined,
  };
}
it('friendly group selection uses source weights and preserves deployment order on ties', () => {
  const r = troopLauncherBattle(1, 223, 11.4, Infinity),
    a = allyLike(r.unit, 201, 'archer', 1, 1),
    b = allyLike(r.unit, 202, 'archer', 1.2, 1),
    c = allyLike(r.unit, 203, 'archer', 15, 15),
    d = allyLike(r.unit, 204, 'archer', 15.2, 15);
  r.battle.units.push(a, b, c, d);
  expect(troopLauncherTarget(r.battle, r.unit)?.id).toBe(a.id);
  const giant = allyLike(r.unit, 205, 'giant', 15.1, 15);
  r.battle.units.push(giant);
  expect(troopLauncherTarget(r.battle, r.unit)?.id).toBe(c.id);
});
it('one small troop and excluded or absent participants do not activate a barrel', () => {
  const r = troopLauncherBattle(1, 223, 11.4, Infinity),
    a = allyLike(r.unit, 201, 'archer', 1, 1);
  r.battle.units.push(a);
  for (const [i, kind] of [
    'spellskeleton',
    'spellskeletonshielded',
    'spellbat',
    'furnace',
    'firemite',
  ].entries())
    r.battle.units.push(allyLike(r.unit, 210 + i, kind as Unit['kind'], 1, 1));
  const future = allyLike(r.unit, 220, 'giant', 1, 1);
  future.spawnedAt = 100;
  const recalled = allyLike(r.unit, 221, 'giant', 1, 1);
  recalled.native = { recalled: true };
  const ejected = allyLike(r.unit, 222, 'giant', 1, 1);
  ejected.ejected = true;
  const dead = allyLike(r.unit, 223, 'giant', 1, 1);
  dead.hp = 0;
  r.battle.units.push(future, recalled, ejected, dead);
  expect(troopLauncherTarget(r.battle, r.unit)).toBeUndefined();
  const hero = allyLike(r.unit, 230, 'barbarianking', 10, 10);
  hero.hero = 'king';
  r.battle.units.push(hero);
  expect(troopLauncherTarget(r.battle, r.unit)?.id).toBe(hero.id);
});
it('the barrel heal stays at its captured point and does not damage enemies', () => {
  const r = troopLauncherBattle(1, 223);
  r.untilShots(1);
  const shot = r.packets[0],
    target = r.battle.units.find((u) => u.id === shot.targetId)!;
  target.x = shot.x;
  target.y = shot.y;
  target.hp = target.maxHp - 10;
  for (const u of r.battle.units)
    if (u.id !== target.id) {
      u.x = 30;
      u.y = 30;
    }
  const near = allyLike(r.unit, 999, 'archer', shot.x + 0.011, shot.y);
  near.hp = 10;
  const air = allyLike(r.unit, 1000, 'minion', shot.x, shot.y);
  air.hp = 10;
  r.battle.units.push(near, air);
  r.battle.elapsed = shot.impact;
  const buildingHp = r.battle.buildings.map((b) => b.hp),
    ctx: NativeTroopContext = {
      battle: r.battle,
      buildings: r.battle.buildings,
      buildingsById: new Map(r.battle.buildings.map((b) => [b.id, b])),
      passableWalls: new Set(),
      nextId: () => 2000,
      troopLevel: () => 1,
      damageBuilding: () => {
        throw Error('Friendly barrel damaged a building');
      },
      effect: () => {},
    };
  expect(resolveTroopLauncherImpact(ctx, shot)).toBe(true);
  expect(target.hp).toBe(target.maxHp - 4);
  expect(near.hp).toBe(10);
  expect(air.hp).toBe(10);
  expect(r.battle.buildings.map((b) => b.hp)).toEqual(buildingHp);
  expect(
    r.battle.nativeSpells?.some((c) => c.name === 'TroopCatapultSummonTroopNew' && c.level === 1),
  ).toBe(true);
});

for (const slowed of [false, true])
  it(`friendly barrel phases retain action-rate scaling, slowed=${slowed}`, () => {
    const r = troopLauncherBattle(1, 223),
      factor = slowed ? 2 : 0.5;
    // Controlled status clocks; ordinary friendly spell immunity remains unchanged.
    r.unit.native!.effects = slowed
      ? { poison: { since: 0, until: 100, dps: 0, speed: 0, attackSpeed: -0.5 } }
      : { boost: { until: 100, damage: 0, speed: 0, attackSpeed: 1 } };
    for (const b of r.battle.buildings) b.hp = b.maxHp = 1e9;
    r.untilShots(2);
    expect(r.packets[0].launched).toBeCloseTo(1 + 0.2 * factor, 8);
    expect(r.packets[1].launched - r.packets[0].launched).toBeCloseTo(6 * factor, 8);
    expect(r.packets.every((p) => p.damage === 6)).toBe(true);
  });

it('loss of the qualifying group cancels its charge without spending a barrel', () => {
  const r = troopLauncherBattle(1, 223);
  r.until(1.1);
  const target = r.battle.units.find((u) => u.id === r.unit.healTarget)!;
  target.hp = 0;
  r.until(2);
  expect(r.packets).toHaveLength(0);
  expect(r.unit.native!.attacks ?? 0).toBe(0);
  const survivor = r.battle.units.find((u) => u.kind === 'archer' && u.hp > 0)!;
  r.battle.units.push({ ...structuredClone(survivor), id: 1000 });
  r.untilShots(1);
  expect(r.packets[0].launched).toBeCloseTo(2.2, 8);
  expect(r.packets[0].targetId).not.toBe(target.id);
});

it('irregular samples retain the full barrel cycle remainder', () => {
  const r = troopLauncherBattle(1, 223);
  for (const b of r.battle.buildings) b.hp = b.maxHp = 1e9;
  r.untilShots(1);
  const first = r.packets[0].launched;
  while (r.packets.length < 4) r.step(0.07);
  expect(Math.abs(r.packets[3].launched - first - 18)).toBeLessThan(0.07 + 1e-8);
});

it('a friendly launcher does not reduce ordinary Healer contributions', async () => {
  const { healerContribution } = await import('../src/game/healing');
  const r = troopLauncherBattle(1, 223, 11.4, Infinity),
    recipient = allyLike(r.unit, 201, 'giant', 10, 10),
    first = allyLike(r.unit, 202, 'healer', 10, 12),
    second = allyLike(r.unit, 203, 'healer', 10.2, 12);
  r.unit.x = 10;
  r.unit.y = 12;
  for (const u of [r.unit, first, second]) u.healTarget = recipient.id;
  r.battle.units.push(recipient, first, second);
  expect(healerContribution(r.battle, recipient, second.id)).toBe(1);
});
