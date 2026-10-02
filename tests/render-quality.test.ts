import { describe, expect, it } from 'vitest';
import { RenderQuality } from '../src/game/render-quality';

function driver(density = 2) {
  const quality = new RenderQuality();
  let now = 0;
  quality.reset(now);
  return {
    quality,
    run(duration: number, delta: number, enabled = true, interval?: number) {
      const end = now + duration;
      while (now < end) quality.sample((now += delta), enabled, density, interval);
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
  it('reads a deliberate frame cap as its pace, not as pressure', () => {
    const capped = 1000 / 30;
    const d = driver(3);
    // The idle village caps the loop at 30 FPS: a phone left alone keeps native density.
    d.run(60000, capped, true, capped);
    expect(d.quality.scale).toBe(1);
    // Real overload under the cap still lowers density...
    d.run(7500, 80, true, capped);
    expect(d.quality.scale).toBe(0.75);
    // ...a steady capped pace restores it...
    d.run(25000, capped, true, capped);
    expect(d.quality.scale).toBe(1);
    // ...and lifting the cap restarts the measurement instead of counting the switch.
    d.run(4000, 1000 / 60);
    expect(d.quality.scale).toBe(1);
    // Without the cap, the same 30 FPS pace counts as pressure.
    const uncapped = driver(3);
    uncapped.run(7500, capped);
    expect(uncapped.quality.scale).toBe(0.75);
  });
});
