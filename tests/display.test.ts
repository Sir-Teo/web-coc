import { afterEach, describe, expect, it, vi } from 'vitest';
import { configureDisplay, displaySize, setMaxDensity } from '../src/game/display';
import { RenderQuality } from '../src/game/render-quality';

describe('display buffer allocation', () => {
  it('uses native pixels for Retina desktops, triple-density phones and fractional browser zoom', () => {
    expect(displaySize(1440, 960, 2)).toEqual({ width: 2880, height: 1920 });
    expect(displaySize(390, 844, 3)).toEqual({ width: 1170, height: 2532 });
    expect(displaySize(801, 601, 1.25)).toEqual({ width: 1001, height: 751 });
    expect(displaySize(1440, 960, 0.8)).toEqual({ width: 1152, height: 768 });
  });
  it('fits huge displays and narrow GPU limits without stretching the aspect ratio', () => {
    for (const [width, height, dpr, limit] of [
      [7680, 4320, 3, 8192],
      [390, 844, 3, 2048],
      [100, 12000, 2, 4096],
    ]) {
      const size = displaySize(width, height, dpr, limit);
      expect(size.width * size.height).toBeLessThanOrEqual(16_000_000);
      expect(Math.max(size.width, size.height)).toBeLessThanOrEqual(limit);
      expect(Math.abs(size.width - (size.height * width) / height)).toBeLessThan(2);
      expect(size.width).toBeGreaterThan(0);
      expect(size.height).toBeGreaterThan(0);
    }
  });
});

// Exercise measurement separately from physical resizing while a finger remains down.
describe('adaptive density during phone gestures', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  function phone(controlled = true) {
    const rect = { width: 390, height: 844 };
    let observedResize = () => {};
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          observedResize = callback;
        }
        observe() {}
        disconnect() {}
      },
    );
    vi.stubGlobal('window', { devicePixelRatio: 3 });
    vi.stubGlobal('document', { hidden: false });
    vi.stubGlobal('matchMedia', () => ({ addEventListener() {}, removeEventListener() {} }));
    const pointer = { isDown: false };
    const events = new Map<string, () => void>();
    const scale = {
      width: 0,
      height: 0,
      resize: vi.fn((width: number, height: number): void => {
        scale.width = width;
        scale.height = height;
      }),
      refresh: vi.fn(),
    };
    let requested: number | undefined;
    const sample = vi.spyOn(RenderQuality.prototype, 'sample');
    if (controlled)
      sample.mockImplementation(function (this: RenderQuality, _now: number, enabled: boolean) {
        if (!enabled || requested === undefined) return false;
        this.scale = requested;
        requested = undefined;
        return true;
      });
    const gl = {
      MAX_VIEWPORT_DIMS: 1,
      MAX_RENDERBUFFER_SIZE: 2,
      MAX_TEXTURE_SIZE: 3,
      getParameter: (key: number) => (key === 1 ? [8192, 8192] : 8192),
    };
    const game = {
      renderer: { gl, contextLost: false },
      canvas: { parentElement: { getBoundingClientRect: () => rect } },
      scale,
      input: { pointers: [pointer] },
      loop: { fpsLimit: 60 },
      scene: {
        scenes: [
          { sys: { isActive: () => true }, load: { isLoading: () => false }, paused: false },
        ],
      },
      events: {
        on: (name: string, callback: () => void) => events.set(name, callback),
        once() {},
        off() {},
      },
    };
    configureDisplay(game as never);
    return {
      game,
      pointer,
      rect,
      scale,
      sample,
      request: (next: number) => {
        requested = next;
      },
      step: () => events.get('prestep')!(),
      resize: () => observedResize(),
    };
  }
  it('measures held gestures and applies pressure only after release, including viewport changes', () => {
    const p = phone();
    expect([p.scale.width, p.scale.height]).toEqual([1170, 2532]);
    p.pointer.isDown = true;
    p.request(0.75);
    p.step();
    expect(p.sample.mock.lastCall?.[1]).toBe(true);
    expect([p.scale.width, p.scale.height]).toEqual([1170, 2532]);
    p.rect.height = 800;
    p.resize();
    expect([p.scale.width, p.scale.height]).toEqual([1170, 2400]);
    p.pointer.isDown = false;
    p.step();
    expect([p.scale.width, p.scale.height]).toEqual([878, 1800]);
    const resizes = p.scale.resize.mock.calls.length;
    p.step();
    expect(p.scale.resize).toHaveBeenCalledTimes(resizes);
  });
  it('discards a pending adjustment when an explicit density ceiling resets quality', () => {
    const p = phone();
    p.pointer.isDown = true;
    p.request(0.75);
    p.step();
    setMaxDensity(p.game as never, 2);
    expect([p.scale.width, p.scale.height]).toEqual([780, 1688]);
    const resizes = p.scale.resize.mock.calls.length;
    p.pointer.isDown = false;
    p.step();
    expect([p.scale.width, p.scale.height]).toEqual([780, 1688]);
    expect(p.scale.resize).toHaveBeenCalledTimes(resizes);
  });
  it('waits for the deferred resize to settle before requesting another quality drop', () => {
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const p = phone(false);
    p.pointer.isDown = true;
    for (now = 40; now <= 30000; now += 40) p.step();
    expect([p.scale.width, p.scale.height]).toEqual([1170, 2532]);
    p.pointer.isDown = false;
    p.step();
    expect([p.scale.width, p.scale.height]).toEqual([878, 1899]);
    for (let i = 0; i < 100; i++) {
      now += 40;
      p.step();
    }
    expect([p.scale.width, p.scale.height]).toEqual([878, 1899]);
    for (let i = 0; i < 100; i++) {
      now += 40;
      p.step();
    }
    expect([p.scale.width, p.scale.height]).toEqual([585, 1266]);
  });
});
