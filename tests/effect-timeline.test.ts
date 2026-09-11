import { expect, it, vi } from 'vitest';
import { EffectTimeline } from '../src/game/effect-timeline';

function fixture() {
  const target = {
    active: true,
    x: 4,
    y: 8,
    alpha: 1,
    scaleX: 1,
    scaleY: 2,
    destroy() {
      this.active = false;
    },
  };
  const timeline = new EffectTimeline();
  const done = vi.fn(() => target.destroy());
  return { target, timeline, done };
}

it('holds delayed feedback and interpolates using only supplied battle time', () => {
  const { target, timeline, done } = fixture();
  timeline.add(
    { targets: target, x: 20, alpha: 0, duration: 200, delay: 100, onComplete: done },
    10,
  );
  timeline.update(10.05);
  expect(target.x).toBe(4);
  timeline.update(10.2);
  expect(target.x).toBeCloseTo(12);
  expect(target.alpha).toBeCloseTo(0.5);
  timeline.update(10.2);
  expect(target.x).toBeCloseTo(12);
  timeline.update(10.4);
  timeline.update(11);
  expect(target.x).toBe(20);
  expect(done).toHaveBeenCalledTimes(1);
});

it('preserves separate initial scales and accepts explicit per-axis targets', () => {
  const { target, timeline, done } = fixture();
  timeline.add({ targets: target, scale: 3, scaleY: 4, duration: 100, onComplete: done }, 0);
  timeline.update(0.05);
  expect(target.scaleX).toBe(2);
  expect(target.scaleY).toBe(3);
});

it('settles all pending effects when a battle completes, including delayed effects', () => {
  const { target, timeline, done } = fixture();
  timeline.add({ targets: target, alpha: 0, duration: 100, delay: 100, onComplete: done }, 0);
  timeline.update(Infinity);
  expect(target.active).toBe(false);
  expect(done).toHaveBeenCalledTimes(1);
});

it('cancels on transition without invoking a completion callback in the next village', () => {
  const { target, timeline, done } = fixture();
  timeline.add({ targets: target, alpha: 0, duration: 100, onComplete: done }, 0);
  timeline.clear();
  timeline.update(1);
  expect(target.active).toBe(false);
  expect(done).not.toHaveBeenCalled();
});

it('drops externally destroyed objects without writing or completing them', () => {
  const { target, timeline, done } = fixture();
  timeline.add({ targets: target, x: 50, duration: 100, onComplete: done }, 0);
  target.destroy();
  timeline.update(1);
  expect(target.x).toBe(4);
  expect(done).not.toHaveBeenCalled();
});
