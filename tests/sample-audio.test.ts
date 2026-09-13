import { expect, it, vi } from 'vitest';
import { SampleAudio, type SampleCue } from '../src/game/sample-audio';

function audio() {
  const sources: any[] = [],
    gains: any[] = [];
  const context = {
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
        onended: null as null | (() => void),
      };
      sources.push(s);
      return s;
    },
    createGain: () => {
      const g = { gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() };
      gains.push(g);
      return g;
    },
  };
  let unlocked = false;
  const samples = new SampleAudio(() => (unlocked ? (context as unknown as AudioContext) : null));
  const cue: SampleCue = { key: 'call', sample: 'native', at: 1, volume: 0.8, pitch: 0.5 };
  samples.register('native', new ArrayBuffer(4));
  const unlock = async () => {
    unlocked = true;
    samples.decode();
    await Promise.resolve();
  };
  return { samples, context, sources, gains, cue, unlock };
}
it('waits for an audio gesture, decodes each sample once, and resumes at its battle-time offset', async () => {
  const { samples, context, sources, gains, cue, unlock } = audio();
  samples.sync([cue], 2, 1, true);
  expect(context.decodeAudioData).not.toHaveBeenCalled();
  await unlock();
  samples.sync([cue], 2, 1, true);
  expect(sources).toHaveLength(1);
  expect(sources[0].start).toHaveBeenCalledWith(0, 0.5);
  expect(sources[0].playbackRate.value).toBe(0.5);
  expect(gains[0].gain.value).toBe(0.8 * 0.12);
  context.currentTime = 0.05;
  samples.sync([cue], 2.05, 1, true);
  expect(context.decodeAudioData).toHaveBeenCalledTimes(1);
  expect(sources).toHaveLength(1);
});
it('changes playback speed without duplicating a cue and stops every node on pause or mute', async () => {
  const { samples, context, sources, gains, cue, unlock } = audio();
  await unlock();
  samples.sync([cue], 1, 1, true);
  context.currentTime = 0.1;
  samples.sync([cue], 1.1, 4, true);
  expect(sources).toHaveLength(1);
  expect(sources[0].playbackRate.value).toBe(2);
  samples.sync([cue], 1.1, 4, false);
  expect(sources[0].stop).toHaveBeenCalledOnce();
  expect(gains[0].disconnect).toHaveBeenCalledOnce();
  samples.sync([cue], 1.1, 2, true);
  expect(sources).toHaveLength(2);
  expect(sources[1].start).toHaveBeenCalledWith(0, expect.closeTo(0.05, 10));
  context.state = 'suspended';
  samples.sync([cue], 1.1, 2, true);
  expect(sources[1].stop).toHaveBeenCalledOnce();
});
it('seeking rebuilds active offsets, silences future or expired cues, and ignores stale end callbacks', async () => {
  const { samples, context, sources, cue, unlock } = audio();
  await unlock();
  samples.sync([cue], 2, 1, true);
  const first = sources[0];
  context.currentTime = 0.1;
  samples.sync([cue], 3, 1, true);
  expect(first.stop).toHaveBeenCalledOnce();
  expect(sources[1].start).toHaveBeenCalledWith(0, 1);
  first.onended();
  samples.sync([cue], 3, 1, true);
  expect(sources).toHaveLength(2);
  samples.sync([cue], 0, 1, true);
  expect(sources[1].stop).toHaveBeenCalledOnce();
  samples.sync([cue], 6, 1, true);
  expect(sources).toHaveLength(2);
  samples.sync([cue], 1, 1, true);
  expect(sources).toHaveLength(3);
});
it('does not replay a naturally completed tail before the next fixed simulation tick', async () => {
  const { samples, context, sources, cue, unlock } = audio();
  await unlock();
  samples.sync([cue], 4.95, 1, true);
  sources[0].onended();
  context.currentTime = 0.016;
  samples.sync([cue], 4.95, 1, true);
  expect(sources).toHaveLength(1);
  samples.sync([cue], 5, 1, true);
  samples.sync([cue], 1, 1, true);
  expect(sources).toHaveLength(2);
});
it('supports simultaneous gift impacts and tears down cues when their battle disappears', async () => {
  const { samples, sources, cue, unlock } = audio();
  await unlock();
  samples.sync([cue, { ...cue, key: 'second' }], 1, 1, true);
  expect(sources).toHaveLength(2);
  samples.sync([], 1, 1, true);
  expect(sources.every((s) => s.stop.mock.calls.length === 1)).toBe(true);
  samples.stop();
  expect(sources.every((s) => s.stop.mock.calls.length === 1)).toBe(true);
});
it('does not play old cues when decoding finishes late', async () => {
  const { samples, sources, cue, unlock } = audio();
  await unlock();
  samples.sync([cue], 10, 1, true);
  expect(sources).toHaveLength(0);
});

it('loops native samples past their duration and resumes seeks at a wrapped offset', async () => {
  const { samples, context, sources, gains, cue, unlock } = audio();
  await unlock();
  const loop = { ...cue, loop: true, at: 0, pitch: 1 };
  samples.sync([loop], 5.25, 1, true);
  expect(sources[0].loop).toBe(true);
  expect(sources[0].start).toHaveBeenCalledWith(0, 1.25);
  context.currentTime = 0.1;
  samples.sync([{ ...loop, volume: 0.4 }], 5.35, 2, true);
  expect(sources).toHaveLength(1);
  expect(sources[0].playbackRate.value).toBe(2);
  expect(gains[0].gain.value).toBe(0.4 * 0.12);
  samples.sync([], 5.35, 2, true);
  expect(sources[0].stop).toHaveBeenCalledOnce();
  expect(sources[0].disconnect).toHaveBeenCalled();
});
