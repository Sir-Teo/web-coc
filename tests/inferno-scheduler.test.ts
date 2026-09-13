import { expect, it } from 'vitest';
import {
  createInfernoScheduler,
  infernoTargetKilled,
  tickInfernoScheduler,
} from '../src/game/inferno-scheduler';

it('charges every 128ms and samples the ramp on the damage tick', () => {
  const state = createInfernoScheduler(1, 'single');
  const events: { at: number; stage: number }[] = [];
  for (let t = 64; t <= 5504; t += 64)
    for (const pulse of tickInfernoScheduler(state, [1]))
      events.push({ at: t, stage: pulse.stage });
  expect(events[0]).toEqual({ at: 128, stage: 0 });
  expect(events.find((e) => e.stage === 1)).toEqual({ at: 1536, stage: 1 });
  expect(events.find((e) => e.stage === 2)).toEqual({ at: 5376, stage: 2 });
  expect(events.every((e, i) => e.at === (i + 1) * 128)).toBe(true);
});

it('freezing clears ramp and charge, so thawed targets acquire afresh', () => {
  const state = createInfernoScheduler(1, 'single');
  for (let i = 0; i < 100; i++) tickInfernoScheduler(state, [1]);
  expect(tickInfernoScheduler(state, [1], false)).toEqual([]);
  expect(state.slots[0].targetId).toBeNull();
  expect(tickInfernoScheduler(state, [1])).toEqual([]);
  expect(tickInfernoScheduler(state, [1])[0]).toMatchObject({ targetId: 1, stage: 0, dps: 30 });
});

it('delays only a killed multi slot and preserves the other beam slots', () => {
  const state = createInfernoScheduler(8, 'multi');
  tickInfernoScheduler(state, [1, 2, 3, 4, 5, 6]);
  expect(tickInfernoScheduler(state, [1, 2, 3, 4, 5, 6])).toHaveLength(6);
  infernoTargetKilled(state, 1);
  expect(state.slots[1].replacementMs).toBe(50);
  tickInfernoScheduler(state, [7, 1, 3, 4, 5, 6]);
  expect(state.slots.map((s) => s.targetId)).toEqual([1, null, 3, 4, 5, 6]);
  const next = tickInfernoScheduler(state, [7, 1, 3, 4, 5, 6]);
  expect(state.slots.map((s) => s.targetId)).toEqual([1, 7, 3, 4, 5, 6]);
  expect(next.map((p) => p.slot)).toEqual([0, 2, 3, 4, 5]);
  expect(tickInfernoScheduler(state, [7, 1, 3, 4, 5, 6])).toEqual([
    { slot: 1, targetId: 7, stage: 0, dps: 80, intervalMs: 128 },
  ]);
});

it('replaces an ineligible target without imposing the target-kill delay', () => {
  const state = createInfernoScheduler(1, 'multi');
  tickInfernoScheduler(state, [1]);
  tickInfernoScheduler(state, [2, 2]);
  expect(state.slots.filter((s) => s.targetId !== null)).toHaveLength(1);
  expect(state.slots[0]).toEqual({ targetId: 2, lockedMs: 64, chargeMs: 64, replacementMs: 0 });
});

it('suspends a pending replacement delay while disabled', () => {
  const state = createInfernoScheduler(1, 'multi');
  tickInfernoScheduler(state, [1]);
  infernoTargetKilled(state, 0);
  tickInfernoScheduler(state, [2], false);
  expect(state.slots[0].replacementMs).toBe(50);
  tickInfernoScheduler(state, []);
  expect(state.slots[0].replacementMs).toBe(0);
});
