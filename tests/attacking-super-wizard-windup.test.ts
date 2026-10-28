import { expect, it } from 'vitest';
import { nativeUnitStats } from '../src/game/native-units';
import { replayBattle } from '../src/game/replay';
import { nativeDirectBattle } from './fixtures/native-direct-attacks';
import { GameModel, makeBuilding } from '../src/game/model';
import { spawnGarrisonDefender } from '../src/game/garrison-combat';
import { hurtUnit } from '../src/game/native-status';
import { emptyArmy } from '../src/game/army';
import { applyShrink } from '../src/game/shrink-trap';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import {
  superWizardRecording,
  angrySuperWizardBranchesRecording,
} from './fixtures/attacking-super-wizard';
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
  for (const x of [11.4, 6.9])
    it(`Super Wizard ${level} charges after approaching from ${x} and retains its two-second period`, () => {
      const r = nativeDirectBattle('superwizard', level, 199, x),
        target = r.battle.buildings.find((b) => b.id === 2)!,
        damage = nativeUnitStats('superwizard', level).damage;
      while (!r.unit.attacking) r.step();
      const engaged = r.battle.elapsed;
      expect(target.hp).toBe(target.maxHp);
      r.untilAttacks(1);
      const first = r.battle.elapsed,
        zap = r.battle.nativeSuperWizardZaps!.find((z) => z.sourceId === r.unit.id)!;
      expect(first - engaged + 0.05).toBeCloseTo(1.5, 8);
      expect(target.hp).toBe(target.maxHp - damage);
      expect(zap).toMatchObject({
        level,
        at: first,
        primary: true,
        targetId: 2,
        targetBuilding: true,
      });
      expect(r.battle.nativeSuperWizardBranches).toEqual([
        expect.objectContaining({
          sourceId: r.unit.id,
          level,
          at: first + 0.128,
          count: 9,
          damage: damage * 0.4,
          origin: { id: 2, building: true },
        }),
      ]);
      expect(r.unit.native!.attackWindup!.recovery).toBeCloseTo(0.5, 8);
      expect(r.battle.projectiles?.some((p) => p.sourceId === r.unit.id) ?? false).toBe(false);
      r.untilAttacks(2);
      expect(r.unit.native!.lastAttackAt! - first).toBeCloseTo(2, 8);
      expect(target.hp).toBe(target.maxHp - 2 * damage);
    });

it('only a carried Super Wizard enables the version 199 charge', () => {
  const r = nativeDirectBattle('superwizard');
  expect(replayBattle(r.data.initial, 198).nativeSuperWizardWindup).toBeUndefined();
  expect(replayBattle(r.data.initial, 199).nativeSuperWizardWindup).toBe(true);
  r.data.initial.army.superwizard = 0;
  expect(replayBattle(r.data.initial, 199).nativeSuperWizardWindup).toBeUndefined();
});

for (const air of [false, true])
  it(`a charged ${air ? 'air' : 'ground'} primary retains delayed branches across both layers`, () => {
    const r = nativeDirectBattle('superwizard'),
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
    const first = r.battle.elapsed;
    expect(first).toBeCloseTo(1.5, 8);
    expect(r.unit.native!.attackWindup!.target).toEqual({ id: primary.id, building: false });
    expect(primary.hp).toBe(primary.maxHp - 280);
    expect(ground.hp).toBe(ground.maxHp);
    expect(flying.hp).toBe(flying.maxHp);
    r.until(first + 0.1);
    expect(r.battle.nativeSuperWizardZaps).toHaveLength(1);
    r.until(first + 0.15);
    for (const d of [ground, flying]) {
      expect(d.hp).toBe(d.maxHp - 112);
      expect(
        r.battle.nativeSuperWizardZaps!.filter((z) => !z.targetBuilding && z.targetId === d.id),
      ).toHaveLength(1);
    }
    expect(
      r.battle.nativeSuperWizardZaps!.slice(1).every((z) => Math.abs(z.at - first - 0.128) < 1e-9),
    ).toBe(true);
    expect(r.unit.native!.attacks).toBe(1);
    expect(primary.hp).toBe(primary.maxHp - 280);
  });
