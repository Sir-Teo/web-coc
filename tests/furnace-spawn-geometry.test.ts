import { expect, it, vi } from 'vitest';
import { GameModel } from '../src/game/model';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { replayBattle } from '../src/game/replay';
import { furnaceReleasePoint } from '../src/game/native-furnace-geometry';
import { furnaceAuraBattle } from './fixtures/furnace-aura';
import { furnaceSpawnGeometryRecording } from './fixtures/furnace-spawn-geometry';

it('pins release five without consulting the host sine or cosine', () => {
  const sin = vi.spyOn(Math, 'sin'),
    cos = vi.spyOn(Math, 'cos');
  try {
    expect(furnaceReleasePoint({ x: 0, y: 0 }, 4, 1)).toEqual({
      x: -0.5000000000000004,
      y: -0.8660254037844385,
    });
    expect(sin).not.toHaveBeenCalled();
    expect(cos).not.toHaveBeenCalled();
  } finally {
    sin.mockRestore();
    cos.mockRestore();
  }
});
for (const level of [1, 2, 3, 4])
  it(`Furnace ${level} keeps exact version-150 Node combat through its complete stock`, () => {
    const r = furnaceAuraBattle(level, 18, undefined, 0, { x: 6.9, y: 11.5, allyOffset: 1 }),
      old = furnaceAuraBattle(level, 18, 150, 0, { x: 6.9, y: 11.5, allyOffset: 1 });
    r.until(65);
    old.until(65);
    const actual = JSON.parse(JSON.stringify(r.battle));
    delete actual.nativeFurnaceSpawnGeometry;
    expect(actual).toEqual(JSON.parse(JSON.stringify(old.battle)));
    expect(r.unit.native!.released).toBe(18 + level);
  });
for (const level of [1, 4])
  for (const version of [150, 151])
    it(`Furnace ${level} reconstructs full version-${version} portable forward/reverse snapshots`, () => {
      const r = furnaceSpawnGeometryRecording(level, version),
        model = new GameModel();
      expect(model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(true);
      for (const snapshot of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
        model.seekReplay(snapshot.at);
        while (model.replay!.seeking) model.step(0.05);
        expect(JSON.parse(JSON.stringify(model.battle))).toEqual(snapshot.battle);
      }
    });
it('only carried Furnace rosters allocate canonical release geometry', () => {
  const setup = structuredClone(furnaceAuraBattle().data.initial);
  expect(replayBattle(setup).nativeFurnaceSpawnGeometry).toBe(true);
  expect(replayBattle(setup, 150).nativeFurnaceSpawnGeometry).toBeUndefined();
  setup.army.furnace = 0;
  expect(replayBattle(setup).nativeFurnaceSpawnGeometry).toBeUndefined();
});
