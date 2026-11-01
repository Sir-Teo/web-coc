import { expect, it } from 'vitest';
import { GameModel, makeBuilding } from '../src/game/model';
import { nativeUnitStats } from '../src/game/native-units';
import { replayBattle } from '../src/game/replay';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { spawnGarrisonDefender } from '../src/game/garrison-combat';
import { nativeTroopFacingTarget } from '../src/game/native-troop-facing';
import { applyShrink } from '../src/game/shrink-trap';
import { attackingBearBattle, attackingBearRecording } from './fixtures/attacking-bear';
import { druidRecording } from './fixtures/attacking-druid';

for (let level = 1; level <= 6; level++)
  for (const x of [11.4, 6.9])
    it(`Bear ${level} spends a fresh one-second melee charge from x=${x}`, () => {
      const r = attackingBearBattle(level, 212, x),
        target = r.battle.buildings.find((b) => b.id === 2)!,
        hp = target.hp;
      while (!r.unit.attacking) r.step();
      const engaged = r.battle.elapsed;
      expect(target.hp).toBe(hp);
      expect(r.unit.native!.attackWindup!.animationOffset).toBeLessThan(0);
      r.untilAttacks(1);
      const first = r.battle.elapsed;
      expect(first - engaged + 0.05).toBeCloseTo(1, 8);
      expect(target.hp).toBeCloseTo(hp - nativeUnitStats('bear', level).damage, 8);
      r.untilAttacks(4);
      expect(r.battle.elapsed - first).toBeCloseTo(3, 8);
      expect(r.battle.projectiles).toHaveLength(0);
    });

it('version 211 retains the immediate Bear hit and original state shape', () => {
  const r = attackingBearBattle(1, 211),
    target = r.battle.buildings.find((b) => b.id === 2)!,
    hp = target.hp;
  while (!r.unit.attacking) r.step();
  expect(target.hp).toBe(hp - 150);
  expect(r.unit.native!.attackWindup).toBeUndefined();
});

for (const hold of ['frozenUntil', 'stunUntil'] as const)
  it(`${hold} holds the Bear's partial charge, including a partial thaw`, () => {
    const r = attackingBearBattle();
    while (!r.unit.attacking) r.step();
    const engaged = r.battle.elapsed;
    r.unit.native!.effects = { [hold]: engaged + 1.025 };
    r.untilAttacks(1);
    expect(r.battle.elapsed - engaged + 0.05).toBeCloseTo(2.05, 8);
  });

for (const slowed of [false, true])
  it(`Bear action rate scales its first and repeat charges, slowed=${slowed}`, () => {
    const r = attackingBearBattle();
    r.unit.native!.effects = slowed
      ? { poison: { since: 0, until: 100, dps: 0, speed: 0, attackSpeed: -0.5 } }
      : { boost: { until: 100, damage: 0, speed: 0, attackSpeed: 1 } };
    while (!r.unit.attacking) r.step();
    const engaged = r.battle.elapsed;
    r.untilAttacks(1);
    const first = r.battle.elapsed;
    expect(first - engaged + 0.05).toBeCloseTo(slowed ? 2 : 0.5, 8);
    r.untilAttacks(3);
    expect(r.battle.elapsed - first).toBeCloseTo(slowed ? 4 : 1, 8);
  });

it('Shrink slows Bear charges while retaining source damage', () => {
  const r = attackingBearBattle(),
    target = r.battle.buildings.find((b) => b.id === 2)!,
    hp = target.hp;
  applyShrink(r.unit, r.battle.elapsed);
  while (!r.unit.attacking) r.step();
  const engaged = r.battle.elapsed;
  r.untilAttacks(1);
  expect(r.battle.elapsed - engaged + 0.05).toBeCloseTo(2, 8);
  expect(target.hp).toBe(hp - 150);
});

it('a replacement building requires a fresh Bear charge', () => {
  const r = attackingBearBattle();
  r.battle.buildings.push(makeBuilding(3, 'goldstorage', 13, 10, 18));
  while (!r.unit.attacking) r.step();
  r.until(r.battle.elapsed + 0.3);
  const replaced = r.battle.elapsed,
    old = r.battle.buildings.find((b) => b.id === 2)!;
  r.model.damage(old, old.hp);
  r.untilAttacks(1);
  expect(r.unit.target).toBe(3);
  expect(r.battle.elapsed - replaced).toBeCloseTo(1, 8);
});

it('Bear prefers a defense to nearby alerted ground and air defenders', () => {
  const r = attackingBearBattle(1, 212, 11.4, true),
    guard = spawnGarrisonDefender(r.battle, 'golem', 8, 1, 12.2, 11.5, 0),
    air = spawnGarrisonDefender(r.battle, 'dragon', 7, 1, 11.4, 11.6, 0);
  for (const d of [guard, air]) {
    d.alerted = true;
    d.stunnedUntil = 100;
  }
  r.untilAttacks(1);
  expect(r.unit.target).toBe(2);
  expect(guard.hp).toBe(guard.maxHp);
  expect(air.hp).toBe(air.maxHp);
});

