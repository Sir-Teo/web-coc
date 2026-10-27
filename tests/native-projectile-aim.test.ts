import { expect, it } from 'vitest';
import {
  nativeProjectileAimAt,
  recordNativeProjectileAim,
} from '../src/game/native-projectile-aim';
import {
  nativeProjectileFlight,
  type NativeProjectileRow,
} from '../src/game/native-projectile-poses';
import { GameModel, makeBuilding, type Battle } from '../src/game/model';
import { spawnSkeleton } from '../src/game/defenders';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { replayBattle } from '../src/game/replay';
import { frostFlakeBattle } from './fixtures/native-frost-flake';
import { spikyBallBattle } from './fixtures/native-spiky-ball';
import { seekingShieldBattle } from './fixtures/native-seeking-shield';
import { nativeEquipmentFlightRecording } from './fixtures/native-equipment-flight';

const iso = (x: number, y: number) => ({ x: (x - y) * 32, y: (x + y) * 16 });
const row = {
  SWF: 'sc/characters.sc',
  ExportName: 'shield_projectile',
  exports: ['shield_projectile'],
  StartHeight: '50',
  BallisticHeight: '100',
  IsBallistic: 'TRUE',
  UseRotate: 'FALSE',
} satisfies NativeProjectileRow;

it('samples recorded aim intervals and clamps outside their captured times', () => {
  const shot = {
    x: 99,
    y: 99,
    nativeAim: [
      { at: 1, x: 10, y: 20 },
      { at: 1.05, x: 8, y: 24 },
      { at: 1.1, x: 12, y: 22 },
    ],
  };
  expect(nativeProjectileAimAt(shot, 0)).toEqual(shot.nativeAim[0]);
  expect(nativeProjectileAimAt(shot, 1.025)).toEqual({
    x: expect.closeTo(9, 10),
    y: expect.closeTo(22, 10),
  });
  expect(nativeProjectileAimAt(shot, 1.05)).toEqual({ x: 8, y: 24 });
  expect(nativeProjectileAimAt(shot, 2)).toEqual(shot.nativeAim[2]);
  const historical = { x: 10, y: 20 };
  expect(nativeProjectileAimAt(historical, 2)).toBe(historical);
});

it('keeps a stationary interval before movement and caps the final observation at impact', () => {
  const shot = { x: 10, y: 20, impact: 0.12, nativeAim: [{ at: 0, x: 10, y: 20 }] };
  recordNativeProjectileAim(shot, 0.05);
  shot.x = 8;
  recordNativeProjectileAim(shot, 0.1);
  recordNativeProjectileAim(shot, 0.15);
  recordNativeProjectileAim(shot, 0.2);
  expect(shot.nativeAim.map((p) => p.at)).toEqual([0, 0.05, 0.1, 0.12]);
  expect(nativeProjectileAimAt(shot, 0.025)).toMatchObject({ x: 10, y: 20 });
  expect(nativeProjectileAimAt(shot, 0.075)).toEqual({ x: 9, y: 20 });
  const old = { x: 10, y: 20, impact: 1 };
  recordNativeProjectileAim(old, 0.5);
  expect(old).toEqual({ x: 10, y: 20, impact: 1 });
});

it('preserves past original particle birth points when later aims arrive', () => {
  const shot = {
    fromX: 6.9,
    fromY: 11.5,
    x: 16,
    y: 12,
    launched: 0,
    impact: 1,
    nativeAim: [
      { at: 0, x: 16, y: 12 },
      { at: 0.2, x: 15, y: 12.5 },
    ],
  };
  const point = (at: number) =>
    nativeProjectileFlight(row, { ...shot, ...nativeProjectileAimAt(shot, at) }, at, {
      iso,
      airLift: 46,
    });
  const atBirth = point(0.15);
  shot.x = 14;
  shot.y = 13;
  recordNativeProjectileAim(shot, 0.4);
  expect(point(0.15)).toEqual(atBirth);
  const finalAimOnly = nativeProjectileFlight(row, shot, 0.15, { iso, airLift: 46 });
  expect(Math.hypot(finalAimOnly.x - atBirth.x, finalAimOnly.y - atBirth.y)).toBeGreaterThan(5);
});

function shots(battle: Battle) {
  return (battle.nativeFrostFlakeCasts ??
    battle.nativeSpikyBallCasts ??
    battle.nativeSeekingShieldCasts)![0].shots;
}

function movingBattle(kind: 'frost' | 'ball' | 'shield', version?: number) {
  const r =
    kind === 'frost'
      ? frostFlakeBattle(1, version)
      : kind === 'ball'
        ? spikyBallBattle(3, version)
        : seekingShieldBattle(1, version);
  const hero = r.battle.units.find((u) => u.id === r.battle.nativeHeroes![0].unitId)!;
  (hero.native!.effects ??= {}).frozenUntil = 100;
  r.battle.buildingEffects = Object.fromEntries(
    r.battle.buildings.map((b) => [b.id, { invisibleUntil: 100 }]),
  );
  const target = spawnSkeleton(r.battle, makeBuilding(30, 'skeletontrap', 0, 0, 1), -1, 0);
  Object.assign(target, { x: hero.x + 10, y: hero.y, hp: 10000, maxHp: 10000 });
  r.model.activateNativeHeroAbility(kind === 'ball' ? 'king' : 'champion');
  return r;
}

