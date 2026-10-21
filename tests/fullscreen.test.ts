import { describe, expect, it } from 'vitest';
import { Fullscreen, type FullscreenHost } from '../src/ui/fullscreen';

type Listener = () => void;

/** A page that records full-screen requests and announces changes as a browser does. */
function fakePage(options: { enabled?: boolean; prefixed?: boolean; refuse?: boolean } = {}) {
  const { enabled = true, prefixed = false, refuse = false } = options;
  const listeners: Record<string, Listener[]> = {};
  const calls: unknown[] = [];
  const root = {} as FullscreenHost['documentElement'];
  let element: Element | null = null;
  const change = (next: Element | null) => {
    element = next;
    for (const l of listeners[prefixed ? 'webkitfullscreenchange' : 'fullscreenchange'] ?? []) l();
  };
  const page: FullscreenHost & { leave(): void } = {
    get [prefixed ? 'webkitFullscreenEnabled' : 'fullscreenEnabled']() {
      return enabled;
    },
    get [prefixed ? 'webkitFullscreenElement' : 'fullscreenElement']() {
      return element;
    },
    documentElement: root,
    addEventListener: (type, listener) => (listeners[type] ??= []).push(listener),
    /** The player's own gesture: back, swipe or Escape. */
    leave: () => change(null),
  };
  if (prefixed) {
    root.webkitRequestFullscreen = () => {
      calls.push('webkit-request');
      change(root as unknown as Element);
    };
    page.webkitExitFullscreen = () => {
      calls.push('webkit-exit');
      change(null);
    };
  } else {
    root.requestFullscreen = async (options) => {
      calls.push(options);
      if (refuse) throw new TypeError('Permissions check failed');
      change(root as unknown as Element);
    };
    page.exitFullscreen = async () => {
      calls.push('exit');
      change(null);
    };
  }
  return { page, calls };
}

describe('Fullscreen', () => {
  it('enters with the navigation bar hidden and leaves again', async () => {
    const { page, calls } = fakePage();
    const fullscreen = new Fullscreen(page, () => false);
    expect(fullscreen.available).toBe(true);
    expect(fullscreen.active).toBe(false);
    expect(await fullscreen.toggle()).toBe(true);
    expect(fullscreen.active).toBe(true);
    expect(await fullscreen.toggle()).toBe(true);
    expect(fullscreen.active).toBe(false);
    expect(calls).toEqual([{ navigationUI: 'hide' }, 'exit']);
  });

  it("uses Safari's prefixed names", async () => {
    const { page, calls } = fakePage({ prefixed: true });
    const fullscreen = new Fullscreen(page, () => false);
    expect(fullscreen.available).toBe(true);
    await fullscreen.toggle();
    expect(fullscreen.active).toBe(true);
    await fullscreen.toggle();
    expect(calls).toEqual(['webkit-request', 'webkit-exit']);
  });

  it('reports a refusal instead of throwing', async () => {
    const { page } = fakePage({ refuse: true });
    const fullscreen = new Fullscreen(page, () => false);
    expect(await fullscreen.toggle()).toBe(false);
    expect(fullscreen.active).toBe(false);
  });

  it('also catches an asynchronous refusal from a prefixed browser', async () => {
    const { page } = fakePage({ prefixed: true });
    page.documentElement.webkitRequestFullscreen = () => Promise.reject(new TypeError('Denied'));
    const fullscreen = new Fullscreen(page, () => false);
    expect(await fullscreen.toggle()).toBe(false);
    expect(fullscreen.active).toBe(false);
  });

  it('offers nothing where pages cannot go full screen', async () => {
    const { page, calls } = fakePage({ enabled: false });
    expect(new Fullscreen(page, () => false).available).toBe(false);
    expect(new Fullscreen(undefined).available).toBe(false);
    expect(await new Fullscreen(undefined).toggle()).toBe(false);
    expect(calls).toEqual([]);
  });

  it('hides the switch in an installed full-screen app, but not once the switch is on', async () => {
    const { page } = fakePage();
    let displayFullscreen = true; // The installed app's launch mode.
    const fullscreen = new Fullscreen(page, () => displayFullscreen);
    expect(fullscreen.available).toBe(false);
    // In a browser tab the media query matches while the page is full screen.
    displayFullscreen = false;
    await fullscreen.toggle();
    displayFullscreen = true;
    expect(fullscreen.available).toBe(true);
  });

  it("tells the HUD when the browser's own gesture leaves full screen", async () => {
    for (const prefixed of [false, true]) {
      const { page } = fakePage({ prefixed });
      const fullscreen = new Fullscreen(page, () => false);
      const seen: boolean[] = [];
      fullscreen.watch(() => seen.push(fullscreen.active));
      await fullscreen.toggle();
      page.leave();
      expect(seen).toEqual([true, false]);
    }
  });
});
