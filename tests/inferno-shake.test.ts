import { expect, it } from 'vitest';
import { GameModel } from '../src/game/model';
import { createInfernoScheduler } from '../src/game/inferno-scheduler';
import { infernoShake, INFERNO_TRANSITION_SHAKE } from '../src/game/inferno-shake';

function fixture(stage: 1 | 2) {
  const model = new GameModel();
  model.startBattle(0, true);
  const battle = model.battle!;
  battle.started = true;
  battle.elapsed = 1.1;
  battle.infernos = {
    1: {
      scheduler: createInfernoScheduler(1, 'single'),
      nextTick: 20,
      hits: [],
      transitions: [{ at: 1, stage, x: 10, y: 10, slot: 0 }],
    },
  };
  return battle;
}
const rest = { x: 0, y: 0 };
it('uses both original transition windows, strengths and replay flags', () => {
  expect(INFERNO_TRANSITION_SHAKE).toEqual([
    { strength: 30, duration: 0.3, replay: true },
    { strength: 40, duration: 0.4, replay: true },
  ]);
  for (const stage of [1, 2] as const) {
    const b = fixture(stage),
      duration = stage === 1 ? 0.3 : 0.4;
    for (const elapsed of [0, 1, 1 + duration, 5]) {
      b.elapsed = elapsed;
      expect(infernoShake(b, false)).toEqual(rest);
    }
    b.elapsed = 1.15;
    expect(infernoShake(b, false)).not.toEqual(rest);
    expect(infernoShake(b, false, true)).toEqual(infernoShake(b, false));
  }
});
it('restores the same offset after seeking without mutation or camera drift', () => {
  const b = fixture(2),
    before = structuredClone(b),
    offset = infernoShake(b, false);
  for (let i = 0; i < 100; i++) expect(infernoShake(b, false)).toEqual(offset);
  infernoShake({ ...b, elapsed: 50 }, false);
  expect(infernoShake(JSON.parse(JSON.stringify(b)), false)).toEqual(offset);
  expect(b).toEqual(before);
  expect(infernoShake(b, true)).toEqual(rest);
  expect(infernoShake({ ...b, started: false }, false)).toEqual(rest);
  expect(infernoShake({ ...b, finished: true }, false)).toEqual(rest);
  expect(infernoShake(null, false)).toEqual(rest);
});
it('bounds simultaneous detached transitions even after their towers are gone', () => {
  const b = fixture(2),
    state = b.infernos![1];
  b.buildings = [];
  b.infernos = Object.fromEntries(
    Array.from({ length: 100 }, (_, i) => [i + 1, structuredClone(state)]),
  );
  for (let i = 1; i < 400; i++) {
    b.elapsed = 1 + i / 1000;
    const offset = infernoShake(b, false);
    expect(Math.abs(offset.x)).toBeLessThanOrEqual(12.8);
    expect(Math.abs(offset.y)).toBeLessThanOrEqual(12.8);
    expect(
      infernoShake(
        { ...b, infernos: Object.fromEntries(Object.entries(b.infernos).reverse()) },
        false,
      ),
    ).toEqual(offset);
  }
});
