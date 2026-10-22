import { expect, it, vi } from 'vitest';
import {
  createRetryingImporter,
  isRetryableArtImportError,
  probeArtReload,
  requiresArtReload,
} from '../src/game/import-retry';

it('shares concurrent and successful imports across equivalent module URLs', async () => {
  const requests: string[] = [];
  const module = { value: 7 };
  const load = createRetryingImporter(async (url) => {
    requests.push(url);
    return module;
  });
  const first = load('./late.js', 'https://game.test/assets/main.js');
  const same = load('https://game.test/assets/late.js', 'https://game.test/other.js');
  expect(same).toBe(first);
  await expect(first).resolves.toBe(module);
  await expect(load('./late.js', 'https://game.test/assets/main.js')).resolves.toBe(module);
  expect(requests).toEqual(['https://game.test/assets/late.js']);
});

it('recovers a failed module with a fresh URL and keeps the successful retry warm', async () => {
  const requests: URL[] = [];
  const module = { ready: true };
  const load = createRetryingImporter(async (url) => {
    requests.push(new URL(url));
    if (requests.length === 1) throw Error('Temporary fetch failure');
    return module;
  });
  const parent = 'https://game.test/assets/main.js';
  const failed = load('./late.js?v=release', parent);
  expect(load('./late.js?v=release', parent)).toBe(failed);
  await expect(failed).rejects.toThrow('Temporary fetch failure');
  await expect(load('./late.js?v=release', parent)).resolves.toBe(module);
  await expect(load('./late.js?v=release', parent)).resolves.toBe(module);
  expect(requests).toHaveLength(2);
  expect(requests.map((url) => url.pathname)).toEqual(['/assets/late.js', '/assets/late.js']);
  expect(requests.map((url) => url.searchParams.get('v'))).toEqual(['release', 'release']);
  expect(requests.map((url) => url.searchParams.get('art-retry'))).toEqual([null, '1']);
});

it('gives repeated failures distinct module identities without losing the original fragment', async () => {
  const requests: URL[] = [];
  const load = createRetryingImporter(async (url) => {
    requests.push(new URL(url));
    if (requests.length < 3) throw Error('Offline');
    return 'recovered';
  });
  const parent = 'https://game.test/assets/main.js';
  await expect(load('./graphs.js#art', parent)).rejects.toThrow('Offline');
  await expect(load('./graphs.js#art', parent)).rejects.toThrow('Offline');
  await expect(load('./graphs.js#art', parent)).resolves.toBe('recovered');
  expect(requests.map((url) => url.searchParams.get('art-retry'))).toEqual([null, '1', '2']);
  expect(requests.map((url) => url.hash)).toEqual(['#art', '#art', '#art']);
});

it('identifies managed import failures without swallowing unrelated preload errors', async () => {
  const failure = new TypeError('Failed module fetch');
  const load = createRetryingImporter(async () => {
    throw failure;
  });
  await expect(load('./late.js', 'https://game.test/main.js')).rejects.toBe(failure);
  expect(isRetryableArtImportError(failure)).toBe(true);
  expect(isRetryableArtImportError(new TypeError('Another chunk failed'))).toBe(false);
  expect(isRetryableArtImportError(undefined)).toBe(false);
});

it.each([
  [404, 'text/html', true],
  [410, 'text/plain', true],
  [200, 'text/html; charset=utf-8', true],
  [200, 'application/javascript', false],
  [503, 'text/html', false],
])('classifies HTTP %i (%s) for the release reload path', (status, type, reload) => {
  expect(requiresArtReload(new Response(null, { status, headers: { 'content-type': type } }))).toBe(
    reload,
  );
});

it('continues retrying when the optional HTTP status probe stalls', async () => {
  vi.useFakeTimers();
  vi.stubGlobal(
    'fetch',
    (_url: string, options: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        options.signal!.addEventListener('abort', () => reject(new Error('Aborted')));
      }),
  );
  try {
    const result = probeArtReload('https://game.test/assets/late.js');
    await vi.advanceTimersByTimeAsync(1501);
    await expect(result).resolves.toBe(false);
  } finally {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  }
});
