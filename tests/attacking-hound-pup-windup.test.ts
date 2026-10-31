import { expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { GameModel, makeBuilding } from '../src/game/model';
import { nativeUnitRow, nativeUnitStats } from '../src/game/native-units';
import { splitTiming } from '../src/game/garrison-kinds';
import { buildingEffects } from '../src/game/native-status';
import { spawnGarrisonDefender } from '../src/game/garrison-combat';
import { applyShrink } from '../src/game/shrink-trap';
import { replayBattle } from '../src/game/replay';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import {
  attackingHoundPupBattle,
  attackingHoundPupRecording,
} from './fixtures/attacking-hound-pups';

for (const ice of [false, true]) {
  const kind = ice ? 'icehoundpup' : 'lavapup',
    projectile = ice ? 'icy_tinyhound_projectile' : 'tinyhound_projectile';
  for (const level of [1, 8])
    it(`${kind} from parent ${level} charges before its source projectile`, () => {
      const r = attackingHoundPupBattle(level, 214, ice),
        stats = nativeUnitStats(kind, 1),
        target = r.battle.buildings.find((b) => b.id === 2)!,
        hp = target.hp;
      expect(r.unit.level).toBe(1);
      expect(splitTiming(nativeUnitRow(kind, 1))).toMatchObject({
        firstHit: 1,
        recovery: 0,
        period: 1,
      });
      while (!r.unit.attacking) r.step();
      const engaged = r.battle.elapsed;
      expect(r.unit.native!.attacks ?? 0).toBe(0);
      expect(r.unit.native!.attackWindup!.animationOffset).toBeLessThan(0);
      r.untilAttacks(1);
      const first = r.battle.elapsed,
        shot = r.battle.projectiles!.find((p) => p.sourceId === r.unit.id)!;
      expect(first - engaged + 0.05).toBeCloseTo(1, 8);
      expect(shot).toMatchObject({
        weapon: 'native',
        fromAir: true,
        targetBuilding: true,
        damage: 35,
        native: { name: projectile, kind, level: 1 },
      });
      expect(shot.impact - shot.launched).toBeCloseTo(
        Math.hypot(shot.x - shot.fromX, shot.y - shot.fromY) / 3,
        8,
      );
      const beforeImpact = hp - nativeUnitStats(ice ? 'icehound' : 'lavahound', level).deathDamage;
      expect(target.hp).toBe(beforeImpact);
      while (r.battle.projectiles!.some((p) => p.id === shot.id)) r.step();
      expect(target.hp).toBeCloseTo(beforeImpact - stats.damage, 8);
      if (ice)
        expect(buildingEffects(r.battle, target).frost).toEqual({
          until: shot.impact + 2,
          percent: 0.5,
        });
      r.untilAttacks(3);
      expect(r.battle.elapsed - first).toBeCloseTo(2, 8);
    });

  it(`version 213 keeps immediate ${kind} shots without the new phase state`, () => {
    const r = attackingHoundPupBattle(1, 213, ice);
    while (!r.unit.attacking) r.step();
    expect(r.unit.native!.attacks).toBe(1);
    expect(r.unit.native!.attackWindup).toBeUndefined();
  });

  for (const hold of ['frozenUntil', 'stunUntil'] as const)
    it(`${hold} pauses the ${kind} charge`, () => {
      const r = attackingHoundPupBattle(1, 214, ice);
      while (!r.unit.attacking) r.step();
      const engaged = r.battle.elapsed;
      r.unit.native!.effects = { [hold]: engaged + 1.025 };
      r.untilAttacks(1);
      expect(r.battle.elapsed - engaged + 0.05).toBeCloseTo(2.05, 8);
    });

  for (const slowed of [false, true])
    it(`${kind} scales first and repeat shots, slowed=${slowed}`, () => {
      const r = attackingHoundPupBattle(1, 214, ice),
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

  it(`Shrink slows ${kind} without reducing projectile damage`, () => {
    const r = attackingHoundPupBattle(1, 214, ice);
    applyShrink(r.unit, r.battle.elapsed);
    while (!r.unit.attacking) r.step();
    const engaged = r.battle.elapsed;
    r.untilAttacks(1);
    expect(r.battle.elapsed - engaged + 0.05).toBeCloseTo(2, 8);
    expect(r.battle.projectiles!.find((p) => p.sourceId === r.unit.id)!.damage).toBe(35);
  });

  for (const air of [false, true])
    it(`${kind} releases at a ${air ? 'flying' : 'ground'} defender with captured source effects`, () => {
      const r = attackingHoundPupBattle(1, 214, ice),
        guard = spawnGarrisonDefender(
          r.battle,
          air ? 'dragon' : 'golem',
          air ? 7 : 8,
          1,
          r.unit.x + 1,
          r.unit.y,
          0,
        );
      guard.alerted = true;
      guard.stunnedUntil = 100;
      while (!r.unit.attacking) r.step();
      const hp = guard.hp;
      r.untilAttacks(1);
      const shot = r.battle.projectiles!.find((p) => p.sourceId === r.unit.id)!;
      expect(shot).toMatchObject({
        targetDefender: true,
        targetId: guard.id,
        toAir: air,
        fromAir: true,
        native: { name: projectile, kind, level: 1 },
      });
      expect(guard.hp).toBe(hp);
      // Launch captures Ice frost, so it survives its shooter's defeat.
      r.unit.hp = 0;
      while (r.battle.projectiles!.some((p) => p.id === shot.id)) r.step();
      expect(guard.hp).toBeCloseTo(hp - 35, 8);
      if (ice) expect(guard.frost).toEqual({ until: shot.impact + 2, percent: 0.5 });
    });

  it(`${kind} starts a fresh charge when its building is replaced`, () => {
    const r = attackingHoundPupBattle(1, 214, ice);
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

  it(`a defeated ${kind} cannot finish an unreleased attack`, () => {
    const r = attackingHoundPupBattle(1, 214, ice);
    while (!r.unit.attacking) r.step();
    r.unit.hp = 0;
    r.until(r.battle.elapsed + 1.2);
    expect(r.unit.native!.attacks ?? 0).toBe(0);
    expect(r.battle.projectiles?.some((p) => p.sourceId === r.unit.id)).toBe(false);
  });

  for (let level = 1; level <= 8; level++)
    it(`${kind} parent ${level} preserves the complete finite birth wave`, () => {
      const old = attackingHoundPupBattle(level, 213, ice, false),
        current = attackingHoundPupBattle(level, 214, ice, false),
        children = (r: typeof old) => r.battle.units.filter((u) => u.native?.owner === r.parent.id);
      expect(children(current)).toHaveLength(
        nativeUnitStats(ice ? 'icehound' : 'lavahound', level).secondaryCount,
      );
      expect(JSON.parse(JSON.stringify(children(current)))).toEqual(
        JSON.parse(JSON.stringify(children(old))),
      );
    });

  it(`${kind} retains repeat remainders across irregular samples`, () => {
    const r = attackingHoundPupBattle(1, 214, ice),
      deltas = [0.02, 0.075, 0.04, 0.1],
      hits: number[] = [];
    let index = 0;
    while (hits.length < 4) {
      if (r.battle.elapsed > 25) throw Error('Pup charge checkpoint expired');
      const before = r.unit.native!.attacks ?? 0;
      r.model.step(deltas[index++ % deltas.length]);
      if ((r.unit.native!.attacks ?? 0) > before) hits.push(r.battle.elapsed);
    }
    for (let n = 1; n < hits.length; n++)
      expect(Math.abs(hits[n] - hits[0] - n)).toBeLessThan(0.1 + 1e-8);
  });

  for (const version of [213, 214])
    for (const level of [1, 8])
      it(`real ${kind} wave ${level} replays version ${version} in both directions`, () => {
        const r = attackingHoundPupRecording(level, version, ice),
          viewer = new GameModel();
        if (version === 213) {
          const baseline = {
            'false:1': '653f2edf17f54d3c147b71806e884b8dd23ce84b1fd3e357f4a21d91b6c3ea7b',
            'false:8': '5eb836e1359432ccdac78339f7f95d5f7e7fbcd5aa6d25aaf476cc2402f7c39c',
            'true:1': '21a342088241e7bce4c52261350f830d0a7788636f69a2c4f066a35dc5fdd6a5',
            'true:8': '426aa817cdd3bce4ed9317f74d00e3c753b856d353f2e64a5477e95f68ca9e79',
          };
          expect(createHash('sha256').update(JSON.stringify(r.snapshots)).digest('hex')).toBe(
            baseline[`${ice}:${level}`],
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
}

it('only carried Hound armies enable Pup windup', () => {
  const r = attackingHoundPupBattle();
  expect(replayBattle(r.data.initial, 214).nativeHoundPupWindup).toBe(true);
  expect(replayBattle(r.data.initial, 213).nativeHoundPupWindup).toBeUndefined();
  r.data.initial.army.lavahound = 0;
  expect(replayBattle(r.data.initial, 214).nativeHoundPupWindup).toBeUndefined();
  r.data.initial.army.icehound = 1;
  expect(replayBattle(r.data.initial, 214).nativeHoundPupWindup).toBe(true);
});