it.each(['frost', 'ball', 'shield'] as const)(
  '%s retains every moving aim through JSON restoration and canonical landing',
  (kind) => {
    const r = movingBattle(kind);
    for (let n = 0; !shots(r.model.battle!).length && n < 30; n++) r.model.step(0.05);
    const launched = shots(r.model.battle!)[0];
    r.model.step(0.05);
    const prefix = JSON.parse(JSON.stringify(shots(r.model.battle!)[0]));
    const birth = prefix.launched + (prefix.nativeAim.at(-1).at - prefix.launched) * 0.75;
    const point = nativeProjectileAimAt(prefix, birth);
    r.model.battle = JSON.parse(JSON.stringify(r.model.battle));
    for (let n = 0; r.model.battle!.projectiles?.some((p) => p.id === launched.id) && n < 100; n++)
      r.model.step(0.05);
    const landed = shots(r.model.battle!)[0],
      aims = landed.nativeAim!;
    expect(aims.length).toBeGreaterThan(3);
    expect(aims[0]).toMatchObject({ at: landed.launched });
    expect(aims.at(-1)).toEqual({ at: landed.impact, x: landed.x, y: landed.y });
    expect(aims.at(-1)!.x).toBeLessThan(aims[0].x);
    expect(aims.every((p, i) => !i || p.at > aims[i - 1].at)).toBe(true);
    expect(aims.every((p, i) => !i || p.at - aims[i - 1].at <= 0.05 + 1e-9)).toBe(true);
    expect(aims.length).toBeLessThanOrEqual(
      Math.ceil((landed.impact - landed.launched) / 0.05) + 2,
    );
    expect(nativeProjectileAimAt(landed, birth)).toEqual(point);
    expect(r.model.battle!.projectiles?.some((p) => p.id === landed.id)).toBe(false);
    const old = movingBattle(kind, 136);
    while (old.battle.elapsed < r.model.battle!.elapsed - 1e-9) old.model.step(0.05);
    expect(combatOnly(r.model.battle)).toEqual(old.battle);
    expect(shots(old.battle)[0].nativeAim).toBeUndefined();
  },
);

const combatOnly = (value: unknown) =>
  JSON.parse(
    JSON.stringify(value, (key, own) =>
      key === 'nativeAim' || key === 'nativeEquipmentFlightHistory' ? undefined : own,
    ),
  );

it.each(['frost-charm', 'seeking-shield'] as const)(
  '%s history preserves version 136 combat exactly and reconstructs portable seeks',
  (equipment) => {
    // Isolate version 137's history from later garrison damage changes.
    const r = nativeEquipmentFlightRecording(equipment, 137),
      old = nativeEquipmentFlightRecording(equipment, 136);
    expect(combatOnly(r.battle)).toEqual(old.battle);
    expect(combatOnly(r.finalBattle)).toEqual(old.finalBattle);
    expect(shots(old.finalBattle).every((shot) => !shot.nativeAim)).toBe(true);
    expect(shots(r.finalBattle).filter((shot) => shot.nativeAim)).toHaveLength(1);
    expect(
      shots(r.finalBattle)
        .filter((shot) => !shot.targetDefender)
        .every((shot) => !shot.nativeAim),
    ).toBe(true);
    const model = new GameModel();
    expect(model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(true);
    for (const at of [r.observation, 0.1, r.finalBattle.elapsed, r.observation]) {
      model.seekReplay(at);
      while (model.replay!.seeking) model.step(0.05);
      if (at === r.observation) expect(JSON.parse(JSON.stringify(model.battle))).toEqual(r.battle);
      if (at === r.finalBattle.elapsed)
        expect(JSON.parse(JSON.stringify(model.battle))).toEqual(r.finalBattle);
    }
  },
);

it('allocates the new history only for the three eligible equipment controllers', () => {
  const r = seekingShieldBattle(),
    setup = r.data.initial;
  expect(replayBattle(setup).nativeEquipmentFlightHistory).toBe(true);
  expect(replayBattle(setup, 136).nativeEquipmentFlightHistory).toBeUndefined();
  const empty = structuredClone(setup);
  empty.heroes![0].items = [];
  expect(replayBattle(empty).nativeEquipmentFlightHistory).toBeUndefined();
  empty.heroes![0].items = [{ slug: 'rocket-spear', level: 1 }];
  expect(replayBattle(empty).nativeEquipmentFlightHistory).toBeUndefined();
});
