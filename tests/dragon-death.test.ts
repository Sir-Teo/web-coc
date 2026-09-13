import { expect, it } from 'vitest';
import source from '../reference/garrison/dragon-death-source.json';
import witness from './fixtures/native-dragon-death-mesh/death.json';
import { GameModel } from '../src/game/model';
import { spawnGarrisonDefender } from '../src/game/garrison-combat';
import { hurtDefender } from '../src/game/defenders';
import { garrisonPoses, DRAGON_DEATH_LAST_TIME } from '../src/game/garrison-poses';

it('retains all source death frames and an independent witness for each', () => {
  const clip = source.graph.clips['56'];
  expect(clip.fps).toBe(24);
  expect(clip.timeline).toHaveLength(143);
  expect(clip.frames).toHaveLength(138);
  expect(witness.cases.map((c) => c.frame)).toEqual(Array.from({ length: 143 }, (_, i) => i));
  expect(DRAGON_DEATH_LAST_TIME).toBe(142 / 24);
});

it('plays the common death export without looping and reconstructs it after reverse seeking', () => {
  const model = new GameModel();
  model.startBattle(0, true);
  const battle = model.battle!;
  const dragon = spawnGarrisonDefender(battle, 'dragon', 7, 1, 10, 10, 0);
  battle.elapsed = 2;
  hurtDefender(battle, dragon, 4000);
  const first = garrisonPoses(dragon, battle);
  expect(first).toEqual([]);
  battle.elapsed = 3;
  const middle = garrisonPoses(dragon, battle);
  expect(middle.length).toBeGreaterThan(0);
  expect(middle).not.toEqual(first);
  battle.elapsed = 20;
  const terminal = garrisonPoses(dragon, battle);
  expect(terminal).toEqual([]);
  battle.elapsed = 40;
  expect(garrisonPoses(dragon, battle)).toEqual(terminal);
  battle.elapsed = 2;
  expect(garrisonPoses(dragon, battle, true)).toEqual(terminal);
  expect(garrisonPoses(dragon, battle)).toEqual(first);
});