it('Bear charges direct ground-defender hits without attacking air', () => {
  const r = attackingBearBattle(),
    guard = spawnGarrisonDefender(r.battle, 'golem', 8, 1, 11.8, 11.5, 0),
    air = spawnGarrisonDefender(r.battle, 'dragon', 7, 1, 11.4, 11.6, 0);
  for (const d of [guard, air]) {
    d.alerted = true;
    d.stunnedUntil = 100;
  }
  while (!r.unit.attacking) r.step();
  const engaged = r.battle.elapsed;
  expect(guard.hp).toBe(guard.maxHp);
  r.untilAttacks(1);
  expect(r.battle.elapsed - engaged + 0.05).toBeCloseTo(1, 8);
  expect(guard.hp).toBe(guard.maxHp - 150);
  expect(air.hp).toBe(air.maxHp);
  expect(r.battle.projectiles).toHaveLength(0);
});

it('a defeated Bear cannot finish its pending charge', () => {
  const r = attackingBearBattle(),
    target = r.battle.buildings.find((b) => b.id === 2)!,
    hp = target.hp;
  while (!r.unit.attacking) r.step();
  r.unit.hp = 0;
  r.until(r.battle.elapsed + 1.5);
  expect(target.hp).toBe(hp);
});

it('a wall blocking Bear pursuit receives a full charge and supplies its facing', () => {
  const r = attackingBearBattle();
  for (let y = 0; y < 48; y++) r.battle.buildings.push(makeBuilding(1000 + y, 'wall', 12, y, 5));
  const guard = spawnGarrisonDefender(r.battle, 'golem', 8, 1, 17.4, 11.5, 0);
  guard.alerted = true;
  guard.stunnedUntil = 100;
  while (!r.unit.attacking) r.step();
  const engaged = r.battle.elapsed,
    ref = r.unit.native!.attackWindup!.target!,
    wall = r.battle.buildings.find((b) => b.id === ref.id)!;
  expect(ref.building).toBe(true);
  expect(wall.kind).toBe('wall');
  expect(wall.hp).toBe(wall.maxHp);
  expect(nativeTroopFacingTarget(r.battle, r.unit)).toEqual({ x: wall.x + 0.5, y: wall.y + 0.5 });
  r.untilAttacks(1);
  expect(r.battle.elapsed - engaged + 0.05).toBeCloseTo(1, 8);
  expect(wall.hp).toBe(wall.maxHp - 150);
  expect(guard.hp).toBe(guard.maxHp);
});

it('a newly available defense interrupts a Bear defender charge', () => {
  const r = attackingBearBattle(),
    guard = spawnGarrisonDefender(r.battle, 'golem', 8, 1, 11.8, 11.5, 0);
  guard.alerted = true;
  guard.stunnedUntil = 100;
  while (!r.unit.attacking) r.step();
  r.until(r.battle.elapsed + 0.3);
  const interrupted = r.battle.elapsed;
  r.battle.buildings.push(makeBuilding(3, 'airdefense', 13, 10, 1));
  r.untilAttacks(1);
  expect(r.unit.target).toBe(3);
  expect(guard.hp).toBe(guard.maxHp);
  expect(r.battle.elapsed - interrupted).toBeGreaterThanOrEqual(1 - 1e-9);
});

it('Bear repeats retain timer remainders under irregular simulation steps', () => {
  const r = attackingBearBattle();
  const deltas = [0.02, 0.075, 0.04, 0.1],
    hits: number[] = [];
  let index = 0;
  while (hits.length < 10) {
    if (r.battle.elapsed > 15) throw Error('Irregular Bear checkpoint expired');
    const count = r.unit.native!.attacks ?? 0;
    r.model.step(deltas[index++ % deltas.length]);
    if ((r.unit.native!.attacks ?? 0) > count) hits.push(r.battle.elapsed);
  }
  for (let n = 1; n < hits.length; n++)
    expect(Math.abs(hits[n] - hits[0] - n)).toBeLessThan(0.1 + 1e-9);
});

it('only carried Druids enable the Bear timing boundary', () => {
  const r = attackingBearBattle();
  expect(replayBattle(r.data.initial, 212).nativeBearWindup).toBe(true);
  expect(replayBattle(r.data.initial, 211).nativeBearWindup).toBeUndefined();
  r.data.initial.army.druid = 0;
  expect(replayBattle(r.data.initial, 212).nativeBearWindup).toBeUndefined();
});

it('Druid healing remains identical before a Bear exists', () => {
  const old = druidRecording(211, 6),
    current = druidRecording(212, 6);
  for (const s of current.snapshots)
    delete (s.battle as { nativeBearWindup?: true }).nativeBearWindup;
  expect(current.snapshots).toEqual(old.snapshots);
});

for (const version of [211, 212])
  for (const level of [1, 6])
    for (const death of [false, true])
      it(`Bear ${level} from ${death ? 'defeat' : 'evolution'} reconstructs portable version ${version}`, () => {
        const r = attackingBearRecording(level, version, death),
          viewer = new GameModel();
        expect(r.id === r.parentId).toBe(!death);
        if (version >= 212) expect(r.first - r.engaged + 0.05).toBeCloseTo(1, 8);
        else expect(r.first).toBe(r.engaged);
        expect(r.second - r.first).toBeCloseTo(1, 8);
        expect(viewer.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(
          true,
        );
        for (const s of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
          viewer.seekReplay(s.at);
          while (viewer.replay!.seeking) viewer.step(0.05);
          expect(JSON.parse(JSON.stringify(viewer.battle))).toEqual(s.battle);
        }
      });