it('Freeze and stun hold charge and recovery without banking attack time', () => {
  const r = nativeDirectBattle('superwizard');
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
  expect(r.battle.elapsed - first).toBeCloseTo(3, 8);
});
for (const slowed of [false, true])
  it(`action modifiers scale charge and recovery, slowed=${slowed}`, () => {
    const r = nativeDirectBattle('superwizard');
    (r.unit.native ??= {}).effects = slowed
      ? { poison: { since: 0, until: 100, dps: 0, speed: 0, attackSpeed: -0.5 } }
      : { boost: { until: 100, damage: 0, speed: 0, attackSpeed: 1 } };
    r.untilAttacks(1);
    const first = r.battle.elapsed,
      scale = slowed ? 2 : 0.5;
    expect(first).toBeCloseTo(1.5 * scale, 8);
    r.untilAttacks(2);
    expect(r.battle.elapsed - first).toBeCloseTo(2 * scale, 8);
  });
it('retains sub-step remainder across charge and recovery cycles', () => {
  const r = nativeDirectBattle('superwizard'),
    releases: number[] = [];
  r.step();
  for (let n = 1; n <= 5; n++) {
    while ((r.unit.native!.attacks ?? 0) < n) r.model.step(0.08);
    releases.push(r.unit.native!.lastAttackAt!);
  }
  expect(Math.abs(releases[4] - releases[0] - 4 * 2)).toBeLessThan(0.08 + 1e-8);
});
it('spends remaining recovery once when its primary is destroyed', () => {
  const r = nativeDirectBattle('superwizard'),
    target = r.battle.buildings.find((b) => b.id === 2)!;
  r.battle.buildings.push(makeBuilding(3, 'goldstorage', 13, 10, 18));
  r.untilAttacks(1);
  const first = r.battle.elapsed;
  r.model.damage(target, target.hp);
  r.untilAttacks(2);
  expect(r.unit.target).toBe(3);
  expect(r.battle.elapsed - first).toBeCloseTo(2, 8);
});
it('replacing a destroyed target during charge starts a fresh windup', () => {
  const r = nativeDirectBattle('superwizard'),
    target = r.battle.buildings.find((b) => b.id === 2)!;
  r.battle.buildings.push(makeBuilding(3, 'goldstorage', 13, 10, 18));
  r.until(0.4);
  r.model.damage(target, target.hp);
  r.step();
  const changed = r.battle.elapsed;
  r.untilAttacks(1);
  expect(r.battle.elapsed - changed + 0.05).toBeCloseTo(1.5, 8);
});
it('released branches survive caster defeat and finish the village', () => {
  const r = nativeDirectBattle(
      'superwizard',
      1,
      199,
      11.4,
      'storage',
      {},
      {
        extraBuildings: [makeBuilding(3, 'builder', 16, 10, 1)],
      },
    ),
    hall = r.battle.buildings.find((b) => b.id === 1)!,
    primary = r.battle.buildings.find((b) => b.id === 2)!,
    secondary = r.battle.buildings.find((b) => b.id === 3)!;
  r.model.damage(hall, hall.hp);
  r.model.damage(primary, primary.hp - 280);
  r.model.damage(secondary, secondary.hp - 112);
  r.battle.remaining = emptyArmy();
  r.untilAttacks(1);
  const first = r.battle.elapsed;
  expect(primary.hp).toBe(0);
  expect(r.battle.nativeSuperWizardBranches).toHaveLength(1);
  hurtUnit(r.battle, r.unit, r.unit.hp);
  r.until(first + 0.1);
  expect(r.battle.finished).toBe(false);
  expect(secondary.hp).toBe(112);
  r.until(first + 0.15);
  expect(r.battle.result).toMatchObject({ stars: 3, destruction: 100 });
  expect(secondary.hp).toBe(0);
});
it('charges against a blocking Wall before continuing its ground route', () => {
  const r = nativeDirectBattle('superwizard', 1, 199, 6.9);
  r.battle.buildings.find((b) => b.id === 2)!.x = 22;
  const walls = Array.from({ length: 48 }, (_, y) => makeBuilding(1000 + y, 'wall', 12, y, 18));
  r.battle.buildings.push(...walls);
  r.untilAttacks(1);
  const primary = r.battle.nativeSuperWizardZaps![0],
    wall = walls.find((w) => w.id === primary.targetId)!;
  expect(wall).toBeDefined();
  expect(r.unit.x).toBeLessThan(12);
  expect(wall.hp).toBe(wall.maxHp - 280);
  r.until(r.battle.elapsed + 0.15);
  expect(
    r.battle
      .nativeSuperWizardZaps!.filter((z) => !z.primary)
      .some((z) => walls.some((w) => w.id === z.targetId)),
  ).toBe(false);
});
for (const kind of ['bomb', 'airbomb', 'seekingairmine'] as const)
  it(`retains ${kind} trigger eligibility during charge`, () => {
    const r = nativeDirectBattle('superwizard'),
      trap = makeBuilding(3, kind, 11, 11, 1);
    r.battle.buildings.push(trap);
    r.step();
    expect(r.unit.native?.attacks ?? 0).toBe(0);
    expect(r.battle.traps[trap.id] !== undefined).toBe(kind === 'bomb');
  });
