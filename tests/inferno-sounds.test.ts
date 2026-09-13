import { expect, it } from 'vitest';
import { makeBuilding, type Battle } from '../src/game/model';
import { infernoSoundCues, INFERNO_SOUNDS } from '../src/game/inferno-sounds';
import { createInfernoScheduler, tickInfernoScheduler } from '../src/game/inferno-scheduler';
it('selects the source loop pitch/volume by heat stage and stops with the lock', () => {
  const scheduler = createInfernoScheduler(1, 'single');
  const battle = {
    elapsed: 0,
    buildings: [makeBuilding(1, 'inferno', 10, 10)],
    units: [{ id: 1, hp: 5000 }],
    defenseStuns: {},
    infernos: { 1: { scheduler, nextTick: 1, hits: [] } },
  } as unknown as Battle;
  for (let tick = 1; tick <= 100; tick++) {
    tickInfernoScheduler(scheduler, [1]);
    battle.elapsed = tick * 0.064;
    battle.infernos![1].nextTick = tick + 1;
    const cue = infernoSoundCues(battle)[0];
    const stage = tick >= 83 ? 2 : tick >= 24 ? 1 : 0;
    expect(cue.pitch).toBe([1, 1.2, 1.4][stage]);
    expect(cue.volume).toBe([0.4, 0.6, 0.8][stage]);
    expect(cue.loop).toBe(true);
  }
  battle.defenseStuns[1] = 10;
  expect(infernoSoundCues(battle)).toEqual([]);
  expect(Object.keys(INFERNO_SOUNDS)).toHaveLength(7);
});
