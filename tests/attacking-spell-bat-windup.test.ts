import { expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { GameModel, makeBuilding, type FX } from '../src/game/model';
import { nativeUnitRow, nativeUnitStats } from '../src/game/native-units';
import { splitTiming } from '../src/game/garrison-kinds';
import { spawnGarrisonDefender } from '../src/game/garrison-combat';
import { applyShrink } from '../src/game/shrink-trap';
import { replayBattle } from '../src/game/replay';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import {
  attackingSpellBatBattle,
  attackingSpellBatRecording,
} from './fixtures/attacking-spell-bat';

it('a newly summoned Bat charges its first source melee attack', () => {
  const r = attackingSpellBatBattle();
  expect(splitTiming(nativeUnitRow('spellbat', 1))).toEqual({
    period: 2,
    recovery: 0.5,
    windup: 1.5,
    charge: 0.5,
    firstHit: 1,
  });
  while (!r.unit.attacking) r.step();
  expect(r.unit.native?.attacks ?? 0).toBe(0);
  const engaged = r.battle.elapsed,
    activeAtEngagement = r.unit.native?.attackWindup?.actionDt ?? 0.05;
  r.untilAttacks(1);
  expect(r.battle.elapsed - engaged + activeAtEngagement).toBeCloseTo(1, 8);
});

for (const level of [1, 8])
  for (const x of [12, 5])
    it(`Bat Spell ${level} from ${x} spends one active second then repeats every two`, () => {
      const r = attackingSpellBatBattle(level, 217, x),
        stats = nativeUnitStats('spellbat', 1),
        target = r.battle.buildings.find((b) => b.id === 2)!;
      expect(r.unit.level).toBe(1);
      expect(stats).toMatchObject({
        hp: 20,
        damage: 60,
        range: 0.3,
        flying: true,
        airTargets: true,
        groundTargets: true,
        preferredClass: 'Defense',
      });
      while (!r.unit.attacking) r.step();
      const engaged = r.battle.elapsed,
        active = r.unit.native!.attackWindup!.actionDt,
        hp = target.hp;
      expect(r.unit.native!.attackWindup!.animationOffset).toBeLessThan(0);
      r.untilAttacks(1);
      const first = r.battle.elapsed;
      expect(first - engaged + active).toBeCloseTo(1, 8);
      expect(target.hp).toBe(hp - 60);
      expect(r.unit.native!.attackWindup!.recovery).toBeCloseTo(0.5, 8);
      expect(r.battle.projectiles?.some((p) => p.sourceId === r.unit.id)).toBe(false);
      r.untilAttacks(3);
      expect(r.battle.elapsed - first).toBeCloseTo(4, 8);
    });

for (const hold of ['frozenUntil', 'stunUntil'] as const)
  it(`${hold} holds the Bat charge through a partial thaw`, () => {
    const r = attackingSpellBatBattle(1, 217);
    while (!r.unit.attacking) r.step();
    const engaged = r.battle.elapsed,
      active = r.unit.native!.attackWindup!.actionDt;
    r.unit.native!.effects = { [hold]: engaged + 1.025 };
    r.untilAttacks(1);
    expect(r.battle.elapsed - engaged + active).toBeCloseTo(2.05, 8);
  });

for (const slowed of [false, true])
  it(`Bat first and repeat phases scale, slowed=${slowed}`, () => {
    const r = attackingSpellBatBattle(1, 217),
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
    expect(r.battle.elapsed - first).toBeCloseTo(4 * scale, 8);
  });

it('Shrink doubles Bat attack phases without reducing hit damage', () => {
  const r = attackingSpellBatBattle(1, 217),
    target = r.battle.buildings.find((b) => b.id === 2)!,
    hp = target.hp;
  applyShrink(r.unit, r.battle.elapsed);
  while (!r.unit.attacking) r.step();
  const engaged = r.battle.elapsed,
    active = r.unit.native!.attackWindup!.actionDt;
  r.untilAttacks(1);
  expect(r.battle.elapsed - engaged + active * 2).toBeCloseTo(2, 8);
  expect(target.hp).toBe(hp - 60);
});

for (const air of [false, true])
  it(`Bat charges a direct ${air ? 'air' : 'ground'} defender hit when no defenses take priority`, () => {
    const r = attackingSpellBatBattle(1, 217);
    r.battle.buildings.find((b) => b.id === 1)!.kind = 'goldstorage';
    const defense = r.battle.buildings.find((b) => b.id === 2)!;
    r.model.damage(defense, defense.hp);
    const guard = spawnGarrisonDefender(
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
    r.untilAttacks(1);
    expect(guard.hp).toBe(guard.maxHp - 60);
    expect(events.find((fx) => fx.type === 'hit' && fx.sourceId === r.unit.id)).toMatchObject({
      targetId: guard.id,
      targetDefender: true,
      fromAir: true,
      toAir: air,
    });
    expect(r.battle.projectiles?.some((p) => p.sourceId === r.unit.id)).toBe(false);
  });

it('Bats retain Defense preference over nearby defenders', () => {
  const r = attackingSpellBatBattle(1, 217),
    guard = spawnGarrisonDefender(r.battle, 'golem', 8, 1, r.unit.x + 0.1, r.unit.y, 0);
  guard.alerted = true;
  guard.stunnedUntil = 100;
  r.untilAttacks(1);
  expect(r.unit.target).toBe(2);
  expect(guard.hp).toBe(guard.maxHp);
});

it('a defeated Bat cannot finish a pending strike', () => {
  const r = attackingSpellBatBattle(1, 217),
    target = r.battle.buildings.find((b) => b.id === 2)!;
  while (!r.unit.attacking) r.step();
  const hp = target.hp;
  r.unit.hp = 0;
  r.until(r.battle.elapsed + 1.2);
  expect(target.hp).toBe(hp);
  expect(r.unit.native!.attacks ?? 0).toBe(0);
});

it('replacing a Bat target starts a fresh charge after remaining recovery', () => {
  const r = attackingSpellBatBattle(1, 217);
  r.battle.buildings.push(makeBuilding(3, 'cannon', 13, 10, 21));
  r.untilAttacks(1);
  r.until(r.battle.elapsed + 0.2);
  const replaced = r.battle.elapsed;
  r.model.damage(
    r.battle.buildings.find((b) => b.id === 2)!,
    100000,
  );
  r.untilAttacks(2);
  expect(r.unit.target).toBe(3);
  expect(r.battle.elapsed - replaced).toBeCloseTo(1.3, 8);
});

for (let level = 1; level <= 8; level++)
  it(`Bat Spell ${level} retains every scheduled birth and source child tier`, () => {
    const old = attackingSpellBatBattle(level, 216),
      current = attackingSpellBatBattle(level, 217);
    old.until(15);
    current.until(15);
    const births = (r: typeof old) =>
      r.battle.units.map(({ id, kind, level, spawnedAt, maxHp }) => ({
        id,
        kind,
        level,
        spawnedAt,
        maxHp,
      }));
    expect(births(current)).toEqual(births(old));
    expect(current.battle.units).toHaveLength([7, 9, 11, 16, 21, 22, 23, 25][level - 1]);
    expect(current.battle.units.every((u) => u.kind === 'spellbat' && u.level === 1)).toBe(true);
  });

it('Bats retain period remainders with irregular samples', () => {
  const r = attackingSpellBatBattle(1, 217),
    deltas = [0.02, 0.075, 0.04, 0.1],
    hits: number[] = [];
  let i = 0;
  while (hits.length < 4) {
    if (r.battle.elapsed > 20) throw Error('Irregular Bat checkpoint expired');
    const count = r.unit.native!.attacks ?? 0;
    r.model.step(deltas[i++ % deltas.length]);
    if ((r.unit.native!.attacks ?? 0) > count) hits.push(r.battle.elapsed);
  }
  for (let n = 1; n < hits.length; n++)
    expect(Math.abs(hits[n] - hits[0] - 2 * n)).toBeLessThan(0.1 + 1e-8);
});

it('only new setups carrying a Bat Spell enable the phases', () => {
  const r = attackingSpellBatBattle(1, 216);
  expect(replayBattle(r.data.initial, 216).nativeSpellBatWindup).toBeUndefined();
  expect(replayBattle(r.data.initial, 217).nativeSpellBatWindup).toBe(true);
  r.data.initial.spells.bat = 0;
  expect(replayBattle(r.data.initial, 217).nativeSpellBatWindup).toBeUndefined();
});

for (const version of [216, 217])
  for (const level of [1, 8])
    for (const x of [12, 5])
      it(`Bat Spell ${level} from ${x} replays version ${version} in both directions`, () => {
        const r = attackingSpellBatRecording(level, version, x),
          viewer = new GameModel();
        if (version === 216) {
          const baseline = {
            '1:12': '30bda0b0d16a79e427c9085bd212d9af7482e55dd067a12735a57d97d473ba4c',
            '1:5': '6f85769f001ddfeafe5704d6c91933e636f5ae3ec85af94089ea4793a2bf7f6a',
            '8:12': 'cd6a285d7f3a501209888584f1303f76f3818ec2468ac9e6c7c25295bc6088cc',
            '8:5': '0c32846b05bbe9618f90949f1dbea17017a1354cb76aec5a757eaf4d323379bd',
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
