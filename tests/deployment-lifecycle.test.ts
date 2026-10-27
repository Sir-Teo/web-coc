import { expect, it } from 'vitest';
import { emptyArmy } from '../src/game/army';
import { GameModel } from '../src/game/model';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { replayBattle } from '../src/game/replay';
import {
  deploymentLifecycleBattle,
  deploymentLifecycleRecording,
} from './fixtures/deployment-lifecycle';

for (const [kind, hitpoints, counts] of [
  ['furnace', [1530, 1620, 1710, 1800], [19, 20, 21, 22]],
  ['siegebarracks', [3300, 3700, 4100, 4500, 4800, 5100], [7, 9, 11, 12, 13, 14]],
] as const) {
  for (const [index, hp] of hitpoints.entries())
    it(`${kind} ${index + 1} starts decay and child births at its own deployment`, () => {
      const r = deploymentLifecycleBattle(kind, index + 1),
        lifetime = kind === 'furnace' ? 60 : 30,
        count = counts[index];
      expect(r.unit.spawnedAt).toBe(r.deployed);
      r.step();
      expect(r.unit.maxHp).toBe(hp);
      expect(r.unit.hp).toBeCloseTo(hp * (1 - 0.05 / lifetime), 7);
      expect(r.children()).toHaveLength(0);
      const first = kind === 'furnace' ? 60 / (count + 2) : 1.3;
      r.until(r.deployed + first - 0.05);
      expect(r.children()).toHaveLength(0);
      r.until(r.deployed + first);
      expect(r.children()).toHaveLength(kind === 'siegebarracks' && index >= 4 ? 2 : 1);
      expect(r.children().every((u) => Math.abs(u.spawnedAt! - r.deployed - first) < 1e-8)).toBe(
        true,
      );
      r.until(r.deployed + lifetime - 0.1);
      expect(r.children()).toHaveLength(count);
      expect(r.unit.hp).toBeGreaterThan(0);
      expect(r.children().every((u) => u.spawnedAt! > r.deployed)).toBe(true);
    });
}

for (const level of [1, 2, 3, 4, 5, 6])
  for (const delay of [10, 40])
    it(`Druid ${level} deployed at ${delay}s heals for its own 30 seconds before evolving`, () => {
      const r = deploymentLifecycleBattle('druid', level, undefined, delay);
      expect(r.unit.spawnedAt).toBe(r.deployed);
      r.until(r.deployed + 29.95);
      expect(r.unit.kind).toBe('druid');
      r.step();
      expect(r.unit.kind).toBe('bear');
      expect(r.battle.elapsed - r.deployed).toBeCloseTo(30, 8);
    });

for (const kind of ['furnace', 'siegebarracks', 'druid'] as const) {
  it(`${kind} retains the historical version-148 deployment clock`, () => {
    const r = deploymentLifecycleBattle(kind, 1, 148);
    expect(r.unit.spawnedAt).toBeUndefined();
    r.step();
    if (kind === 'druid') {
      r.until(30);
      expect(r.unit.kind).toBe('bear');
    } else {
      expect(r.unit.hp).toBeCloseTo(r.unit.maxHp * (1 - 10.05 / (kind === 'furnace' ? 60 : 30)), 7);
      expect(r.children()).toHaveLength(3);
      expect(r.children().every((u) => u.spawnedAt! < r.deployed)).toBe(true);
    }
  });
  it(`${kind} deployed at zero keeps exact version-148 physics`, () => {
    const r = deploymentLifecycleBattle(kind, 1, undefined, 0),
      old = deploymentLifecycleBattle(kind, 1, 148, 0);
    r.until(35);
    old.until(35);
    const actual = JSON.parse(JSON.stringify(r.battle));
    delete actual.nativeLifecycleBirth;
    delete actual.units.find((u: { id: number }) => u.id === r.unit.id).spawnedAt;
    expect(actual).toEqual(JSON.parse(JSON.stringify(old.battle)));
  });
  for (const version of [148, 149])
    it(`${kind} delayed inputs retain complete version-${version} portable forward/reverse snapshots`, () => {
      const r = deploymentLifecycleRecording(kind, version),
        model = new GameModel();
      expect(model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(true);
      for (const snapshot of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
        model.seekReplay(snapshot.at);
        while (model.replay!.seeking) model.step(0.05);
        expect(JSON.parse(JSON.stringify(model.battle))).toEqual(snapshot.battle);
      }
    });
}

it('allocates the body-birth adapter only for carried lifecycle troops', () => {
  const setup = structuredClone(deploymentLifecycleBattle('druid').data.initial);
  expect(replayBattle(setup).nativeLifecycleBirth).toBe(true);
  expect(replayBattle(setup, 148).nativeLifecycleBirth).toBeUndefined();
  setup.army = { ...emptyArmy(), giant: 1 };
  expect(replayBattle(setup).nativeLifecycleBirth).toBeUndefined();
});
