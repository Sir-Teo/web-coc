import { afterEach, expect, it, vi } from 'vitest';
import { AudioManager } from '../src/game/audio';
import { MusicPlayer, type MusicElement } from '../src/game/music';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};
const output = (node: any) => node.connect.mock.calls[0][0];

function graph() {
  const node = () => ({
    connect: vi.fn(),
    disconnect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    onended: null as null | (() => void),
    playbackRate: { value: 1 },
    buffer: null,
    frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
  });
  const sources: ReturnType<typeof node>[] = [],
    oscillators: ReturnType<typeof node>[] = [],
    streams: ReturnType<typeof node>[] = [];
  const ctx = {
    state: 'running',
    currentTime: 10,
    destination: {},
    resume: vi.fn().mockResolvedValue(undefined),
    suspend: vi.fn().mockResolvedValue(undefined),
    decodeAudioData: vi.fn(async () => ({ duration: 20 })),
    createBufferSource: vi.fn(() => {
      const n = node();
      sources.push(n);
      return n;
    }),
    createOscillator: vi.fn(() => {
      const n = node();
      oscillators.push(n);
      return n;
    }),
    createMediaElementSource: vi.fn(() => {
      const n = node();
      streams.push(n);
      return n;
    }),
    createGain: vi.fn(() => {
      const gain = {
        value: 1,
        cancelScheduledValues: vi.fn(),
        setValueAtTime: vi.fn((v: number) => {
          gain.value = v;
        }),
        exponentialRampToValueAtTime: vi.fn((v: number) => {
          gain.value = v;
        }),
        setTargetAtTime: vi.fn((v: number) => {
          gain.value = v;
        }),
      };
      return { gain, connect: vi.fn(), disconnect: vi.fn() };
    }),
  };
  return { ctx, sources, oscillators, streams };
}

it('configures default and saved volumes without opening an audio context', () => {
  const audio = new AudioManager();
  expect(audio.effectsVolume).toBe(1);
  expect(audio.musicVolume).toBe(0.5);
  audio.effectsVolume = 0.2;
  audio.musicVolume = 0.8;
  expect(audio.context).toBe(null);
  expect(audio.effectsVolume).toBe(0.2);
  expect(audio.musicVolume).toBe(0.8);
});

it('changes one effects output for active native shots, battle loops and generated tones', async () => {
  vi.stubGlobal('fetch', undefined);
  vi.spyOn(performance, 'now').mockReturnValue(1000);
  const { ctx, sources, oscillators } = graph();
  const audio = new AudioManager();
  audio.effectsVolume = 0.25;
  audio.context = ctx as unknown as AudioContext;
  audio.samples.register('native', new ArrayBuffer(8));
  await flush();
  expect(ctx.createGain).not.toHaveBeenCalled();
  expect(audio.samples.shot('native', 0.8)).toBe(true);
  const voice = output(sources[0]),
    master = output(voice);
  expect(voice.gain.value).toBeCloseTo(0.8 * 0.12);
  expect(master.gain.value).toBe(0.25);
  expect(output(master)).toBe(ctx.destination);
  audio.samples.sync(
    [{ key: 'loop', sample: 'native', at: 0, volume: 0.6, pitch: 1, loop: true }],
    1,
    1,
    true,
  );
  expect(output(output(sources[1]))).toBe(master);
  audio.play('deploy');
  expect(output(output(oscillators[0]))).toBe(master);
  audio.effectsVolume = 0;
  expect(master.gain.value).toBe(0);
  audio.effectsVolume = 0.7;
  expect(master.gain.value).toBe(0.7);
  expect(sources).toHaveLength(2);
  expect(oscillators).toHaveLength(1);
  expect(voice.gain.value).toBeCloseTo(0.8 * 0.12);
});

it('uses one live music output for the streamed loop and result sting', async () => {
  const { ctx, sources, streams } = graph();
  let ended = () => {};
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
    addEventListener: (_, listener) => {
      ended = listener;
    },
  };
  const player = new MusicPlayer(() => ctx as unknown as AudioContext, {
    element: () => el,
    fetch: vi.fn(async () => new ArrayBuffer(8)),
    objectUrl: (_, path) => `blob:${path}`,
  });
  player.setVolume(0.25);
  expect(ctx.createGain).not.toHaveBeenCalled();
  player.setScene('home');
  player.setEnabled(true);
  await flush();
  expect(streams).toHaveLength(1);
  const master = output(streams[0]);
  expect(master.gain.value).toBe(0.25);
  expect(output(master)).toBe(ctx.destination);
  expect(el.volume).toBe(1);
  player.setVolume(0.8);
  expect(master.gain.value).toBe(0.8);
  expect(el.play).toHaveBeenCalledOnce();
  ended();
  await flush();
  expect(el.src).toContain('home_music_part_2');
  expect(streams).toHaveLength(1);
  player.setScene('victory');
  await flush();
  const voice = output(sources[0]);
  expect(output(voice)).toBe(master);
  expect(voice.gain.value).toBe(1);
  player.setVolume(0);
  expect(master.gain.value).toBe(0);
  player.setVolume(0.6);
  expect(master.gain.value).toBe(0.6);
  expect(sources[0].start).toHaveBeenCalledOnce();
  player.setScene('home');
  await flush();
  expect(streams).toHaveLength(1);
  expect(master.disconnect).not.toHaveBeenCalled();
});

it('keeps media playback and live volume available when a media source cannot be created', async () => {
  const { ctx } = graph();
  ctx.createMediaElementSource.mockImplementation(() => {
    throw new Error('Media routing unavailable');
  });
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
  const player = new MusicPlayer(() => ctx as unknown as AudioContext, {
    element: () => el,
    fetch: async () => new ArrayBuffer(8),
    objectUrl: (_, path) => `blob:${path}`,
  });
  player.setVolume(0.2);
  player.setScene('home');
  player.setEnabled(true);
  await flush();
  expect(el.paused).toBe(false);
  expect(el.volume).toBe(0.2);
  player.setVolume(0.9);
  expect(el.volume).toBe(0.9);
  expect(el.play).toHaveBeenCalledOnce();
});
