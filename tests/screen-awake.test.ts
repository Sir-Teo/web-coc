import { describe, expect, it } from 'vitest';
import { ScreenAwake } from '../src/ui/screen-awake';

/** A page whose visibility the test flips, and a wake lock that records its requests. */
function fakes(options: { refuse?: boolean } = {}) {
  let listener = () => {};
  const page = {
    hidden: false,
    addEventListener: (_type: 'visibilitychange', l: () => void) => {
      listener = l;
    },
    set(hidden: boolean) {
      this.hidden = hidden;
      // Like a browser, hiding the page releases any held screen lock first.
      if (hidden) for (const s of sentinels) s.drop();
      listener();
    },
  };
  const sentinels: { released: boolean; drop(): void }[] = [];
  let requests = 0;
  let resolveNext: (() => void) | null = null;
  let deferred = false;
  const lock = {
    request: async (type: 'screen') => {
      expect(type).toBe('screen');
      requests++;
      if (options.refuse) throw new DOMException('Battery saver', 'NotAllowedError');
      if (deferred) await new Promise<void>((resolve) => (resolveNext = resolve));
      const sentinel = {
        released: false,
        type,
        drop() {
          sentinel.released = true;
        },
        release: async () => sentinel.drop(),
        addEventListener() {},
        removeEventListener() {},
      };
      sentinels.push(sentinel);
      return sentinel as unknown as WakeLockSentinel;
    },
  } as unknown as WakeLock;
  return {
    page,
    lock,
    held: () => sentinels.filter((s) => !s.released).length,
    requests: () => requests,
    defer: () => (deferred = true),
    resolve: () => resolveNext?.(),
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('ScreenAwake', () => {
  it('holds the screen on only while asked', async () => {
    const f = fakes();
    const awake = new ScreenAwake(f.lock, f.page);
    expect(awake.held).toBe(false);
    awake.hold(true);
    await settle();
    expect(awake.held).toBe(true);
    expect(f.held()).toBe(1);
    // Repeating the same wish (the 1 s timer during a raid) requests nothing new.
    awake.hold(true);
    await settle();
    expect(f.requests()).toBe(1);
    awake.hold(false);
    await settle();
    expect(awake.held).toBe(false);
    expect(f.held()).toBe(0);
  });

  it('asks again when a hidden page returns mid-raid', async () => {
    const f = fakes();
    const awake = new ScreenAwake(f.lock, f.page);
    awake.hold(true);
    await settle();
    f.page.set(true);
    await settle();
    expect(awake.held).toBe(false);
    f.page.set(false);
    await settle();
    expect(awake.held).toBe(true);
    expect(f.requests()).toBe(2);
  });

  it('does not ask while hidden, or after the raid ended hidden', async () => {
    const f = fakes();
    const awake = new ScreenAwake(f.lock, f.page);
    f.page.set(true);
    awake.hold(true);
    await settle();
    expect(f.requests()).toBe(0);
    awake.hold(false);
    f.page.set(false);
    await settle();
    expect(f.requests()).toBe(0);
  });

  it('releases a lock granted after the raid already ended', async () => {
    const f = fakes();
    f.defer();
    const awake = new ScreenAwake(f.lock, f.page);
    awake.hold(true);
    await settle();
    awake.hold(false);
    f.resolve();
    await settle();
    await settle();
    expect(f.requests()).toBe(1);
    expect(f.held()).toBe(0);
    expect(awake.held).toBe(false);
  });

  it('keeps a lock granted after a quick release and re-hold', async () => {
    const f = fakes();
    f.defer();
    const awake = new ScreenAwake(f.lock, f.page);
    awake.hold(true);
    await settle();
    awake.hold(false);
    awake.hold(true);
    f.resolve();
    await settle();
    await settle();
    expect(f.requests()).toBe(1);
    expect(awake.held).toBe(true);
  });

  it('accepts a refusal or a browser without the API', async () => {
    const refused = fakes({ refuse: true });
    const awake = new ScreenAwake(refused.lock, refused.page);
    awake.hold(true);
    await settle();
    expect(awake.held).toBe(false);
    const bare = new ScreenAwake(undefined, undefined);
    bare.hold(true);
    await settle();
    expect(bare.held).toBe(false);
  });
});
