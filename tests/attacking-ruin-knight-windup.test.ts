import { expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { GameModel, makeBuilding, type FX } from '../src/game/model';
import { nativeUnitRow, nativeUnitStats } from '../src/game/native-units';
import { splitTiming } from '../src/game/garrison-kinds';
import { spawnGarrisonDefender } from '../src/game/garrison-combat';
import { nativeTroopFacingTarget } from '../src/game/native-troop-facing';
import { applyShrink } from '../src/game/shrink-trap';
import { replayBattle } from '../src/game/replay';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import {
  attackingRuinKnightBattle,
  attackingRuinKnightRecording,
} from './fixtures/attacking-ruin-knight';

for (let level = 1; level <= 4; level++)
  for (const targetX of [16, 22])
    it(`Ruin Knight ${level} charges its first and repeat swings toward x=${targetX}`, () => {
      const r = attackingRuinKnightBattle(level, 219, true, targetX),
        stats = nativeUnitStats('ruinknight', level);
      expect(r.unit.level).toBe(level);
      expect(r.unit.maxHp).toBe(2800 + level * 300);
      expect(stats).toMatchObject({
        dps: 225 + level * 30,
        range: 0.6,
        groundTargets: true,
        airTargets: false,
        damageMultiplier: 3,
        damageMultiplierTarget: 'Wall',
      });
      expect(splitTiming(nativeUnitRow('ruinknight', level))).toMatchObject({
        firstHit: 1,
        period: 1,
        recovery: 0,
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
      expect(target.hp).toBeCloseTo(hp - stats.damage, 8);
      expect(r.unit.native!.attackWindup!.recovery).toBe(0);
      expect(r.battle.projectiles.some((p) => p.sourceId === r.unit.id)).toBe(false);
      r.untilAttacks(3);
      expect(r.battle.elapsed - first).toBeCloseTo(2, 8);
    });

for (const hold of ['frozenUntil', 'stunUntil'] as const)
  it(`${hold} holds a Ruin Knight charge through partial thaw`, () => {
    const r = attackingRuinKnightBattle();
    while (!r.unit.attacking) r.step();
    const engaged = r.battle.elapsed,
      active = r.unit.native!.attackWindup!.actionDt;
    r.unit.native!.effects = { [hold]: engaged + 1.025 };
    r.untilAttacks(1);
    expect(r.battle.elapsed - engaged + active).toBeCloseTo(2.05, 8);
  });

for (const slowed of [false, true])
  it(`Ruin Knight first and repeat attacks scale with action rate, slow=${slowed}`, () => {
    const r = attackingRuinKnightBattle(),
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

it('Shrink doubles Ruin Knight charge time without reducing its hit damage', () => {
  const r = attackingRuinKnightBattle();
  applyShrink(r.unit, r.battle.elapsed);
  while (!r.unit.attacking) r.step();
  const engaged = r.battle.elapsed,
    active = r.unit.native!.attackWindup!.actionDt,
    target = r.battle.buildings.find((b) => b.id === r.unit.target)!,
    hp = target.hp;
  r.untilAttacks(1);
  expect(r.battle.elapsed - engaged + active * 2).toBeCloseTo(2, 8);
  expect(target.hp).toBeCloseTo(hp - 255, 8);
});

it('Ruin Knight charges direct ground-defender hits and ignores nearby air defenders', () => {
  const r = attackingRuinKnightBattle(),
    guard = spawnGarrisonDefender(r.battle, 'golem', 8, 1, r.unit.x + 0.2, r.unit.y, 0),
    air = spawnGarrisonDefender(r.battle, 'dragon', 7, 1, r.unit.x + 0.1, r.unit.y, 0),
    events: FX[] = [];
  for (const d of [guard, air]) {
    d.alerted = true;
    d.stunnedUntil = 100;
  }
  r.model.onEffect = (fx) => events.push(fx);
  while (!r.unit.attacking) r.step();
  expect(guard.hp).toBe(guard.maxHp);
  expect(r.unit.native!.attacks ?? 0).toBe(0);
  r.untilAttacks(1);
  expect(guard.hp).toBe(guard.maxHp - 255);
  expect(air.hp).toBe(air.maxHp);
  expect(events.find((fx) => fx.type === 'hit' && fx.sourceId === r.unit.id)).toMatchObject({
    targetId: guard.id,
    targetDefender: true,
  });
  expect(r.battle.projectiles.some((p) => p.sourceId === r.unit.id)).toBe(false);
});

it('Ruin Knight retains threefold damage against a committed wall', () => {
  const r = attackingRuinKnightBattle();
  while (!r.unit.attacking) r.step();
  const target = r.battle.buildings.find((b) => b.id === r.unit.target)!,
    hp = target.hp;
  target.kind = 'wall';
  r.untilAttacks(1);
  expect(target.hp).toBeCloseTo(hp - 765, 8);
});

it('Ruin Knight faces a committed wall ahead of its defender target', () => {
  const r = attackingRuinKnightBattle(),
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

it('a new Ruin Knight target requires a fresh charge', () => {
  const r = attackingRuinKnightBattle();
  while (!r.unit.attacking) r.step();
  const target = r.battle.buildings.find((b) => b.id === r.unit.target)!;
  r.battle.buildings.push(makeBuilding(4, 'barracks', target.x, target.y, 16));
  r.until(r.battle.elapsed + 0.3);
  const replaced = r.battle.elapsed;
  r.model.damage(target, target.hp);
  r.untilAttacks(1);
  expect(r.unit.target).toBe(4);
  expect(r.battle.elapsed - replaced).toBeCloseTo(1, 8);
});

it('a defeated Ruin Knight cannot complete its pending swing', () => {
  const r = attackingRuinKnightBattle();
  while (!r.unit.attacking) r.step();
  const target = r.battle.buildings.find((b) => b.id === r.unit.target)!,
    hp = target.hp;
  r.unit.hp = 0;
  r.until(r.battle.elapsed + 1.2);
  expect(r.unit.native!.attacks ?? 0).toBe(0);
  expect(target.hp).toBe(hp);
});

it('Ruin Knight keeps attack remainders across irregular steps', () => {
  const r = attackingRuinKnightBattle(),
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

for (let level = 1; level <= 4; level++)
  it(`Ruin Witch ${level} keeps her summon and the Knight's fixed health decay`, () => {
    const old = attackingRuinKnightBattle(level, 218),
      current = attackingRuinKnightBattle(level, 219);
    expect(current.battle.elapsed).toBe(old.battle.elapsed);
    expect(current.unit.spawnedAt).toBe(old.unit.spawnedAt);
    expect(current.unit.maxHp).toBe(old.unit.maxHp);
    expect(current.unit.native!.owner).toBe(current.parent.id);
    for (const r of [old, current]) {
      r.unit.native!.effects = { frozenUntil: 100 };
      r.until(r.battle.elapsed + 2);
    }
    expect(current.unit.hp).toBe(old.unit.hp);
    expect(current.unit.maxHp - current.unit.hp).toBe(160);
    expect(current.parent.native!.summoned).toBe(1);
  });

it('only new recordings carrying Ruin Witch allocate the Knight charge', () => {
  const r = attackingRuinKnightBattle(1, 218);
  expect(replayBattle(r.data.initial, 218).nativeRuinKnightWindup).toBeUndefined();
  expect(replayBattle(r.data.initial, 219).nativeRuinKnightWindup).toBe(true);
  r.data.initial.army.ruinwitch = 0;
  expect(replayBattle(r.data.initial, 219).nativeRuinKnightWindup).toBeUndefined();
});

for (const version of [218, 219])
  for (const level of [1, 4])
    for (const targetX of [16, 22])
      it(`Ruin Knight ${level} at x=${targetX} preserves full portable version-${version} snapshots`, () => {
        const r = attackingRuinKnightRecording(level, version, targetX),
          viewer = new GameModel();
        if (version === 218) {
          const hashes: Record<string, string> = {
            '1:16': '5cf553c6e31b253394e545500e1c2c397826d8440aba6deab8bef27c79650bb4',
            '1:22': '7a4f9e0e69af0273ba34f263b8973fef9ab891d2a677f0e05f0ad6e0ee264c71',
            '4:16': '77c638168c154060fcae96a933634ed4f19c76dca550b8d47fb7613353d911dc',
            '4:22': '1f7a9b8355d8cbb894fd630a0916cf56c3c3eb5908cc506d05f581325bab04b9',
          };
          expect(createHash('sha256').update(JSON.stringify(r.snapshots)).digest('hex')).toBe(
            hashes[`${level}:${targetX}`],
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
