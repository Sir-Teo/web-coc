import { describe, expect, it } from 'vitest';
import { RenderDetail } from '../src/game/render-detail';

describe('RenderDetail', () => {
  it('steps down with the unit count regardless of frame time', () => {
    const d = new RenderDetail();
    expect(d.sample(5, 100)).toBe(0);
    expect(d.sample(5, RenderDetail.UNIT_STEPS[0] + 1)).toBe(1);
    expect(d.sample(5, RenderDetail.UNIT_STEPS[1] + 1)).toBe(2);
    expect(d.sample(5, 10)).toBe(0);
  });
  it('raises pressure after a window of mostly slow frames and eases only after a long calm', () => {
    const d = new RenderDetail();
    for (let i = 0; i < RenderDetail.WINDOW - 1; i++) d.sample(RenderDetail.SLOW_MS + 10, 50);
    expect(d.level).toBe(0);
    expect(d.sample(RenderDetail.SLOW_MS + 10, 50)).toBe(1);
    for (let i = 0; i < RenderDetail.WINDOW; i++) d.sample(RenderDetail.SLOW_MS + 10, 50);
    expect(d.level).toBe(2);
    // Fast frames: the level holds until CALM_FRAMES in a row, then drops one step at a time.
    for (let i = 0; i < RenderDetail.CALM_FRAMES - 1; i++) d.sample(2, 50);
    expect(d.level).toBe(2);
    expect(d.sample(2, 50)).toBe(1);
    for (let i = 0; i < RenderDetail.CALM_FRAMES; i++) d.sample(2, 50);
    expect(d.level).toBe(0);
  });
  it('a moderately slow frame interrupts the calm streak', () => {
    const d = new RenderDetail();
    for (let i = 0; i < RenderDetail.WINDOW; i++) d.sample(40, 50);
    expect(d.level).toBe(1);
    for (let i = 0; i < RenderDetail.CALM_FRAMES - 1; i++) d.sample(2, 50);
    d.sample(RenderDetail.CALM_MS + 1, 50);
    for (let i = 0; i < RenderDetail.CALM_FRAMES - 1; i++) d.sample(2, 50);
    expect(d.level).toBe(1);
  });
  it('counts a missed vsync as slow even when the CPU was idle (GPU-bound frames)', () => {
    const d = new RenderDetail();
    for (let i = 0; i < RenderDetail.WINDOW; i++) d.sample(5, 50, 33);
    expect(d.level).toBe(1);
    // Long frames also interrupt the calm streak; a tab-hidden gap does not count as slow.
    for (let i = 0; i < RenderDetail.CALM_FRAMES - 1; i++) d.sample(2, 50, 16);
    d.sample(2, 50, 40);
    for (let i = 0; i < RenderDetail.CALM_FRAMES - 1; i++) d.sample(2, 50, 16);
    expect(d.level).toBe(1);
    d.sample(2, 50, 16);
    expect(d.level).toBe(0);
    for (let i = 0; i < RenderDetail.WINDOW; i++) d.sample(5, 50, 1000);
    expect(d.level).toBe(0);
  });
  it('ignores unknown frame times and never drops below the unit step', () => {
    const d = new RenderDetail();
    for (let i = 0; i < 1000; i++) d.sample(NaN, 50);
    expect(d.level).toBe(0);
    for (let i = 0; i < 1000; i++) d.sample(1, RenderDetail.UNIT_STEPS[1] + 1);
    expect(d.level).toBe(2);
  });
});
