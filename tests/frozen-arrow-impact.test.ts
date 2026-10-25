import { expect, it } from 'vitest';
import { GameModel, type Battle } from '../src/game/model';
import { buildingAttackIntervalScale } from '../src/game/native-status';
import { frozenArrowBattle, frozenArrowRecording } from './fixtures/frozen-arrow-impact';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { validateReplay } from '../src/game/replay';
import { resolveNativeImpact, type NativeTroopContext } from '../src/game/native-troops';

it('launches the native Frozen Arrow projectile with the equipment frost snapshot', () => {
  const { model, battle, queenId } = frozenArrowBattle();
  for (let i = 0; i < 3; i++) model.step(0.05);
  const shot = battle.projectiles!.find((projectile) => projectile.sourceId === queenId)!;
  expect(shot.native?.name).toBe('QueenFrostyProjectile');
  expect(shot.native?.frost).toEqual({ seconds: 0.75, percent: 0.25 });
  expect(battle.buildingEffects?.[2]?.frost).toBeUndefined();
});

it('applies and expires the captured slow at impact even after Recall removes the Queen', () => {
  const { data, snapshots, impact, recalled, hit, expired, cannonId } = frozenArrowRecording();
  expect(validateReplay(data)).toBe(true);
  const duringRecall = snapshots.find((snapshot) => snapshot.at === recalled)!.battle as Battle;
  expect(duringRecall.nativeHeroes![0].unitId).toBeNull();
  const afterHit = snapshots.find((snapshot) => snapshot.at === hit)!.battle as Battle;
  expect(afterHit.buildingEffects?.[cannonId]?.frost).toEqual({
    until: impact + 0.75,
    percent: 0.25,
  });
  expect(buildingAttackIntervalScale(afterHit, { id: cannonId }, afterHit.elapsed)).toBeCloseTo(
    1 / 0.75,
    9,
  );
  const afterExpiry = snapshots.find((snapshot) => snapshot.at === expired)!.battle as Battle;
  expect(buildingAttackIntervalScale(afterExpiry, { id: cannonId }, afterExpiry.elapsed)).toBe(1);
});

it('keeps Monolith Arrow projectile selection while carrying Frozen Arrow frost', () => {
  const { model, battle, queenId } = frozenArrowBattle([
    { slug: 'frozen-arrow', level: 1 },
    { slug: 'monolith-arrow', level: 1 },
  ]);
  for (let i = 0; i < 3; i++) model.step(0.05);
  const shot = battle.projectiles!.find((projectile) => projectile.sourceId === queenId)!;
  expect(shot.native?.name).toBe('ArcherQueenMonolithProjectile3');
  expect(shot.native?.frost).toEqual({ seconds: 0.75, percent: 0.25 });
});

it('carries the maximum equipment level frost values from the client', () => {
  const { model, battle, queenId } = frozenArrowBattle([{ slug: 'frozen-arrow', level: 27 }]);
  for (let i = 0; i < 3; i++) model.step(0.05);
  const shot = battle.projectiles!.find((projectile) => projectile.sourceId === queenId)!;
  expect(shot.native?.frost).toEqual({ seconds: 3, percent: 0.65 });
});

it('an overdue impact uses its scheduled deadline without consulting a missing shooter', () => {
  const { model, battle, queenId } = frozenArrowBattle();
  for (let i = 0; i < 3; i++) model.step(0.05);
  const shot = battle.projectiles!.find((projectile) => projectile.sourceId === queenId)!;
  battle.units = [];
  battle.nativeHeroes = [];
  battle.elapsed = shot.impact + 1;
  const ctx: NativeTroopContext = {
    battle,
    buildings: battle.buildings,
    buildingsById: new Map(battle.buildings.map((building) => [building.id, building])),
    passableWalls: new Set(),
    nextId: () => 200,
    troopLevel: () => 1,
    damageBuilding: (building, amount) => {
      building.hp = Math.max(0, building.hp - amount);
    },
    effect: () => {},
  };
  resolveNativeImpact(ctx, shot);
  expect(battle.buildingEffects?.[2]?.frost).toEqual({ until: shot.impact + 0.75, percent: 0.25 });
  expect(buildingAttackIntervalScale(battle, { id: 2 }, battle.elapsed)).toBe(1);
});

it('reconstructs the shots through portable backward seeks and preserves version 70', () => {
  const { data, snapshots, hit, cannonId } = frozenArrowRecording();
  const viewer = new GameModel();
  expect(viewer.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data))))).toBe(true);
  for (const snapshot of [...snapshots].reverse()) {
    viewer.seekReplay(snapshot.at);
    while (viewer.replay!.seeking) viewer.step(0.05);
    expect(JSON.parse(JSON.stringify(viewer.battle))).toEqual(snapshot.battle);
  }
  expect(viewer.openReplay({ ...data, version: 70 })).toBe(true);
  viewer.seekReplay(hit);
  while (viewer.replay!.seeking) viewer.step(0.05);
  expect(viewer.battle!.buildingEffects?.[cannonId]?.frost).toBeUndefined();
});
