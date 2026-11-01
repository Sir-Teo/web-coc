import { expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { GameModel, makeBuilding, type FX } from '../src/game/model';
import { nativeUnitRow, nativeUnitStats } from '../src/game/native-units';
import { splitTiming } from '../src/game/garrison-kinds';
import { spawnGarrisonDefender } from '../src/game/garrison-combat';
import { applyShrink } from '../src/game/shrink-trap';
import { replayBattle } from '../src/game/replay';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { attackingBoogerBattle, attackingBoogerRecording } from './fixtures/attacking-booger';

for (let level = 1; level <= 10; level++)
  for (const x of [11.4, 1.4])
    it(`Booger ${level} charges after approaching from ${x}`, () => {
      const r = attackingBoogerBattle(level, 215, x),
        s = nativeUnitStats('booger', level),
        target = r.battle.buildings.find((b) => b.id === 2)!,
        hp = target.hp;
      expect(r.unit.level).toBe(level);
      expect(splitTiming(nativeUnitRow('booger', level))).toMatchObject({
        firstHit: 1,
        recovery: 0,
        period: 1,
      });
      while (!r.unit.attacking) r.step();
      const engaged = r.battle.elapsed,
        active = r.unit.native!.attackWindup!.actionDt;
      expect(r.unit.native!.attacks ?? 0).toBe(0);
      expect(r.unit.native!.attackWindup!.animationOffset).toBeLessThan(0);
      r.untilAttacks(1);
      const first = r.battle.elapsed;
      expect(r.unit.native!.attackWindup!.animationOffset).toBe(0);
      expect(first - engaged + active).toBeCloseTo(1, 8);
      expect(target.hp).toBeCloseTo(hp - s.damage, 8);
      expect(r.battle.projectiles?.some((p) => p.sourceId === r.unit.id)).toBe(false);
      r.untilAttacks(3);
      expect(r.battle.elapsed - first).toBeCloseTo(2, 8);
    });

it('version 214 retains immediate Booger attacks and previous phase state', () => {
  const r = attackingBoogerBattle(1, 214);
  while (!r.unit.attacking) r.step();
  expect(r.unit.native!.attacks).toBe(1);
  expect(r.unit.native!.attackWindup).toBeUndefined();
});

for (const hold of ['frozenUntil', 'stunUntil'] as const)
  it(`${hold} preserves the Booger charge through a partial thaw`, () => {
    const r = attackingBoogerBattle(1, 215);
    while (!r.unit.attacking) r.step();
    const engaged = r.battle.elapsed,
      active = r.unit.native!.attackWindup!.actionDt;
    r.unit.native!.effects = { [hold]: engaged + 1.025 };
    r.untilAttacks(1);
    expect(r.battle.elapsed - engaged + active).toBeCloseTo(2.05, 8);
  });

for (const slowed of [false, true])
  it(`Booger first and repeat phases scale, slowed=${slowed}`, () => {
    const r = attackingBoogerBattle(1, 215),
      scale = slowed ? 2 : 0.5;
    r.unit.native!.effects = slowed
      ? { poison: { since: 0, until: 100, dps: 0, speed: 0, attackSpeed: -0.5 } }
      : { boost: { until: 100, damage: 0, speed: 0, attackSpeed: 1 } };
    while (!r.unit.attacking) r.step();
    const engaged = r.battle.elapsed;
    r.untilAttacks(1);
    const first = r.battle.elapsed;
    expect(first - engaged + 0.05).toBeCloseTo(scale, 8);
    r.untilAttacks(3);
    expect(r.battle.elapsed - first).toBeCloseTo(2 * scale, 8);
  });

it('Shrink doubles the charge while preserving Booger hit damage', () => {
  const r = attackingBoogerBattle(1, 215),
    target = r.battle.buildings.find((b) => b.id === 2)!,
    hp = target.hp;
  applyShrink(r.unit, r.battle.elapsed);
  while (!r.unit.attacking) r.step();
  const engaged = r.battle.elapsed;
  r.untilAttacks(1);
  expect(r.battle.elapsed - engaged + 0.05).toBeCloseTo(2, 8);
  expect(target.hp).toBe(hp - 105);
});

for (const air of [false, true])
  it(`Booger charges a direct hit against a ${air ? 'flying' : 'ground'} defender`, () => {
    const r = attackingBoogerBattle(1, 215),
      guard = spawnGarrisonDefender(
        r.battle,
        air ? 'dragon' : 'golem',
        air ? 7 : 8,
        1,
        r.unit.x + 0.1,
        r.unit.y,
        0,
      ),
      events: FX[] = [];
    guard.alerted = true;
    guard.stunnedUntil = 100;
    r.model.onEffect = (fx) => events.push(fx);
    while (!r.unit.attacking) r.step();
    const hp = guard.hp,
      engaged = r.battle.elapsed;
    r.untilAttacks(1);
    expect(r.battle.elapsed - engaged + 0.05).toBeCloseTo(1, 8);
    expect(guard.hp).toBe(hp - 105);
    expect(r.battle.projectiles?.some((p) => p.sourceId === r.unit.id)).toBe(false);
    expect(events.find((fx) => fx.type === 'hit' && fx.sourceId === r.unit.id)).toMatchObject({
      targetId: guard.id,
      targetDefender: true,
      fromAir: true,
      toAir: air,
    });
  });

it('Booger flies over a Wall to charge its building', () => {
  const r = attackingBoogerBattle(1, 215, 1.4);
  for (let y = 0; y < 48; y++) r.battle.buildings.push(makeBuilding(2000 + y, 'wall', 12, y, 15));
  r.untilAttacks(1);
  expect(r.unit.target).toBe(2);
  expect(r.battle.buildings.filter((b) => b.kind === 'wall').every((b) => b.hp === b.maxHp)).toBe(
    true,
  );
});

it('Booger starts a fresh charge after its building is replaced', () => {
  const r = attackingBoogerBattle(1, 215);
  r.battle.buildings.push(makeBuilding(3, 'goldstorage', 13, 10, 18));
  while (!r.unit.attacking) r.step();
  r.until(r.battle.elapsed + 0.2);
  const replaced = r.battle.elapsed,
    target = r.battle.buildings.find((b) => b.id === 2)!;
  r.model.damage(target, target.hp);
  r.untilAttacks(1);
  expect(r.unit.target).toBe(3);
  expect(r.battle.elapsed - replaced).toBeCloseTo(1, 8);
});

it('a defeated Booger cannot complete its unreleased hit', () => {
  const r = attackingBoogerBattle(1, 215),
    target = r.battle.buildings.find((b) => b.id === 2)!;
  while (!r.unit.attacking) r.step();
  const hp = target.hp;
  r.unit.hp = 0;
  r.until(r.battle.elapsed + 1.2);
  expect(target.hp).toBe(hp);
  expect(r.unit.native!.attacks ?? 0).toBe(0);
});

it('Booger retains repeat remainders with irregular samples', () => {
  const r = attackingBoogerBattle(1, 215),
    deltas = [0.02, 0.075, 0.04, 0.1],
    hits: number[] = [];
  let i = 0;
  while (hits.length < 4) {
    if (r.battle.elapsed > 20) throw Error('Irregular Booger checkpoint expired');
    const count = r.unit.native!.attacks ?? 0;
    r.model.step(deltas[i++ % deltas.length]);
    if ((r.unit.native!.attacks ?? 0) > count) hits.push(r.battle.elapsed);
  }
  for (let n = 1; n < hits.length; n++)
    expect(Math.abs(hits[n] - hits[0] - n)).toBeLessThan(0.1 + 1e-8);
});

it('only setups carrying Sneezy enable Booger windup', () => {
  const r = attackingBoogerBattle(1, 215);
  expect(replayBattle(r.data.initial, 215).nativeBoogerWindup).toBe(true);
  expect(replayBattle(r.data.initial, 214).nativeBoogerWindup).toBeUndefined();
  r.data.initial.heroes![0].pet = { kind: 'unicorn', level: 1 };
  expect(replayBattle(r.data.initial, 215).nativeBoogerWindup).toBeUndefined();
  r.data.initial.heroes = [];
  expect(replayBattle(r.data.initial, 215).nativeBoogerWindup).toBeUndefined();
});

for (const version of [214, 215])
  for (const level of [1, 10])
    for (const x of [11.4, 1.4])
      it(`real Booger ${level} from ${x} replays ${version} in both directions`, () => {
        const r = attackingBoogerRecording(level, version, x),
          viewer = new GameModel();
        if (version === 214) {
          // Complete snapshots captured before introducing version 215.
          const baseline = {
            '1:11.4': '282f277ca5842e4d04fe44feb41b2c1b5a355624b5dda1c471ca3d2bc18a737f',
            '1:1.4': 'cd5950abd42b2fe347969fdb70744088803c16c659bb82d6e53d4bd6f55dc61b',
            '10:11.4': '80118413c5726b9cd2dd2f3260aa3ff40ab22f8911c9e1213ed56ef70fbedc7a',
            '10:1.4': '32157f4f4f19a80f70b9a85b5651d0a1595301f8a6bed044ce2d0e7e5d2d404b',
          };
          expect(createHash('sha256').update(JSON.stringify(r.snapshots)).digest('hex')).toBe(
            baseline[`${level}:${x}`],
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
