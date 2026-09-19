import { describe, expect, it } from 'vitest';
import { RenderQuality } from '../src/game/render-quality';

function driver(density = 2) {
  const quality = new RenderQuality();
  let now = 0;
  quality.reset(now);
  return {
    quality,
    run(duration: number, delta: number, enabled = true) {
      const end = now + duration;
      while (now < end) quality.sample((now += delta), enabled, density);
    },
  };
}

describe('adaptive canvas density', () => {
  it('keeps native quality for fast frames and isolated hiccups', () => {
    const d = driver();
    for (let i = 0; i < 20; i++) {
      d.run(1000, 1000 / 60);
      d.run(100, 100);
    }
    expect(d.quality.scale).toBe(1);
  });
  it('reduces sustained pressure in steps but never below one pixel per CSS pixel', () => {
    const d = driver();
    d.run(7500, 40);
    expect(d.quality.scale).toBe(0.75);
    d.run(30000, 40);
    expect(d.quality.scale).toBe(0.5);
    const phone = driver(3);
    phone.run(60000, 40);
    expect(phone.quality.scale).toBe(1 / 3);
    const normal = driver(1);
    normal.run(30000, 40);
    expect(normal.quality.scale).toBe(1);
  });
  it('ignores loads, gestures and background gaps, and restores quality cautiously', () => {
    const d = driver();
    d.run(30000, 40, false);
    d.run(30000, 1000);
    expect(d.quality.scale).toBe(1);
    d.run(7500, 40);
    expect(d.quality.scale).toBe(0.75);
    d.run(10000, 1000 / 60);
    expect(d.quality.scale).toBe(0.75);
    d.run(15000, 1000 / 60);
    expect(d.quality.scale).toBe(1);
  });
});
