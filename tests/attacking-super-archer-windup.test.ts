import { expect, it } from 'vitest';
import { GameModel, makeBuilding } from '../src/game/model';
import { nativeUnitStats } from '../src/game/native-units';
import { spawnGarrisonDefender } from '../src/game/garrison-combat';
import { hurtUnit } from '../src/game/native-status';
import { replayBattle } from '../src/game/replay';
import { emptyArmy } from '../src/game/army';
import { applyShrink } from '../src/game/shrink-trap';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { nativeDirectBattle } from './fixtures/native-direct-attacks';
import { superArcherRecording } from './fixtures/attacking-super-archer';
import { nativeTargetingSpellRecording } from './fixtures/native-targeting-spells';

function verifyPortable(r: {
  data: Parameters<typeof makeReplayFile>[0];
  snapshots: { at: number; battle: unknown }[];
}) {
  const viewer = new GameModel();
  expect(viewer.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(true);
  for (const s of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
    viewer.seekReplay(s.at);
    while (viewer.replay!.seeking) viewer.step(0.05);
    expect(JSON.parse(JSON.stringify(viewer.battle))).toEqual(s.battle);
  }
}

for (let level = 1; level <= 10; level++)
  for (const x of [11.4, 2.9])
    it(`Super Archer ${level} charges after approaching from ${x} before releasing its piercing ray`, () => {
      const r = nativeDirectBattle('superarcher', level, 198, x),
        target = r.battle.buildings.find((b) => b.id === 2)!,
        damage = nativeUnitStats('superarcher', level).damage;
      while (!r.unit.attacking) r.step();
      const engaged = r.battle.elapsed;
      expect(target.hp).toBe(target.maxHp);
      r.untilAttacks(1);
      const first = r.battle.elapsed,
        shot = r.battle.nativeArcherShots!.find((s) => s.sourceId === r.unit.id)!;
      expect(first - engaged + 0.05).toBeCloseTo(1.5, 8);
      expect(shot).toMatchObject({
        level,
        damage,
        speed: 14,
        radius: 0.3,
        projectile: 'magic_archer_projectile',
        travelled: 0,
      });
      expect(shot.length).toBeCloseTo(Math.hypot(14.5 - shot.fromX, 11.5 - shot.fromY) + 4, 8);
      expect(r.battle.projectiles?.some((p) => p.sourceId === r.unit.id) ?? false).toBe(false);
      expect(target.hp).toBe(target.maxHp);
      while (!shot.hit.some((h) => h.target.building && h.target.id === 2)) r.step();
      expect(target.hp).toBe(target.maxHp - damage);
      r.untilAttacks(2);
      expect(r.unit.native!.lastAttackAt! - first).toBeCloseTo(1.5, 8);
      expect(shot.hit.filter((h) => h.target.building && h.target.id === 2)).toHaveLength(1);
    });

it('only a carried Super Archer enables the version 198 charge', () => {
  const r = nativeDirectBattle('superarcher');
  expect(replayBattle(r.data.initial, 197).nativeSuperArcherWindup).toBeUndefined();
  expect(replayBattle(r.data.initial, 198).nativeSuperArcherWindup).toBe(true);
  r.data.initial.army.superarcher = 0;
  expect(replayBattle(r.data.initial, 198).nativeSuperArcherWindup).toBeUndefined();
});

for (const air of [false, true])
  it(`a charged ${air ? 'air' : 'ground'} primary launches one ray through both defender layers`, () => {
    const r = nativeDirectBattle('superarcher'),
      primary = spawnGarrisonDefender(
        r.battle,
        air ? 'dragon' : 'golem',
        air ? 7 : 8,
        1,
        12,
        11.5,
        0,
      ),
      ground = spawnGarrisonDefender(r.battle, 'golem', 8, 1, 13, 11.5, 0),
      flying = spawnGarrisonDefender(r.battle, 'dragon', 7, 1, 14, 11.5, 0);
    for (const d of [primary, ground, flying]) {
      d.alerted = true;
      d.stunnedUntil = 100;
    }
    r.untilAttacks(1);
    const shot = r.battle.nativeArcherShots![0];
    expect(r.battle.elapsed).toBeCloseTo(1.5, 8);
    expect(r.unit.native!.attackWindup!.target).toEqual({ id: primary.id, building: false });
    expect(primary.hp).toBe(primary.maxHp);
    r.until(shot.launched + shot.length / shot.speed);
    for (const d of [primary, ground, flying]) {
      expect(d.hp).toBe(d.maxHp - 126);
      expect(shot.hit.filter((h) => !h.target.building && h.target.id === d.id)).toHaveLength(1);
    }
    expect(shot.hit.some((h) => h.air)).toBe(true);
    expect(r.unit.native!.attacks).toBe(1);
  });

it('Freeze and stun hold the charge and repeat cycle', () => {
  const r = nativeDirectBattle('superarcher');
  r.until(0.3);
  const before = structuredClone(r.unit.native!.attackWindup);
  (r.unit.native!.effects ??= {}).frozenUntil = 1.3;
  r.until(1.25);
  expect(r.unit.native!.attackWindup).toEqual(before);
  r.untilAttacks(1);
  expect(r.battle.elapsed).toBeCloseTo(2.5, 8);
  const first = r.battle.elapsed;
  r.step();
  r.unit.native!.effects!.stunUntil = r.battle.elapsed + 1;
  r.untilAttacks(2);
  expect(r.battle.elapsed - first).toBeCloseTo(2.5, 8);
});
for (const slowed of [false, true])
  it(`action modifiers scale both source charges, slowed=${slowed}`, () => {
    const r = nativeDirectBattle('superarcher');
    (r.unit.native ??= {}).effects = slowed
      ? { poison: { since: 0, until: 100, dps: 0, speed: 0, attackSpeed: -0.5 } }
      : { boost: { until: 100, damage: 0, speed: 0, attackSpeed: 1 } };
    r.untilAttacks(1);
    const first = r.battle.elapsed,
      period = slowed ? 3 : 0.75;
    expect(first).toBeCloseTo(period, 8);
    r.untilAttacks(2);
    expect(r.battle.elapsed - first).toBeCloseTo(period, 8);
  });
it('retains sub-step remainder across successive piercing releases', () => {
  const r = nativeDirectBattle('superarcher'),
    releases: number[] = [];
  r.step();
  for (let n = 1; n <= 8; n++) {
    while ((r.unit.native!.attacks ?? 0) < n) r.model.step(0.08);
    releases.push(r.unit.native!.lastAttackAt!);
  }
  expect(Math.abs(releases[7] - releases[0] - 7 * 1.5)).toBeLessThan(0.08 + 1e-8);
});
it('replacing a destroyed target starts a fresh charge', () => {
  const r = nativeDirectBattle('superarcher'),
    target = r.battle.buildings.find((b) => b.id === 2)!;
  r.battle.buildings.push(makeBuilding(3, 'goldstorage', 13, 10, 18));
  r.until(0.4);
  r.model.damage(target, target.hp);
  r.step();
  const changed = r.battle.elapsed;
  r.untilAttacks(1);
  expect(r.battle.elapsed - changed + 0.05).toBeCloseTo(1.5, 8);
  expect(r.unit.target).toBe(3);
});
it('a released arrow keeps piercing after its shooter is defeated', () => {
  const r = nativeDirectBattle('superarcher');
  r.untilAttacks(1);
  const shot = r.battle.nativeArcherShots![0],
    target = r.battle.buildings.find((b) => b.id === 2)!;
  hurtUnit(r.battle, r.unit, r.unit.hp);
  r.until(shot.launched + shot.length / shot.speed);
  expect(target.hp).toBe(target.maxHp - 126);
  expect(shot.travelled).toBe(shot.length);
});
it('the charged arrow keeps its original line when its primary moves away', () => {
  const r = nativeDirectBattle('superarcher'),
    primary = spawnGarrisonDefender(r.battle, 'golem', 8, 1, 12, 11.5, 0),
    collateral = spawnGarrisonDefender(r.battle, 'dragon', 7, 1, 14, 11.5, 0);
  for (const d of [primary, collateral]) {
    d.alerted = true;
    d.stunnedUntil = 100;
  }
  r.untilAttacks(1);
  const shot = r.battle.nativeArcherShots![0],
    direction = { x: shot.dirX, y: shot.dirY };
  primary.y = 15;
  r.until(shot.launched + shot.length / shot.speed);
  expect(primary.hp).toBe(primary.maxHp);
  expect(collateral.hp).toBe(collateral.maxHp - 126);
  expect({ x: shot.dirX, y: shot.dirY }).toEqual(direction);
});
for (const shrink of [false, true])
  it(`Shrink scales the Super Archer charge without changing ray damage or health, shrunk=${shrink}`, () => {
    const r = nativeDirectBattle('superarcher');
    if (shrink) applyShrink(r.unit, 0);
    r.untilAttacks(1);
    expect(r.battle.elapsed).toBeCloseTo(shrink ? 3 : 1.5, 8);
    expect(r.battle.nativeArcherShots![0].damage).toBe(126);
    expect([r.unit.hp, r.unit.maxHp]).toEqual([300, 300]);
  });
it('a final released arrow can finish the village after its shooter falls', () => {
  const r = nativeDirectBattle('superarcher'),
    hall = r.battle.buildings.find((b) => b.id === 1)!,
    target = r.battle.buildings.find((b) => b.id === 2)!;
  r.model.damage(hall, hall.hp);
  r.model.damage(target, target.hp - 126);
  r.battle.remaining = emptyArmy();
  r.untilAttacks(1);
  const shot = r.battle.nativeArcherShots![0];
  hurtUnit(r.battle, r.unit, r.unit.hp);
  r.step();
  expect(r.battle.finished).toBe(false);
  while (!r.battle.finished && r.battle.elapsed < shot.launched + shot.length / shot.speed)
    r.step();
  expect(r.battle.result).toMatchObject({ stars: 3, destruction: 100 });
});
it('shoots a blocking Wall before continuing its ground route', () => {
  const r = nativeDirectBattle('superarcher', 1, 198, 2.9);
  r.battle.buildings.find((b) => b.id === 2)!.x = 22;
  const walls = Array.from({ length: 48 }, (_, y) => makeBuilding(1000 + y, 'wall', 12, y, 18));
  r.battle.buildings.push(...walls);
  r.untilAttacks(1);
  const shot = r.battle.nativeArcherShots![0],
    wall = walls.find((w) => w.id === r.unit.native!.attackWindup!.target!.id)!;
  expect(wall).toBeDefined();
  expect(r.unit.x).toBeLessThan(12);
  r.until(shot.launched + shot.length / shot.speed);
  expect(wall.hp).toBe(wall.maxHp - 126);
});
for (const kind of ['bomb', 'airbomb', 'seekingairmine'] as const)
  it(`keeps ${kind} trigger eligibility while charging`, () => {
    const r = nativeDirectBattle('superarcher'),
      trap = makeBuilding(3, kind, 11, 11, 1);
    r.battle.buildings.push(trap);
    r.step();
    expect(r.unit.native?.attacks ?? 0).toBe(0);
    expect(r.battle.traps[trap.id] !== undefined).toBe(kind === 'bomb');
  });

for (const version of [197, 198])
  for (const level of [1, 10])
    for (const target of ['storage', 'cannon', 'golem', 'dragon'] as const)
      it(`tier ${level} actual ${target} fight reconstructs complete version ${version} states`, () => {
        const r = superArcherRecording(version, level, target);
        expect(r.first - r.engaged + (version >= 198 ? 0.05 : 0)).toBeCloseTo(
          version >= 198 ? 1.5 : 0,
          8,
        );
        expect(r.second - r.first).toBeCloseTo(1.5, 8);
        expect(r.shot.damage).toBe(nativeUnitStats('superarcher', level).damage);
        if (r.defenderId !== undefined)
          expect(
            r.snapshots[0].battle.defenders!.find((d) => d.id === r.defenderId)!.frozenUntil,
          ).toBeGreaterThan(r.secondHit);
        verifyPortable(r);
      });
for (const level of [1, 4])
  it(`actual Angry Spell ${level} discards Super Archer's pending ray target`, () => {
    const r = nativeTargetingSpellRecording('AngrySpell', level, 198, 'superarcher', 2, 0.05, 6),
      pending = r.snapshots.find((s) => s.at === r.pending)!
        .battle as import('../src/game/model').Battle,
      after = r.snapshots.find((s) => s.at === r.impact)!
        .battle as import('../src/game/model').Battle,
      old = pending.units.find((u) => u.id === r.unitId)!,
      u = after.units.find((u) => u.id === r.unitId)!;
    expect(old.native!.attackWindup).toMatchObject({
      engaged: true,
      target: { id: 2, building: true },
    });
    expect(old.native!.attackWindup!.remaining).toBeGreaterThan(0);
    expect(u.native!.attackWindup!.engaged).toBeUndefined();
    expect(u.target).toBe(3);
    expect(u.native!.attacks ?? 0).toBe(0);
    verifyPortable(r);
  });
