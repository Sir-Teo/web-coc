import { expect, it } from 'vitest';
import { FramePacing } from '../src/game/frame-pacing';

const village = () => ({
  structuralRevision: 1,
  reducedMotion: false,
  editing: false,
  state: { settings: { batterySaver: false } },
  battle: null as { finished: boolean } | null,
  replay: null as object | null,
  placement: null as string | null,
  wallMove: null as object | null,
});

it('caps an idle village after five seconds and wakes for input or structural changes', () => {
  const model = village(),
    pacing = new FramePacing(0);
  expect(pacing.sample(model, false, 0)).toBe(0);
  expect(pacing.sample(model, false, 4999)).toBe(0);
  expect(pacing.sample(model, false, 5000)).toBe(30);
  expect(pacing.wake(model, false, 6000)).toBe(0);
  expect(pacing.sample(model, false, 10999)).toBe(0);
  model.structuralRevision++;
  expect(pacing.sample(model, false, 11000)).toBe(0);
  expect(pacing.sample(model, false, 16000)).toBe(30);
});

it('uses the lower idle cap for reduced motion without slowing active input', () => {
  const model = village(),
    pacing = new FramePacing(0);
  model.reducedMotion = true;
  pacing.sample(model, false, 0);
  expect(pacing.sample(model, false, 5000)).toBe(15);
  expect(pacing.wake(model, false, 5100)).toBe(0);
});

it('keeps battles, replays, placement, wall movement and editing at the play rate', () => {
  const activate = [
    (m: ReturnType<typeof village>) => {
      m.battle = { finished: false };
    },
    (m: ReturnType<typeof village>) => {
      m.replay = {};
    },
    (m: ReturnType<typeof village>) => {
      m.placement = 'goldmine';
    },
    (m: ReturnType<typeof village>) => {
      m.wallMove = {};
    },
    (m: ReturnType<typeof village>) => {
      m.editing = true;
    },
  ];
  for (const start of activate) {
    const model = village(),
      pacing = new FramePacing(0);
    pacing.sample(model, false, 0);
    start(model);
    expect(pacing.sample(model, false, 10000)).toBe(0);
    model.state.settings.batterySaver = true;
    expect(pacing.sample(model, false, 20000)).toBe(30);
  }
});

it('dims a village behind a dialog while live battles and replays keep their play rate', () => {
  const model = village(),
    pacing = new FramePacing(0);
  expect(pacing.sample(model, true, 0)).toBe(15);
  model.battle = { finished: false };
  expect(pacing.sample(model, true, 1)).toBe(0);
  model.battle.finished = true;
  expect(pacing.sample(model, true, 2)).toBe(15);
  model.replay = {};
  expect(pacing.sample(model, true, 3)).toBe(0);
  model.state.settings.batterySaver = true;
  expect(pacing.sample(model, true, 4)).toBe(30);
});
