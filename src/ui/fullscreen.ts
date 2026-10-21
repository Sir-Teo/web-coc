type ChangeEvent = 'fullscreenchange' | 'webkitfullscreenchange';

/** The parts of the page full screen needs, including Safari's prefixed names; tests supply their own. */
export interface FullscreenHost {
  readonly fullscreenEnabled?: boolean;
  readonly webkitFullscreenEnabled?: boolean;
  readonly fullscreenElement?: Element | null;
  readonly webkitFullscreenElement?: Element | null;
  readonly documentElement: {
    requestFullscreen?(options?: FullscreenOptions): Promise<void>;
    webkitRequestFullscreen?(): void | Promise<void>;
  };
  exitFullscreen?(): Promise<void>;
  webkitExitFullscreen?(): void | Promise<void>;
  addEventListener(
    type: ChangeEvent,
    listener: () => void,
    options?: { signal?: AbortSignal },
  ): void;
}

/**
 * Hides the browser's address bar and tabs for play in a browser tab: on a landscape
 * phone the bar takes about a seventh of the screen. Android browsers, iPad Safari and
 * desktop browsers support it. iPhone Safari offers full screen only for video, so it
 * reports nothing here; Add to Home Screen is the way to hide its bars.
 *
 * Browsers grant full screen only from a tap or key press, so `toggle` must run inside
 * the input handler. Nothing is saved: the browser leaves full screen on reload, and the
 * player can leave at any time with its own gesture (back, swipe or Escape).
 */
export class Fullscreen {
  constructor(
    private readonly host: FullscreenHost | undefined = typeof document === 'undefined'
      ? undefined
      : (document as unknown as FullscreenHost),
    /** An installed app launched full screen; the same query also matches while `active`. */
    private readonly installedFullscreen: () => boolean = () =>
      typeof matchMedia === 'function' && matchMedia('(display-mode: fullscreen)').matches,
  ) {}
  /** Whether a switch makes sense: the browser allows it and the game is not already full screen. */
  get available() {
    const h = this.host;
    if (!h || !(h.fullscreenEnabled ?? h.webkitFullscreenEnabled)) return false;
    return this.active || !this.installedFullscreen();
  }
  get active() {
    return !!(this.host?.fullscreenElement ?? this.host?.webkitFullscreenElement);
  }
  /** Enters or leaves full screen; false when the browser refuses (no tap, a permissions policy). */
  async toggle(): Promise<boolean> {
    const h = this.host;
    if (!h) return false;
    try {
      if (this.active) {
        if (h.exitFullscreen) await h.exitFullscreen();
        else if (h.webkitExitFullscreen) await h.webkitExitFullscreen();
        else return false;
      } else {
        const root = h.documentElement;
        if (root.requestFullscreen) await root.requestFullscreen({ navigationUI: 'hide' });
        else if (root.webkitRequestFullscreen) await root.webkitRequestFullscreen();
        else return false;
      }
      return true;
    } catch {
      return false;
    }
  }
  /** Calls `listener` whenever the page enters or leaves full screen, by any means. */
  watch(listener: () => void, signal?: AbortSignal) {
    for (const type of ['fullscreenchange', 'webkitfullscreenchange'] as const)
      this.host?.addEventListener(type, listener, { signal });
  }
}

/** iPhone Safari outside an installed app, where Add to Home Screen gives a full-screen game. */
export const safariTab = () =>
  typeof navigator !== 'undefined' &&
  (navigator as Navigator & { standalone?: boolean }).standalone === false;
