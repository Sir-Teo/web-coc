import { expect, it } from 'vitest';
import { GameModel, type Battle } from '../src/game/model';
import { heroStatsFor } from '../src/game/native-heroes';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { validateReplay } from '../src/game/replay';
import { monolithHousingBattle, monolithHousingRecording } from './fixtures/monolith-arrow-housing';

it('counts each Hero once and excludes its pet, ability summons and spells', () => {
  const { model, battle } = monolithHousingBattle();
  expect(battle.nativeMonolithHousing).toBe(0);
  expect(model.deployNativeHero('queen', 12, 10)).toBe(false);
  expect(battle.nativeMonolithHousing).toBe(0);
  expect(model.deployNativeHero('king', 5, 5)).toBe(true);
  expect(battle.nativeMonolithHousing).toBe(25);
  expect(battle.units).toHaveLength(2);
  expect(model.deployNativeHero('king', 5, 5)).toBe(false);
  expect(model.activateNativeHeroAbility('king')).toBe(true);
  for (let i = 0; i < 10; i++) model.step(0.05);
  expect(battle.units.length).toBeGreaterThan(2);
  model.activeSpell = 'rage';
  expect(model.castSpell(5, 5)).toBe(true);
  expect(battle.nativeMonolithHousing).toBe(25);
  expect(model.deployNativeHero('queen', 6.9, 11.5)).toBe(true);
  expect(battle.nativeMonolithHousing).toBe(50);
});

it.each([1, 27])(
  'uses the correct projectile and level %s HP bonus at 180, 181, 250 and 251 housing',
  (level) => {
    const { snapshots, queenId } = monolithHousingRecording(level);
    const percentages = level === 1 ? [0.095, 0.07, 0.07, 0.04] : [0.14, 0.1, 0.1, 0.05];
    for (const [index, housing, name, percent] of [
      [0, 180, 'ArcherQueenMonolithProjectile3', percentages[0]],
      [1, 181, 'ArcherQueenMonolithProjectile2', percentages[1]],
      [2, 250, 'ArcherQueenMonolithProjectile2', percentages[2]],
      [3, 251, 'ArcherQueenMonolithProjectile1', percentages[3]],
    ] as const) {
      const battle = snapshots[index].battle as Battle;
      expect(battle.nativeMonolithHousing).toBe(housing);
      const shot = battle.projectiles!.find((shot) => shot.sourceId === queenId)!;
      expect(shot?.native?.name).toBe(name);
      const queen = battle.nativeHeroes![0];
      const damage = heroStatsFor(queen, battle.townhall!).damage;
      expect(shot.damage).toBeCloseTo(damage + battle.buildings[1].maxHp * percent, 9);
    }
  },
);

it('does not count a recalled Hero twice when it is redeployed', () => {
  const { model, battle } = monolithHousingBattle();
  expect(model.deployNativeHero('queen', 6.9, 11.5)).toBe(true);
  model.activeSpell = 'recall';
  expect(model.castSpell(6.9, 11.5)).toBe(true);
  for (let i = 0; i < 20; i++) model.step(0.05);
  expect(battle.nativeHeroes![0].unitId).toBeNull();
  expect(battle.nativeMonolithHousing).toBe(25);
  expect(model.deployNativeHero('queen', 5, 5)).toBe(true);
  expect(battle.nativeMonolithHousing).toBe(25);
});

it('keeps the counter through Recall, redeployment and losses', () => {
  const { snapshots } = monolithHousingRecording();
  const recalled = snapshots[4].battle as Battle;
  const redeployed = snapshots[5].battle as Battle;
  expect(recalled.recalledHp?.giant?.length).toBeGreaterThan(0);
  expect(redeployed.recalledHp!.giant!.length).toBe(recalled.recalledHp!.giant!.length - 3);
  expect(recalled.nativeMonolithHousing).toBe(251);
  expect(redeployed.nativeMonolithHousing).toBe(251);
  const { model, battle } = monolithHousingBattle();
  expect(model.deployNativeHero('queen', 6.9, 11.5)).toBe(true);
  battle.units[0].hp = 0;
  model.step(0.05);
  expect(battle.nativeMonolithHousing).toBe(25);
});

it('reconstructs portable backward seeks and keeps version 71 housing selection', () => {
  const { data, snapshots, at181, queenId } = monolithHousingRecording();
  expect(validateReplay(data)).toBe(true);
  const viewer = new GameModel();
  expect(viewer.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data))))).toBe(true);
  for (const snapshot of [...snapshots].reverse()) {
    viewer.seekReplay(snapshot.at);
    while (viewer.replay!.seeking) viewer.step(0.05);
    expect(JSON.parse(JSON.stringify(viewer.battle))).toEqual(snapshot.battle);
  }
  expect(viewer.openReplay({ ...data, version: 71 })).toBe(true);
  viewer.seekReplay(at181);
  while (viewer.replay!.seeking) viewer.step(0.05);
  expect(viewer.battle!.nativeMonolithHousing).toBeUndefined();
  expect(viewer.battle!.projectiles?.find((shot) => shot.sourceId === queenId)?.native?.name).toBe(
    'ArcherQueenMonolithProjectile3',
  );
});
