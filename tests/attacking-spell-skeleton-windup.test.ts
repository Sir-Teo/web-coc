import { expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { GameModel, makeBuilding, type FX } from '../src/game/model';
import { nativeUnitRow, nativeUnitStats } from '../src/game/native-units';
import { splitTiming } from '../src/game/garrison-kinds';
import { nativeTroopFacingTarget } from '../src/game/native-troop-facing';
import { spawnGarrisonDefender } from '../src/game/garrison-combat';
import { applyShrink } from '../src/game/shrink-trap';
import { replayBattle } from '../src/game/replay';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import {
  attackingSpellSkeletonBattle,
  attackingSpellSkeletonRecording,
} from './fixtures/attacking-spell-skeletons';

for (const unshielded of [false, true])
  it(`${unshielded ? 'unshielded' : 'shielded'} spell Skeleton spends its source first swing`, () => {
    const r = attackingSpellSkeletonBattle(1, 218, unshielded);
    expect(splitTiming(nativeUnitRow(r.kind, 1))).toMatchObject({
      firstHit: 1,
      period: 1,
      recovery: 0,
    });
    while (!r.unit.attacking) r.step();
    expect(r.unit.native?.attacks ?? 0).toBe(0);
  });

for (const unshielded of [false, true]) {
  it(`spell Skeleton shieldless=${unshielded} faces its committed blocking wall`, () => {
    const r = attackingSpellSkeletonBattle(1, 218, unshielded),
      wall = makeBuilding(55, 'wall', 10, 10, 15);
    r.battle.buildings.push(wall);
    while (!r.unit.attacking) r.step();
    r.unit.native!.attackWindup!.target = { id: 55, building: true };
    delete r.unit.native!.wallTarget;
    const guard = spawnGarrisonDefender(r.battle, 'golem', 8, 1, r.unit.x + 0.1, r.unit.y, 0);
    r.unit.defenderTarget = guard.id;
    const before = JSON.stringify(r.battle);
    expect(nativeTroopFacingTarget(r.battle, r.unit)).toEqual({ x: 10.5, y: 10.5 });
    expect(JSON.stringify(r.battle)).toBe(before);
  });
  for (const level of [1, 8])
    for (const x of unshielded ? [13.7] : [11.4, 5])
      it(`spell Skeleton shieldless=${unshielded}, spell ${level}, from ${x} charges and repeats`, () => {
        const r = attackingSpellSkeletonBattle(level, 218, unshielded, x),
          stats = nativeUnitStats(r.kind, 1);
        expect(r.unit.level).toBe(1);
        expect(stats).toMatchObject({
          hp: 30,
          dps: 25,
          damage: 25,
          range: 0.4,
          flying: false,
          airTargets: false,
          groundTargets: true,
        });
        while (!r.unit.attacking) r.step();
        const engaged = r.battle.elapsed,
          active = r.unit.native!.attackWindup!.actionDt,
          target = r.battle.buildings.find((b) => b.id === r.unit.target)!,
          hp = target.hp;
        expect(r.unit.native!.attacks ?? 0).toBe(0);
        expect(r.unit.native!.attackWindup!.animationOffset).toBeLessThan(0);
        r.untilAttacks(1);
        const first = r.battle.elapsed;
        expect(first - engaged + active).toBeCloseTo(1, 8);
        expect(target.hp).toBeCloseTo(hp - 25, 8);
        expect(r.unit.native!.attackWindup!.recovery).toBe(0);
        expect(r.battle.projectiles?.some((p) => p.sourceId === r.unit.id)).toBe(false);
        r.untilAttacks(3);
        expect(r.battle.elapsed - first).toBeCloseTo(2, 8);
      });

  for (const hold of ['frozenUntil', 'stunUntil'] as const)
    it(`${hold} holds spell Skeleton shieldless=${unshielded} through partial thaw`, () => {
      const r = attackingSpellSkeletonBattle(1, 218, unshielded);
      while (!r.unit.attacking) r.step();
      const engaged = r.battle.elapsed,
        active = r.unit.native!.attackWindup!.actionDt;
      r.unit.native!.effects = { [hold]: engaged + 1.025 };
      r.untilAttacks(1);
      expect(r.battle.elapsed - engaged + active).toBeCloseTo(2.05, 8);
    });

  for (const slowed of [false, true])
    it(`spell Skeleton shieldless=${unshielded} scales first and repeat phases, slow=${slowed}`, () => {
      const r = attackingSpellSkeletonBattle(1, 218, unshielded),
        scale = slowed ? 2 : 0.5;
      r.unit.native!.effects = slowed
        ? { poison: { since: 0, until: 100, dps: 0, speed: 0, attackSpeed: -0.5 } }
        : { boost: { until: 100, damage: 0, speed: 0, attackSpeed: 1 } };
      while (!r.unit.attacking) r.step();
      const engaged = r.battle.elapsed,
        active = r.unit.native!.attackWindup!.actionDt;
      r.untilAttacks(1);
      const first = r.battle.elapsed;
      expect(first - engaged + active * scale).toBeCloseTo(scale, 8);
      r.untilAttacks(3);
      expect(r.battle.elapsed - first).toBeCloseTo(2 * scale, 8);
    });

  it(`Shrink doubles spell Skeleton shieldless=${unshielded} attack time and retains damage`, () => {
    const r = attackingSpellSkeletonBattle(1, 218, unshielded);
    applyShrink(r.unit, r.battle.elapsed);
    while (!r.unit.attacking) r.step();
    const engaged = r.battle.elapsed,
      active = r.unit.native!.attackWindup!.actionDt,
      target = r.battle.buildings.find((b) => b.id === r.unit.target)!,
      hp = target.hp;
    r.untilAttacks(1);
    expect(r.battle.elapsed - engaged + active * 2).toBeCloseTo(2, 8);
    expect(target.hp).toBeCloseTo(hp - 25, 8);
  });

  it(`spell Skeleton shieldless=${unshielded} charges a direct ground defender hit`, () => {
    const r = attackingSpellSkeletonBattle(1, 218, unshielded),
      guard = spawnGarrisonDefender(r.battle, 'golem', 8, 1, r.unit.x + 0.1, r.unit.y, 0),
      events: FX[] = [];
    guard.alerted = true;
    guard.stunnedUntil = 100;
    r.model.onEffect = (fx) => events.push(fx);
    r.untilAttacks(1);
    expect(guard.hp).toBe(guard.maxHp - 25);
    expect(events.find((fx) => fx.type === 'hit' && fx.sourceId === r.unit.id)).toMatchObject({
      targetId: guard.id,
      targetDefender: true,
    });
    expect(r.battle.projectiles?.some((p) => p.sourceId === r.unit.id)).toBe(false);
  });

  it(`spell Skeleton shieldless=${unshielded} ignores air defenders`, () => {
    const r = attackingSpellSkeletonBattle(1, 218, unshielded),
      guard = spawnGarrisonDefender(r.battle, 'dragon', 7, 1, r.unit.x + 0.1, r.unit.y, 0);
    guard.alerted = true;
    guard.stunnedUntil = 100;
    r.untilAttacks(1);
    expect(r.unit.defenderTarget).toBeUndefined();
    expect(guard.hp).toBe(guard.maxHp);
  });

  it(`spell Skeleton shieldless=${unshielded} retains its resource damage reduction`, () => {
    const r = attackingSpellSkeletonBattle(1, 218, unshielded);
    while (!r.unit.attacking) r.step();
    const target = r.battle.buildings.find((b) => b.id === r.unit.target)!,
      hp = target.hp;
    target.kind = 'goldstorage';
    r.untilAttacks(1);
    expect(target.hp).toBeCloseTo(hp - 3.75, 8);
  });

  it(`spell Skeleton shieldless=${unshielded} starts a fresh swing after retargeting`, () => {
    const r = attackingSpellSkeletonBattle(1, 218, unshielded);
    while (!r.unit.attacking) r.step();
    const target = r.battle.buildings.find((b) => b.id === r.unit.target)!;
    r.battle.buildings.push(makeBuilding(4, 'barracks', target.x, target.y, 16));
    r.until(r.battle.elapsed + 0.2);
    const replaced = r.battle.elapsed;
    r.model.damage(target, target.hp);
    r.untilAttacks(1);
    expect(r.unit.target).toBe(4);
    expect(r.battle.elapsed - replaced).toBeCloseTo(1, 8);
  });

  it(`a defeated spell Skeleton shieldless=${unshielded} cannot finish its swing`, () => {
    const r = attackingSpellSkeletonBattle(1, 218, unshielded);
    while (!r.unit.attacking) r.step();
    const target = r.battle.buildings.find((b) => b.id === r.unit.target)!,
      hp = target.hp;
    r.unit.hp = 0;
    r.until(r.battle.elapsed + 1.2);
    expect(r.unit.native!.attacks ?? 0).toBe(0);
    expect(target.hp).toBe(hp);
  });

  it(`spell Skeleton shieldless=${unshielded} retains period remainders for irregular steps`, () => {
    const r = attackingSpellSkeletonBattle(1, 218, unshielded),
      deltas = [0.02, 0.075, 0.04, 0.1],
      hits: number[] = [];
    let i = 0;
    while (hits.length < 4) {
      const before = r.unit.native!.attacks ?? 0;
      r.step(deltas[i++ % deltas.length]);
      if ((r.unit.native!.attacks ?? 0) > before) hits.push(r.battle.elapsed);
    }
    for (let n = 1; n < hits.length; n++)
      expect(Math.abs(hits[n] - hits[0] - n)).toBeLessThan(0.1 + 1e-8);
  });
}

it('breaking a shield discards its swing and gives the new body its own full charge', () => {
  const r = attackingSpellSkeletonBattle(1, 218, false, 11.4, false);
  while (!r.unit.attacking) r.step();
  r.until(r.battle.elapsed + 0.2);
  r.unit.hp = 0;
  r.step();
  const child = r.battle.units.find(
    (u) => u.kind === 'spellskeleton' && u.native?.owner === r.unit.id,
  )!;
  expect(child).toMatchObject({
    hp: 30,
    maxHp: 30,
    level: 1,
    x: r.unit.x,
    y: r.unit.y,
    spawnedAt: r.battle.elapsed,
  });
  expect(child.native!.attackWindup).toBeUndefined();
  const born = r.battle.elapsed;
  while (!(child.native!.attacks ?? 0)) r.step();
  expect(r.battle.elapsed - born).toBeCloseTo(1, 8);
  expect(r.unit.native!.attacks ?? 0).toBe(0);
});

for (let level = 1; level <= 8; level++)
  it(`Skeleton Spell ${level} retains the entire scheduled shielded squad`, () => {
    const old = attackingSpellSkeletonBattle(level, 217),
      current = attackingSpellSkeletonBattle(level, 218);
    old.until(16);
    current.until(16);
    const births = (r: typeof old) =>
      r.battle.units.map(({ id, kind, level, spawnedAt, maxHp, x, y }) => ({
        id,
        kind,
        level,
        spawnedAt,
        maxHp,
        x,
        y,
      }));
    expect(births(current)).toEqual(births(old));
    expect(current.battle.units).toHaveLength(11 + level);
    expect(
      current.battle.units.every((u) => u.kind === 'spellskeletonshielded' && u.level === 1),
    ).toBe(true);
  });

it('only new setups carrying Skeleton Spell enable these phases', () => {
  const r = attackingSpellSkeletonBattle(1, 217);
  expect(replayBattle(r.data.initial, 217).nativeSpellSkeletonWindup).toBeUndefined();
  expect(replayBattle(r.data.initial, 218).nativeSpellSkeletonWindup).toBe(true);
  r.data.initial.spells.skeleton = 0;
  expect(replayBattle(r.data.initial, 218).nativeSpellSkeletonWindup).toBeUndefined();
});

for (const version of [217, 218])
  for (const unshielded of [false, true])
    for (const level of [1, 8])
      for (const x of unshielded ? [13.7] : [11.4, 5])
        it(`spell Skeleton shieldless=${unshielded} level${level} from${x} replays ${version} in both directions`, () => {
          const r = attackingSpellSkeletonRecording(level, version, unshielded, x),
            viewer = new GameModel();
          if (version === 217) {
            const baseline = {
              'false:1:11.4': '2776bcacf0529fa1a7d646e705f7c8f119b78fe0d958a81cf2223e2af2d897b7',
              'false:1:5': '17048631832c7958e150838e22f3e96cf55b8399e09a15cdb97da9dced310d57',
              'false:8:11.4': '5d9f06e27150e557175fd12a5c8952e956313f0da3dc9364d413c6b89452448f',
              'false:8:5': '55e49bf8d0334905b0902ac3e05e2d499ca619ee12065447a9255c8e3a7b7ee6',
              'true:1:13.7': 'd5bbaa0bcefcf92006dc6a8ac89cebeb28938674e42f3044a0543db00f512c3e',
              'true:8:13.7': '1299af06eec868f8c4f487b5fb5e6338d459940e834dbccc6292be7fef571e4a',
            };
            expect(createHash('sha256').update(JSON.stringify(r.snapshots)).digest('hex')).toBe(
              baseline[`${unshielded}:${level}:${x}`],
            );
          }
          expect(viewer.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(
            true,
          );
          for (const s of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
            viewer.seekReplay(s.at);
            while (viewer.replay!.seeking) viewer.step(0.05);
            expect(JSON.parse(JSON.stringify(viewer.battle))).toEqual(s.battle);
          }
        });
