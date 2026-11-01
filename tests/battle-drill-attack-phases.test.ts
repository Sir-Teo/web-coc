import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { GameModel, makeBuilding } from '../src/game/model';
import { replayBattle } from '../src/game/replay';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { nativeUnitStats } from '../src/game/native-units';
import { nativeDirectBattle } from './fixtures/native-direct-attacks';
import { drillSurfaceBattle, drillSurfaceRecording } from './fixtures/battle-drill-surface-walls';

for (let level = 1; level <= 6; level++)
  for (const x of [5, 10.5])
    it(`Battle Drill ${level} from ${x} surfaces before charging its first hit`, () => {
      const r = drillSurfaceBattle(level, 230, x),
        target = r.battle.buildings.find((b) => b.id === 2)!,
        wall = r.battle.buildings.find((b) => b.id === 3)!,
        hp = target.hp,
        hit = nativeUnitStats('battledrill', level).damage;
      while (!r.unit.attacking) r.step();
      const engaged = r.battle.elapsed;
      expect(r.unit.native!.surfaced).toBe(true);
      expect(target.hp).toBe(hp);
      expect(wall.hp).toBe(wall.maxHp);
      r.step();
      expect(wall.hp).toBe(0);
      const stun = r.battle.defenseStuns[target.id];
      expect(stun).toBeGreaterThan(r.battle.elapsed);
      r.untilAttacks(1);
      const first = r.battle.elapsed;
      expect(first - engaged + 0.05).toBeCloseTo(1.5, 8);
      expect(target.hp).toBeCloseTo(hp - hit, 8);
      expect(r.battle.defenseStuns[target.id]).toBe(stun);
      expect(r.unit.native!.attackWindup!.recovery).toBeCloseTo(0.2, 8);
      r.untilAttacks(2);
      expect(r.battle.elapsed - first).toBeCloseTo(1.7, 8);
      expect(target.hp).toBeCloseTo(Math.max(0, hp - 2 * hit), 8);
    });

for (const status of ['frozenUntil', 'stunUntil'] as const)
  it(`${status} holds a partially charged surfaced Drill`, () => {
    const r = drillSurfaceBattle(1, 230),
      control = drillSurfaceBattle(1, 230);
    control.untilAttacks(1);
    while (!r.unit.attacking) r.step();
    r.until(r.battle.elapsed + 0.4);
    r.unit.native!.effects = { [status]: r.battle.elapsed + 0.4 };
    r.untilAttacks(1);
    expect(r.battle.elapsed - control.battle.elapsed).toBeCloseTo(0.4, 8);
  });

it('a 50% slowdown stretches the exposed Drill charge', () => {
  const r = drillSurfaceBattle(1, 230);
  r.unit.native!.effects = { chill: { until: 100, percent: 0.5 } };
  while (!r.unit.attacking) r.step();
  const engaged = r.battle.elapsed;
  r.untilAttacks(1);
  expect(r.battle.elapsed - engaged + 0.05).toBeCloseTo(3, 8);
});

it('target loss ends the exposed charge and sends the Drill underground', () => {
  const r = drillSurfaceBattle(1, 230),
    target = r.battle.buildings.find((b) => b.id === 2)!;
  while (!r.unit.attacking) r.step();
  r.until(r.battle.elapsed + 0.4);
  target.hp = 0;
  r.step();
  expect(r.unit.native!.attacks ?? 0).toBe(0);
  expect(r.unit.native!.attackWindup!.engaged).toBeFalsy();
  expect(r.unit.native!.surfaced).toBe(false);
  expect(r.unit.native!.burrowed).toBe(true);
});

it('caster loss cancels the pending hit while the released surfacing spell still pulses', () => {
  const r = drillSurfaceBattle(1, 230),
    target = r.battle.buildings.find((b) => b.id === 2)!,
    wall = r.battle.buildings.find((b) => b.id === 3)!,
    hp = target.hp;
  while (!r.unit.attacking) r.step();
  r.unit.hp = 0;
  r.step();
  expect(wall.hp).toBe(0);
  expect(r.battle.defenseStuns[target.id]).toBeGreaterThan(r.battle.elapsed);
  r.until(r.battle.elapsed + 2);
  expect(r.unit.native!.attacks ?? 0).toBe(0);
  expect(target.hp).toBe(hp);
});