for (const version of [198, 199])
  for (const level of [1, 10])
    for (const target of ['storage', 'cannon', 'golem', 'dragon'] as const)
      it(`tier ${level} actual ${target} fight reconstructs complete version ${version} states`, () => {
        const r = superWizardRecording(version, level, target);
        expect(r.first - r.engaged + (version >= 199 ? 0.05 : 0)).toBeCloseTo(
          version >= 199 ? 1.5 : 0,
          8,
        );
        expect(r.second - r.first).toBeCloseTo(2, 8);
        if (r.defenderId !== undefined)
          expect(
            r.snapshots[0].battle.defenders!.find((d) => d.id === r.defenderId)!.frozenUntil,
          ).toBeGreaterThan(r.secondBranched);
        verifyPortable(r);
      });
for (const level of [1, 4]) {
  it(`actual Angry Spell ${level} cancels a pending Super Wizard charge`, () => {
    const r = nativeTargetingSpellRecording('AngrySpell', level, 199, 'superwizard', 2, 0.05),
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
  it(`actual Angry Spell ${level} preserves recovery and already released branches`, () => {
    const r = angrySuperWizardBranchesRecording(level),
      before = r.snapshots.find((s) => s.at === r.first)!.battle,
      after = r.snapshots.find((s) => s.at === r.impact)!.battle,
      resolved = r.snapshots.find((s) => s.at === r.branched)!.battle,
      u = after.units.find((u) => u.id === r.id)!;
    expect(before.nativeSuperWizardBranches).toHaveLength(1);
    expect(after.nativeSuperWizardBranches).toEqual(before.nativeSuperWizardBranches);
    expect(u.target).toBe(3);
    expect(u.native!.attackWindup!.engaged).toBeUndefined();
    expect(u.native!.attackWindup!.recovery).toBeCloseTo(0.45, 8);
    expect(u.native!.attacks).toBe(1);
    const hut = resolved.buildings.find((b) => b.id === 4)!;
    expect(hut.hp).toBe(hut.maxHp - 112);
    expect(resolved.nativeSuperWizardBranches).toEqual([]);
    expect(resolved.nativeSuperWizardZaps!.filter((z) => z.targetId === 4)).toHaveLength(1);
    verifyPortable(r);
  });
}
for (const shrink of [false, true])
  it(`Shrink scales charge while retaining Super Wizard damage and health, shrunk=${shrink}`, () => {
    const r = nativeDirectBattle('superwizard');
    if (shrink) applyShrink(r.unit, 0);
    r.untilAttacks(1);
    expect(r.battle.elapsed).toBeCloseTo(shrink ? 3 : 1.5, 8);
    expect(r.battle.buildings.find((b) => b.id === 2)!.hp).toBe(
      r.battle.buildings.find((b) => b.id === 2)!.maxHp - 280,
    );
    expect([r.unit.hp, r.unit.maxHp]).toEqual([250, 250]);
  });
