import { expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { GameModel } from '../src/game/model';
import { nativeUnitStats } from '../src/game/native-units';
import { superDragonBurstStats } from '../src/game/native-super-dragon';
import { replayBattle } from '../src/game/replay';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { superDragonBurstBattle, superDragonBurstRecording } from './fixtures/super-dragon-burst';

for (let level = 1; level <= 11; level++)
  for (const x of [11.4, 5])
    it(`Super Dragon ${level} from ${x} emits source ten-flame bursts`, () => {
      const r = superDragonBurstBattle(level, 221, x),
        stats = superDragonBurstStats(level);
      expect(stats).toMatchObject({
        count: 10,
        delay: 0.192,
        firstHit: 0.32,
        period: 3.584,
        afterBurst: 1.536,
      });
      expect((stats.damage * 10) / stats.period).toBeCloseTo(
        nativeUnitStats('superdragon', level).dps,
        10,
      );
      while (!r.unit.attacking) r.step();
      const engaged = r.battle.elapsed,
        active = r.unit.native!.attackWindup!.actionDt;
      expect(r.unit.native!.attacks ?? 0).toBe(0);
      r.untilShots(20);
      expect(r.packets).toHaveLength(20);
      const first = r.packets[0].launched;
      expect(first - engaged + active).toBeCloseTo(0.32, 8);
      for (let i = 0; i < 20; i++) {
        expect(r.packets[i].launched - first).toBeCloseTo(
          Math.floor(i / 10) * 3.584 + (i % 10) * 0.192,
          8,
        );
        expect(r.packets[i].damage).toBeCloseTo(stats.damage, 10);
        expect(r.packets[i].native).toMatchObject({
          kind: 'superdragon',
          name: 'SuperDragonProjectile',
          level,
        });
      }
    });

for (const version of [220, 221])
  for (const level of [1, 11])
    for (const x of [11.4, 5])
      it(`Super Dragon ${level} from${x} keeps full portable version${version} states`, () => {
        const r = superDragonBurstRecording(level, version, x),
          viewer = new GameModel();
        if (version === 220) {
          const hashes: Record<string, string> = {
            '1:11.4': 'e9366ba7e19b5b816d67fcb42c5a6397a596628abfce5794dd85d8f220ad0e51',
            '1:5': 'd83c041f2831e802c193485245bc3b5842d911fe4b6f73fd393d61b3af9f4c08',
            '11:11.4': 'cee9ab3c53147ffaa54503c4b61b64e70266034af7f0a559b33429e19c5f99ac',
            '11:5': '4c17de33f2f4d5b5cac262bf0262e318d408726e8525b451f8573eb7850ff69c',
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

it('only new carried Super Dragon armies enable bursts', () => {
  const r = superDragonBurstBattle(1, 220);
  expect(replayBattle(r.data.initial, 220).nativeSuperDragonBurst).toBeUndefined();
  expect(replayBattle(r.data.initial, 221).nativeSuperDragonBurst).toBe(true);
  r.data.initial.army.superdragon = 0;
  expect(replayBattle(r.data.initial, 221).nativeSuperDragonBurst).toBeUndefined();
});

for (const slowed of [false, true])
  it(`Super Dragon action rate scales flames and the full cycle, slow=${slowed}`, () => {
    const r = superDragonBurstBattle(),
      factor = slowed ? 2 : 0.5;
    r.unit.native!.effects = slowed
      ? { poison: { since: 0, until: 100, dps: 0, speed: 0, attackSpeed: -0.5 } }
      : { boost: { until: 100, damage: 0, speed: 0, attackSpeed: 1 } };
    r.untilShots(20);
    for (let i = 0; i < 20; i++)
      expect(r.packets[i].launched).toBeCloseTo(
        (0.32 + Math.floor(i / 10) * 3.584 + (i % 10) * 0.192) * factor,
        8,
      );
    expect(r.packets.every((p) => Math.abs(p.damage - 107.8784) < 1e-8)).toBe(true);
  });

for (const hold of ['frozenUntil', 'stunUntil'] as const)
  for (const duringBurst of [false, true])
    it(`${hold} holds ${duringBurst ? 'an active burst' : 'the initial charge'} through partial thaw`, () => {
      const r = superDragonBurstBattle(),
        at = duringBurst ? 0.6 : 0.15;
      r.until(at);
      const oldCount = r.packets.length;
      r.unit.native!.effects = { [hold]: r.battle.elapsed + 1.025 };
      r.until(at + 1);
      expect(r.packets).toHaveLength(oldCount);
      r.untilShots(20);
      for (let i = 0; i < 20; i++) {
        const original = 0.32 + Math.floor(i / 10) * 3.584 + (i % 10) * 0.192;
        expect(r.packets[i].launched).toBeCloseTo(original + (original > at ? 1.025 : 0), 8);
      }
    });

it('damage boosts affect remaining flames without changing the burst clock', () => {
  const r = superDragonBurstBattle();
  r.until(0.6);
  r.unit.native!.effects = { boost: { until: 2, damage: 1, speed: 0, attackSpeed: 0 } };
  r.untilShots(20);
  for (let i = 0; i < 20; i++) {
    const launched = 0.32 + Math.floor(i / 10) * 3.584 + (i % 10) * 0.192;
    expect(r.packets[i].launched).toBeCloseTo(launched, 8);
    expect(r.packets[i].damage).toBeCloseTo(107.8784 * (i >= 2 && i <= 8 ? 2 : 1), 8);
  }
});

it('a fallen Super Dragon stops emitting while released flames still hit', () => {
  const r = superDragonBurstBattle(),
    target = r.battle.buildings.find((b) => b.id === 2)!,
    hp = target.hp;
  r.until(0.6);
  expect(r.packets).toHaveLength(2);
  r.unit.hp = 0;
  r.until(2);
  expect(r.packets).toHaveLength(2);
  expect(target.hp).toBeCloseTo(hp - 2 * 107.8784, 8);
});

it('loss of a burst target discards remaining flames and pays recovery before retargeting', async () => {
  const { makeBuilding } = await import('../src/game/model');
  const r = superDragonBurstBattle(),
    target = r.battle.buildings.find((b) => b.id === 2)!;
  r.until(0.6);
  r.model.damage(target, target.hp);
  r.battle.buildings.push(makeBuilding(4, 'barracks', 13, 10, 16));
  r.step();
  const cancelled = r.battle.elapsed;
  expect(r.unit.native!.superDragonBurst!.shotsLeft).toBe(0);
  r.untilShots(3);
  expect(r.packets[2].targetId).toBe(4);
  expect(r.packets[2].launched - cancelled).toBeCloseTo(1.856, 8);
});

it('irregular steps retain individual flame times and burst remainders', () => {
  const r = superDragonBurstBattle(),
    deltas = [0.02, 0.075, 0.04, 0.1];
  let i = 0;
  while (r.packets.length < 20) r.step(deltas[i++ % deltas.length]);
  for (let n = 0; n < 20; n++)
    expect(r.packets[n].launched).toBeCloseTo(
      0.32 + Math.floor(n / 10) * 3.584 + (n % 10) * 0.192,
      8,
    );
});

for (const target of ['garrison', 'air-garrison'] as const)
  for (const level of [1, 11])
    it(`Super Dragon ${level} uses original flames against a real ${target} release`, () => {
      const r = superDragonBurstBattle(level, 221, 11.4, target);
      r.untilShots(10);
      expect(r.packets).toHaveLength(10);
      expect(
        r.packets.every((p) => p.targetDefender && p.native?.name === 'SuperDragonProjectile'),
      ).toBe(true);
      expect(r.packets.every((p) => p.fromAir && p.toAir === (target === 'air-garrison'))).toBe(
        true,
      );
      const defender = r.battle.defenders!.find((d) => d.id === r.packets[0].targetId)!;
      expect(defender.hp).toBeLessThan(defender.maxHp);
    });

for (const target of ['garrison', 'air-garrison'] as const)
  it(`a committed burst finishes when its ${target} target retreats`, () => {
    const r = superDragonBurstBattle(1, 221, 11.4, target);
    r.untilShots(2);
    const guard = r.battle.defenders!.find((d) => d.id === r.packets[0].targetId)!;
    guard.stunnedUntil = 100;
    guard.x = r.unit.x + 3.2;
    guard.y = r.unit.y;
    const first = r.packets[0].launched;
    r.untilShots(10);
    expect(r.packets.every((p) => p.targetId === guard.id)).toBe(true);
    expect(r.packets[9].launched - first).toBeCloseTo(9 * 0.192, 8);
  });

it('Shrink slows a full burst without changing flame damage', async () => {
  const { applyShrink } = await import('../src/game/shrink-trap');
  const r = superDragonBurstBattle();
  applyShrink(r.unit, r.battle.elapsed);
  r.untilShots(10);
  for (let i = 0; i < 10; i++) {
    expect(r.packets[i].launched).toBeCloseTo((0.32 + i * 0.192) * 2, 8);
    expect(r.packets[i].damage).toBeCloseTo(107.8784, 8);
  }
});

it('hiding a burst target cancels its remaining flames', () => {
  const r = superDragonBurstBattle();
  r.until(0.6);
  (r.battle.buildingEffects ??= {})[2] = { invisibleUntil: 10 };
  r.until(2);
  expect(r.packets).toHaveLength(2);
  expect(r.unit.native!.superDragonBurst!.shotsLeft).toBe(0);
});

for (const air of [false, true])
  it(`flames hit each ${air ? 'air' : 'ground'} defender once and stay on that layer`, async () => {
    const { spawnGarrisonDefender } = await import('../src/game/garrison-combat');
    const { makeBuilding } = await import('../src/game/model');
    const r = superDragonBurstBattle(),
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
    r.untilShots(1);
    const shot = r.packets[0];
    expect(shot).toMatchObject({
      fromAir: true,
      toAir: air,
      targetDefender: true,
      targetId: primary.id,
    });
    r.until(shot.impact);
    expect(primary.hp).toBeCloseTo(primary.maxHp - shot.damage, 8);
    expect(near.hp).toBeCloseTo(near.maxHp - shot.damage, 8);
    expect(other.hp).toBe(other.maxHp);
    expect(building.hp).toBeCloseTo(building.maxHp - (air ? 0 : shot.damage), 8);
  });

it('a ground flame splashes building footprints and defenders once', async () => {
  const { spawnGarrisonDefender } = await import('../src/game/garrison-combat');
  const { makeBuilding } = await import('../src/game/model');
  const r = superDragonBurstBattle();
  r.untilShots(1);
  const shot = r.packets[0],
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
  expect(target.hp).toBeCloseTo(target.maxHp - shot.damage, 8);
  expect(wall.hp).toBeCloseTo(wall.maxHp - shot.damage, 8);
  expect(ground.hp).toBeCloseTo(ground.maxHp - shot.damage, 8);
  expect(air.hp).toBe(air.maxHp);
});

for (const air of [false, true])
  it(`a released ${air ? 'air' : 'ground'} flame splashes after its shooter and primary fall`, async () => {
    const { spawnGarrisonDefender } = await import('../src/game/garrison-combat');
    const { hurtDefender } = await import('../src/game/defenders');
    const { hurtUnit } = await import('../src/game/native-status');
    const r = superDragonBurstBattle(),
      kind = air ? 'dragon' : 'golem',
      level = air ? 7 : 8,
      primary = spawnGarrisonDefender(r.battle, kind, level, 1, 12, 11.5, 0),
      near = spawnGarrisonDefender(r.battle, kind, level, 1, 12.1, 11.5, 0);
    for (const d of [primary, near]) {
      d.alerted = true;
      d.stunnedUntil = 100;
    }
    r.untilShots(1);
    const shot = r.packets[0];
    hurtDefender(r.battle, primary, primary.hp);
    hurtUnit(r.battle, r.unit, r.unit.hp);
    r.until(shot.impact);
    expect(r.packets).toHaveLength(1);
    expect(near.hp).toBeCloseTo(near.maxHp - shot.damage, 8);
  });

it('an untargeted flame explodes at its captured point when the primary moves away', async () => {
  const { spawnGarrisonDefender } = await import('../src/game/garrison-combat');
  const r = superDragonBurstBattle(),
    primary = spawnGarrisonDefender(r.battle, 'golem', 8, 1, 12, 11.5, 0),
    near = spawnGarrisonDefender(r.battle, 'golem', 8, 1, 12.1, 11.5, 0);
  for (const d of [primary, near]) {
    d.alerted = true;
    d.stunnedUntil = 100;
  }
  r.untilShots(1);
  const shot = r.packets[0];
  primary.x = 20;
  r.until(shot.impact);
  expect(primary.hp).toBe(primary.maxHp);
  expect(near.hp).toBeCloseTo(near.maxHp - shot.damage, 8);
});
