import { expect, it } from 'vitest';
import { GameModel } from '../src/game/model';
import { replayBattle } from '../src/game/replay';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { hurtUnit } from '../src/game/native-status';
import { SIEGE_BARRACKS_KINDS } from '../src/game/native-siege-barracks';
import { spawnedTroopArtLevels } from '../src/game/spawned-troop-prefetch';
import {
  deploymentLifecycleBattle,
  deploymentLifecycleRecording,
} from './fixtures/deployment-lifecycle';

const primary = [1, 1, 1, 1, 2, 2],
  secondary = [6, 8, 10, 11, 11, 12];
it('decodes the two-entry source roster independently of the Barracks level', () => {
  expect(SIEGE_BARRACKS_KINDS).toEqual(['pekka', 'wizard']);
});

for (let level = 1; level <= 6; level++)
  for (const research of [
    { pekka: 1, wizard: 1 },
    { pekka: 13, wizard: 14 },
  ])
    it(`Siege Barracks ${level} releases source stocks at own research ${research.pekka}/${research.wizard}`, () => {
      const r = deploymentLifecycleBattle('siegebarracks', level, 182, 10, research);
      r.until(r.deployed + 1.25);
      expect(r.children()).toHaveLength(0);
      r.until(r.deployed + 1.3);
      expect(r.children()).toHaveLength(primary[level - 1]);
      expect(
        r
          .children()
          .every(
            (u) =>
              u.kind === 'pekka' &&
              u.level === research.pekka &&
              Math.abs(u.spawnedAt! - r.deployed - 1.3) < 1e-8,
          ),
      ).toBe(true);
      r.until(r.deployed + 29.95);
      const children = r.children();
      expect(children.filter((u) => u.kind === 'pekka')).toHaveLength(primary[level - 1]);
      expect(children.filter((u) => u.kind === 'wizard')).toHaveLength(secondary[level - 1]);
      expect(children.every((u) => u.level === research[u.kind as 'pekka' | 'wizard'])).toBe(true);
      expect(r.unit.native!.released).toBe(primary[level - 1] + secondary[level - 1]);
      expect(r.unit.hp).toBeCloseTo(r.unit.maxHp * (1 - 29.95 / 30), 6);
    });

for (let level = 1; level <= 6; level++)
  it(`version 181 retains Siege Barracks ${level}'s original inherited primary troop`, () => {
    const r = deploymentLifecycleBattle('siegebarracks', level, 181, 0, { pekka: 13, wizard: 14 });
    r.until(1.35);
    expect(r.battle.nativeSiegeBarracksTroops).toBeUndefined();
    expect(r.children()).toHaveLength(primary[level - 1]);
    expect(
      r
        .children()
        .every(
          (u) =>
            u.kind === (level === 1 ? 'pekka' : 'wizard') && u.level === (level === 1 ? 13 : 14),
        ),
    ).toBe(true);
  });

it('loses unspawned stock on early defeat rather than filling the missing wave', () => {
  for (const afterFirst of [false, true]) {
    const r = deploymentLifecycleBattle('siegebarracks', 6, 182, 0);
    r.until(afterFirst ? 1.35 : 0.8);
    hurtUnit(r.battle, r.unit, r.unit.maxHp);
    r.until(15);
    expect(r.children()).toHaveLength(afterFirst ? 2 : 0);
    expect(r.children().every((u) => u.kind === 'pekka')).toBe(true);
  }
});

for (const version of [181, 182])
  for (const level of [1, 2, 6])
    it(`level ${level} actual delayed release reconstructs complete version ${version} portable states`, () => {
      const r = deploymentLifecycleRecording('siegebarracks', version, level, {
          pekka: 13,
          wizard: 14,
        }),
        viewer = new GameModel();
      expect(viewer.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(true);
      for (const s of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
        viewer.seekReplay(s.at);
        while (viewer.replay!.seeking) viewer.step(0.05);
        expect(JSON.parse(JSON.stringify(viewer.battle))).toEqual(s.battle);
      }
    });

for (const current of [false, true])
  it(`warms the own-research child tiers for ${current ? 'current' : 'historical'} Barracks`, () => {
    const research = { pekka: 13, wizard: 14 },
      roots = new Map([['siegebarracks', [6]]]),
      before = JSON.stringify([...roots]),
      demand = spawnedTroopArtLevels(roots, {
        researchedLevel: (kind) => research[kind as keyof typeof research] ?? 1,
        siegeBarracksTroops: current,
      });
    expect(demand.get('wizard')).toEqual([14]);
    expect(demand.get('pekka')).toEqual(current ? [13] : undefined);
    expect(JSON.stringify([...roots])).toBe(before);
  });

for (let level = 1; level <= 4; level++)
  it(`Furnace ${level} warms its inherited Firemite tier through the bunker path`, () => {
    const r = deploymentLifecycleBattle('furnace', level, 182, 0),
      demand = spawnedTroopArtLevels(new Map([['furnace', [level]]]));
    r.until(3);
    expect(demand.get('firemite')).toEqual([level]);
    expect(r.children().length).toBeGreaterThan(0);
    expect(r.children().every((u) => u.kind === 'firemite' && u.level === level)).toBe(true);
  });

it('only initial armies carrying Siege Barracks enable the new roster decoder', () => {
  const s = structuredClone(deploymentLifecycleBattle('siegebarracks').data.initial);
  expect(replayBattle(s).nativeSiegeBarracksTroops).toBe(true);
  expect(replayBattle(s, 181).nativeSiegeBarracksTroops).toBeUndefined();
  s.army.siegebarracks = 0;
  expect(replayBattle(s).nativeSiegeBarracksTroops).toBeUndefined();
});
