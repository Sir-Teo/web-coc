import { expect, it } from 'vitest';
import { GameModel, makeBuilding } from '../src/game/model';
import { spawnGarrisonDefender } from '../src/game/garrison-combat';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { replayBattle } from '../src/game/replay';
import {
  attackingElectroTitanBattle,
  attackingElectroTitanRecording,
} from './fixtures/attacking-electro-titan';

// Independently transcribed characters.Electro Titan and spells.Electro Titan Aura rows.
const primaryDamage = [270, 300, 330, 360, 405],
  auraDamage = [30, 40, 50, 55, 60];
const aura = (r: ReturnType<typeof attackingElectroTitanBattle>) =>
  r.battle.nativeSpells!.find((c) => c.name === 'Electro Titan Aura')!;
for (let level = 1; level <= 5; level++)
  for (const x of [11.4, 6.9])
    it(`Electro Titan ${level} starts her first whip after approaching from x=${x}`, () => {
      const r = attackingElectroTitanBattle(level, undefined, x),
        target = r.battle.buildings.find((b) => b.id === 2)!;
      while (!r.unit.attacking) r.step();
      const engaged = r.battle.elapsed,
        hp = target.hp,
        pulses = aura(r).hits;
      expect(r.unit.native!.attacks ?? 0).toBe(0);
      r.untilAttacks(1);
      const first = r.battle.elapsed;
      expect(first - engaged + 0.05).toBeCloseTo(1.5, 8);
      expect(hp - target.hp).toBeCloseTo(
        primaryDamage[level - 1] + (aura(r).hits - pulses) * auraDamage[level - 1],
        8,
      );
      r.untilAttacks(2);
      expect(r.battle.elapsed - first).toBeCloseTo(1.5, 8);
    });

it('Electro Titan Freeze holds the whip while her fixed aura keeps pulsing', () => {
  const r = attackingElectroTitanBattle(),
    target = r.battle.buildings.find((b) => b.id === 2)!;
  while (!r.unit.attacking) r.step();
  const engaged = r.battle.elapsed,
    hp = target.hp,
    pulses = aura(r).hits;
  r.unit.native!.effects = { frozenUntil: engaged + 1 };
  r.until(engaged + 1);
  expect(r.unit.native!.attacks ?? 0).toBe(0);
  expect(aura(r).hits - pulses).toBeGreaterThanOrEqual(2);
  expect(hp - target.hp).toBe((aura(r).hits - pulses) * 30);
  r.untilAttacks(1);
  expect(r.battle.elapsed - engaged + 0.05).toBeCloseTo(2.5, 8);
});

for (const slowed of [false, true])
  it(`Electro Titan scales whip time without rescheduling aura pulses, slowed=${slowed}`, () => {
    const r = attackingElectroTitanBattle();
    r.unit.native!.effects = slowed
      ? { poison: { since: 0, until: 100, dps: 0, speed: 0, attackSpeed: -0.5 } }
      : { boost: { until: 100, damage: 0, speed: 0, attackSpeed: 1 } };
    while (!r.unit.attacking) r.step();
    const engaged = r.battle.elapsed,
      scale = slowed ? 2 : 0.5;
    r.untilAttacks(1);
    const first = r.battle.elapsed;
    expect(first - engaged + 0.05).toBeCloseTo(1.5 * scale, 8);
    r.untilAttacks(2);
    expect(r.battle.elapsed - first).toBeCloseTo(1.5 * scale, 8);
    expect(aura(r).interval).toBe(0.4);
  });

it('Electro Titan whips an air defender directly after a full windup', () => {
  const r = attackingElectroTitanBattle(),
    air = spawnGarrisonDefender(r.battle, 'dragon', 7, 1, 11.6, 11.5, 0),
    ground = spawnGarrisonDefender(r.battle, 'golem', 8, 1, 12.5, 11.5, 0);
  for (const d of [air, ground]) {
    d.alerted = true;
    d.stunnedUntil = 100;
  }
  while (!r.unit.attacking) r.step();
  const engaged = r.battle.elapsed;
  expect(r.unit.native!.attackWindup!.target).toEqual({ id: air.id, building: false });
  r.untilAttacks(1);
  expect(r.battle.elapsed - engaged + 0.05).toBeCloseTo(1.5, 8);
  expect(air.hp).toBe(air.maxHp - 270 - aura(r).hits * 30);
  expect(ground.hp).toBe(ground.maxHp - aura(r).hits * 30);
  expect(r.battle.projectiles?.some((p) => p.sourceId === r.unit.id)).toBe(false);
});

it('Electro Titan attacks blocking walls with her whip while the aura leaves them intact', () => {
  const r = attackingElectroTitanBattle();
  r.battle.buildings.find((b) => b.id === 2)!.x = 14;
  for (let y = 0; y < 48; y++) r.battle.buildings.push(makeBuilding(1000 + y, 'wall', 12, y, 15));
  while (!r.unit.attacking) r.step();
  const engaged = r.battle.elapsed,
    wall = r.battle.buildings.find((b) => b.id === r.unit.native!.attackWindup!.target!.id)!;
  expect(wall.kind).toBe('wall');
  expect(wall.hp).toBe(wall.maxHp);
  r.untilAttacks(1);
  expect(r.battle.elapsed - engaged + 0.05).toBeCloseTo(1.5, 8);
  expect(wall.hp).toBe(wall.maxHp - 270);
  expect(
    r.battle.buildings
      .filter((b) => b.kind === 'wall' && b.id !== wall.id)
      .every((b) => b.hp === b.maxHp),
  ).toBe(true);
});

for (const version of [173, 174])
  for (const level of [1, 5])
    for (const garrison of [false, true, 'air'] as const)
      it(`Electro Titan ${level} ${garrison === 'air' ? 'Dragon' : garrison ? 'Golem' : 'Cannon'} fight replays version ${version}`, () => {
        const r = attackingElectroTitanRecording(version, level, garrison),
          model = new GameModel();
        expect(model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(
          true,
        );
        for (const snapshot of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
          model.seekReplay(snapshot.at);
          while (model.replay!.seeking) model.step(0.05);
          expect(JSON.parse(JSON.stringify(model.battle))).toEqual(snapshot.battle);
        }
      });

it('only carried Electro Titan armies enable the new whip clock', () => {
  const s = structuredClone(attackingElectroTitanBattle().data.initial);
  expect(replayBattle(s).nativeElectroTitanWindup).toBe(true);
  expect(replayBattle(s, 173).nativeElectroTitanWindup).toBeUndefined();
  s.army.electrotitan = 0;
  expect(replayBattle(s).nativeElectroTitanWindup).toBeUndefined();
});
