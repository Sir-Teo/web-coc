import { describe, expect, it, vi } from 'vitest';
import { MusicPlayer, type MusicElement } from '../src/game/music';
import { SampleAudio } from '../src/game/sample-audio';

const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

function audio() {
  const sources: ReturnType<typeof source>[] = [];
  function source() {
    return {
      buffer: null,
      playbackRate: { value: 1 },
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      onended: null as null | (() => void),
    };
  }
  const gains: ReturnType<typeof gain>[] = [];
  function gain() {
    return { gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() };
  }
  const context = {
    currentTime: 0,
    state: 'running',
    destination: {},
    decodeAudioData: vi.fn(async () => ({ duration: 20 })),
    createBufferSource: () => {
      const s = source();
      sources.push(s);
      return s;
    },
    createGain: () => {
      const g = gain();
      gains.push(g);
      return g;
    },
  } as unknown as AudioContext;
  return { context, sources, gains };
}

function music() {
  const a = audio();
  const el: MusicElement = {
    src: '',
    loop: false,
    volume: 1,
    paused: true,
    play: vi.fn(async () => {
      el.paused = false;
    }),
    pause: vi.fn(() => {
      el.paused = true;
    }),
    addEventListener: vi.fn(),
  };
  const pending = new Map<string, (bytes: ArrayBuffer) => void>();
  const player = new MusicPlayer(() => a.context, {
    element: () => el,
    fetch: (path) => new Promise((resolve) => pending.set(path, resolve)),
    objectUrl: (_bytes, path) => `blob:${path}`,
  });
  const finish = async (suffix: string) => {
    const entry = [...pending].find(([path]) => path.endsWith(suffix));
    expect(entry, suffix).toBeDefined();
    pending.delete(entry![0]);
    entry![1](new ArrayBuffer(4));
    await flush();
  };
  return { ...a, el, player, finish };
}

describe('sound lifecycle', () => {
  it('explicitly stops every battle and interface voice and releases the one-shot cap', async () => {
    const { context, sources, gains } = audio();
    const samples = new SampleAudio(() => context);
    samples.register('native', new ArrayBuffer(4));
    await flush();
    samples.sync([{ key: 'battle', sample: 'native', at: 0, volume: 1, pitch: 1 }], 0, 1, true);
    for (let i = 0; i < 8; i++) expect(samples.shot('native', 1)).toBe(true);
    expect(sources).toHaveLength(9);
    const oldCallbacks = sources.map((s) => s.onended);
    samples.stopAll();
    samples.stopAll();
    for (const s of sources) {
      expect(s.stop).toHaveBeenCalledOnce();
      expect(s.disconnect).toHaveBeenCalledOnce();
    }
    expect(gains.every((g) => g.disconnect.mock.calls.length === 1)).toBe(true);
    expect(samples.shot('native', 1)).toBe(true);
    expect(sources).toHaveLength(10);
    oldCallbacks.forEach((end) => end?.());
    samples.stopAll();
    expect(sources[9].stop).toHaveBeenCalledOnce();
  });

  it('keeps interface feedback alive while battle cues pause or seek', async () => {
    const { context, sources } = audio();
    const samples = new SampleAudio(() => context);
    samples.register('native', new ArrayBuffer(4));
    await flush();
    samples.shot('native', 1);
    const cue = { key: 'battle', sample: 'native', at: 0, volume: 1, pitch: 1 };
    samples.sync([cue], 0, 1, true);
    samples.sync([cue], 5, 1, true);
    expect(sources[1].stop).toHaveBeenCalledOnce();
    samples.sync([cue], 5, 1, false);
    expect(sources[2].stop).toHaveBeenCalledOnce();
    samples.stop();
    expect(sources[0].stop).not.toHaveBeenCalled();
    sources[0].onended?.();
    expect(sources[0].disconnect).toHaveBeenCalledOnce();
    samples.stop();
    expect(sources[0].stop).not.toHaveBeenCalled();
  });

  it('discards an intro that downloads after combat starts', async () => {
    const { player, finish, sources, el } = music();
    player.setEnabled(true);
    player.setScene('planning');
    player.setScene('combat');
    await finish('combat_music.ogg');
    await finish('new_battle_intro_01.mp3');
    expect(sources).toHaveLength(0);
    expect(el.src).toContain('combat_music.ogg');
    expect(el.paused).toBe(false);
    // A later battle can use the decoded intro; only its obsolete playback was discarded.
    player.setScene('planning');
    await flush();
    expect(sources).toHaveLength(1);
    sources[0].onended?.();
    await finish('combat_planning_music.mp3');
    expect(el.src).toContain('combat_planning_music.mp3');
  });

  it('discards an old result sting even if music is enabled again before its download ends', async () => {
    const { player, finish, sources, el } = music();
    player.setEnabled(true);
    player.setScene('victory');
    player.setEnabled(false);
    player.setScene('home');
    player.setEnabled(true);
    await finish('home_music_part_1.ogg');
    await finish('winwinwin.mp3');
    expect(sources).toHaveLength(0);
    expect(el.paused).toBe(false);
  });

  it('stops a playing intro on combat and a result sting on mute without stale continuations', async () => {
    const { player, finish, sources, el } = music();
    player.setEnabled(true);
    player.setScene('planning');
    await finish('new_battle_intro_01.mp3');
    expect(sources).toHaveLength(1);
    const introEnded = sources[0].onended;
    player.setScene('combat');
    expect(sources[0].stop).toHaveBeenCalledOnce();
    expect(sources[0].connect.mock.calls[0][0].disconnect).toHaveBeenCalledOnce();
    await finish('combat_music.ogg');
    introEnded?.();
    await flush();
    expect(el.src).toContain('combat_music.ogg');
    player.setScene('victory');
    await finish('winwinwin.mp3');
    expect(sources).toHaveLength(2);
    const resultEnded = sources[1].onended;
    player.setEnabled(false);
    expect(sources[1].stop).toHaveBeenCalledOnce();
    expect(sources[1].connect.mock.calls[0][0].disconnect).toHaveBeenCalledOnce();
    resultEnded?.();
    await flush();
    expect(el.paused).toBe(true);
    expect(sources[1].disconnect).toHaveBeenCalledOnce();
  });
});
