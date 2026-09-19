import { expect, it, vi } from 'vitest';
import {
  MAX_VOICES,
  MAX_VOICES_PER_SAMPLE,
  SampleAudio,
  cueAudible,
  registerCachedSample,
  type SampleCue,
} from '../src/game/sample-audio';

function context() {
  const sources: { start: ReturnType<typeof vi.fn> }[] = [];
  return {
    sources,
    ctx: {
      currentTime: 0,
      state: 'running',
      destination: {},
      decodeAudioData: vi.fn(async () => ({ duration: 2 })),
      createBufferSource: () => {
        const s = {
          playbackRate: { value: 1 },
          connect: vi.fn(),
          disconnect: vi.fn(),
          start: vi.fn(),
          stop: vi.fn(),
          onended: null,
        };
        sources.push(s);
        return s;
      },
      createGain: () => ({ gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() }),
    },
  };
}

it('skips a sample whose download failed instead of throwing in the loader callback', () => {
  const { ctx } = context();
  const samples = new SampleAudio(() => ctx as unknown as AudioContext);
  const cache = new Map<string, unknown>([['present', new ArrayBuffer(4)]]);
  const scene = {
    cache: {
      binary: {
        exists: (key: string) => cache.has(key),
        get: (key: string) => cache.get(key),
      },
    },
  };
  expect(registerCachedSample(scene, samples, 'missing')).toBe(false);
  expect(registerCachedSample(scene, samples, 'present')).toBe(true);
  // A missing or corrupt entry that reaches register directly is ignored too.
  expect(() => samples.register('undefined', undefined)).not.toThrow();
  expect(samples.register('text', 'not audio')).toBe(false);
  expect(() => samples.decode()).not.toThrow();
  expect(ctx.decodeAudioData).toHaveBeenCalledTimes(1);
});

it('caps concurrent voices per sample and in total', async () => {
  const { ctx, sources } = context();
  const samples = new SampleAudio(() => ctx as unknown as AudioContext);
  for (let s = 0; s < 12; s++) samples.register(`s${s}`, new ArrayBuffer(4));
  await Promise.resolve();
  await Promise.resolve();
  const cue = (sample: string, i: number): SampleCue => ({
    key: `${sample}:${i}`,
    sample,
    at: 1,
    volume: 1,
    pitch: 1,
  });
  samples.sync(
    Array.from({ length: 10 }, (_, i) => cue('s0', i)),
    1.1,
    1,
    true,
  );
  expect(sources).toHaveLength(MAX_VOICES_PER_SAMPLE);
  const many: SampleCue[] = [];
  for (let s = 1; s < 12; s++) for (let i = 0; i < 4; i++) many.push(cue(`s${s}`, i));
  samples.sync([...Array.from({ length: 10 }, (_, i) => cue('s0', i)), ...many], 1.1, 1, true);
  expect(sources).toHaveLength(MAX_VOICES);
});

it('treats one-shot cues older than the horizon as silent', () => {
  expect(cueAudible(10, 12)).toBe(true);
  expect(cueAudible(10, 25)).toBe(false);
});
