import { expect, it, vi } from 'vitest';
import { SampleAudio } from '../src/game/sample-audio';

const settle = () => new Promise<void>((resolve) => setImmediate(resolve));
const data = (value: number) => new Uint8Array([value]).buffer;
const buffer = { duration: 1 } as AudioBuffer;
const samplesWith = (decodeAudioData: (bytes: ArrayBuffer) => Promise<AudioBuffer>) =>
  new SampleAudio(() => ({ decodeAudioData }) as unknown as AudioContext);

function deferred() {
  let resolve!: (buffer: AudioBuffer) => void, reject!: (error: Error) => void;
  const promise = new Promise<AudioBuffer>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

it('quarantines rejected bytes without spinning, then decodes a fresh registration', async () => {
  const decode = vi
    .fn<(bytes: ArrayBuffer) => Promise<AudioBuffer>>()
    .mockRejectedValueOnce(Error('invalid Ogg'))
    .mockResolvedValue(buffer);
  const samples = samplesWith(decode);
  samples.register('native', data(0));
  await settle();
  for (let frame = 0; frame < 100; frame++) samples.decode();
  await settle();
  expect(decode).toHaveBeenCalledTimes(1);
  expect(samples.has('native')).toBe(false);
  samples.register('native', data(1));
  await settle();
  expect(decode).toHaveBeenCalledTimes(2);
  expect(samples.has('native')).toBe(true);
});

it('contains a synchronous decoder failure and accepts a later valid sample', async () => {
  const decode = vi
    .fn<(bytes: ArrayBuffer) => Promise<AudioBuffer>>()
    .mockImplementationOnce(() => {
      throw Error('decoder unavailable');
    })
    .mockResolvedValue(buffer);
  const samples = samplesWith(decode);
  expect(() => samples.register('native', data(0))).not.toThrow();
  for (let frame = 0; frame < 10; frame++) samples.decode();
  expect(decode).toHaveBeenCalledTimes(1);
  samples.register('native', data(1));
  await settle();
  expect(samples.has('native')).toBe(true);
  expect(decode).toHaveBeenCalledTimes(2);
});

it.each(['success', 'failure'] as const)(
  'a stale pending %s cannot replace or discard newer bytes',
  async (outcome) => {
    const old = deferred(),
      replacement = deferred();
    const decode = vi
      .fn<(bytes: ArrayBuffer) => Promise<AudioBuffer>>()
      .mockReturnValueOnce(old.promise)
      .mockReturnValueOnce(replacement.promise);
    const samples = samplesWith(decode);
    samples.register('native', data(0));
    samples.register('native', data(1));
    expect(decode).toHaveBeenCalledTimes(1);
    if (outcome === 'success') old.resolve({ duration: 99 } as AudioBuffer);
    else old.reject(Error('invalid old sample'));
    await settle();
    expect(samples.has('native')).toBe(false);
    expect(decode).toHaveBeenCalledTimes(2);
    expect(new Uint8Array(decode.mock.calls[1][0])).toEqual(new Uint8Array([1]));
    replacement.resolve(buffer);
    await settle();
    expect(samples.has('native')).toBe(true);
  },
);

it('keeps successfully decoded samples when repeated rosters register their bytes again', async () => {
  const decode = vi.fn(async (_bytes: ArrayBuffer) => buffer);
  const samples = samplesWith(decode);
  samples.register('native', data(1));
  await settle();
  for (let frame = 0; frame < 100; frame++) {
    samples.register('native', data(1));
    samples.decode();
  }
  await settle();
  expect(samples.has('native')).toBe(true);
  expect(decode).toHaveBeenCalledTimes(1);
});