it('burrows to another defense and begins a new charge after arrival', () => {
  const r = nativeDirectBattle(
    'battledrill',
    1,
    230,
    10.5,
    'cannon',
    {},
    {
      buildingLevel: 1,
      extraBuildings: [makeBuilding(3, 'cannon', 22, 10, 1)],
    },
  );
  r.untilAttacks(1);
  r.step();
  expect(r.unit.native!.burrowed).toBe(true);
  while (!r.unit.attacking) r.step();
  const engaged = r.battle.elapsed;
  expect(r.unit.native!.attackWindup!.target).toEqual({ id: 3, building: true });
  expect(r.unit.native!.surfaced).toBe(true);
  r.untilAttacks(2);
  expect(r.battle.elapsed - engaged + 0.05).toBeCloseTo(1.5, 8);
});

it('an actual alerted Castle defender receives one direct drill hit', () => {
  const r = nativeDirectBattle('battledrill', 6, 230, 11.4, 'garrison'),
    guard = r.battle.defenders!.find((d) => d.kind === 'golem')!,
    hp = guard.hp;
  expect(guard.alerted).toBe(true);
  r.untilAttacks(1);
  expect(r.unit.native!.attackWindup!.target).toEqual({ id: guard.id, building: false });
  expect(guard.hp).toBeCloseTo(hp - nativeUnitStats('battledrill', 6).damage, 8);
  expect(r.battle.projectiles?.some((p) => p.sourceId === r.unit.id) ?? false).toBe(false);
});

it('an actual flying Castle defender does not receive the ground drill hit', () => {
  const r = nativeDirectBattle('battledrill', 6, 230, 11.4, 'air-garrison'),
    guard = r.battle.defenders!.find((d) => d.kind === 'dragon')!,
    hp = guard.hp;
  r.untilAttacks(1);
  expect(r.unit.native!.attackWindup!.target?.building).toBe(true);
  expect(guard.hp).toBe(hp);
});

it('a retreating committed defender ends the exposed swing before reburrowing', () => {
  const r = nativeDirectBattle('battledrill', 6, 230, 11.4, 'garrison'),
    guard = r.battle.defenders!.find((d) => d.kind === 'golem')!;
  while (!r.unit.native?.attackWindup?.engaged) r.step();
  expect(r.unit.native!.attackWindup!.target).toEqual({ id: guard.id, building: false });
  guard.x = 40;
  r.step();
  expect(r.unit.native!.attacks ?? 0).toBe(0);
  expect(r.unit.native!.attackWindup!.engaged).toBeFalsy();
  expect(r.unit.native!.surfaced).toBe(false);
  expect(r.unit.native!.burrowed).toBe(true);
});

for (const version of [229, 230])
  for (const level of [1, 6])
    for (const x of [5, 10.5])
      it(`Drill ${level} from ${x} retains complete version-${version} portable phase states`, () => {
        const r = drillSurfaceRecording(level, version, x),
          viewer = new GameModel();
        if (version === 229) {
          const hashes: Record<string, string> = {
            '1:5': '0f5acb67ded053ece909abf3a02f6cff7e95d52f8a19af3b173d566ac6ea1d4d',
            '1:10.5': 'ca899dcd12f3f62c42630a3aab1a4c4b65abef2473feb836366c6be8ca8fb36f',
            '6:5': 'cc4cdcc20a2b6c5854475a1a12fc545ef2485268a561dc3b6d0f58bb9fa6257c',
            '6:10.5': 'b243f1fb79f1358683b4d0cc2a104fc84519137d41d56afd6c1af547bd9ab546',
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

it('enables Drill attack phases only for current armies carrying Battle Drill', () => {
  const r = drillSurfaceBattle();
  expect(replayBattle(r.data.initial, 229).nativeBattleDrillWindup).toBeUndefined();
  expect(replayBattle(r.data.initial, 230).nativeBattleDrillWindup).toBe(true);
  r.data.initial.army.battledrill = 0;
  expect(replayBattle(r.data.initial, 230).nativeBattleDrillWindup).toBeUndefined();
});
