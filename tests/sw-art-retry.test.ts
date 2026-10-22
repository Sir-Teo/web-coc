import { afterAll, beforeAll, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const code = 'export const ready = true;';
let directory: string;
let worker: string;
let manifest: string;
beforeAll(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'art-retry-worker-'));
  await fs.mkdir(path.join(directory, '.vite'));
  await fs.mkdir(path.join(directory, 'assets'));
  await fs.writeFile(path.join(directory, 'index.html'), '<html></html>');
  await fs.writeFile(path.join(directory, 'assets/main.js'), 'export {};');
  await fs.writeFile(path.join(directory, 'assets/late.js'), code);
  await fs.writeFile(
    path.join(directory, '.vite/manifest.json'),
    JSON.stringify({
      'main.ts': { file: 'assets/main.js', isEntry: true },
      'late.ts': { file: 'assets/late.js', isDynamicEntry: true },
    }),
  );
  await promisify(execFile)(process.execPath, ['scripts/build-sw.mjs', directory]);
  worker = await fs.readFile(path.join(directory, 'sw.js'), 'utf8');
  const name = (await fs.readdir(directory)).find((name) => name.startsWith('sw-manifest.'))!;
  manifest = await fs.readFile(path.join(directory, name), 'utf8');
});
afterAll(async () => {
  if (directory) await fs.rm(directory, { recursive: true, force: true });
});

function runtime(body = code) {
  const stored = new Map<string, Response>([['/__crown-sw-manifest', new Response(manifest)]]);
  const key = (request: string | { url: string }) => {
    const url = new URL(typeof request === 'string' ? request : request.url, 'https://game.test');
    return url.pathname + url.search;
  };
  const cache = {
    match: async (request: string | { url: string }) => stored.get(key(request))?.clone(),
    put: async (request: string, response: Response) => {
      stored.set(key(request), response.clone());
    },
  };
  const listeners = new Map<string, (event: unknown) => void>();
  let online = true;
  vm.runInNewContext(worker, {
    self: {
      location: new URL('https://game.test'),
      addEventListener: (type, handler) => listeners.set(type, handler),
    },
    caches: { open: async () => cache, match: cache.match },
    fetch: async () => {
      if (!online) throw Error('Offline');
      const response = new Response(body);
      Object.defineProperty(response, 'type', { value: 'basic' });
      return response;
    },
    URL,
    Response,
    Uint8Array,
    crypto: webcrypto,
  });
  return {
    stored,
    offline: () => {
      online = false;
    },
    async request(suffix: string) {
      let response: Promise<Response>;
      const pending: Promise<unknown>[] = [];
      listeners.get('fetch')!({
        request: {
          method: 'GET',
          url: 'https://game.test/assets/late.js' + suffix,
          mode: 'cors',
          headers: new Headers(),
        },
        respondWith: (value) => {
          response = value;
        },
        waitUntil: (value) => pending.push(value),
      });
      const result = await response!;
      await Promise.all(pending);
      return result;
    },
  };
}

it('stores a verified art retry under its canonical URL for the next offline visit', async () => {
  const worker = runtime();
  expect(await (await worker.request('?art-retry=1')).text()).toBe(code);
  expect(worker.stored.has('/assets/late.js')).toBe(true);
  worker.offline();
  expect(await (await worker.request('?art-retry=2')).text()).toBe(code);
  expect(await (await worker.request('')).text()).toBe(code);
});

it('never stores a retry response from another release or an HTML fallback', async () => {
  const worker = runtime('<html>New release</html>');
  await worker.request('?art-retry=2');
  expect(worker.stored.has('/assets/late.js')).toBe(false);
  worker.offline();
  await expect(worker.request('')).rejects.toThrow('Offline');
});

it.each(['?theme=dark', '?art-retry=1&variant=other', '?art-retry=invalid'])(
  'keeps unrelated or malformed query URLs out of the canonical cache (%s)',
  async (query) => {
    const worker = runtime();
    await worker.request(query);
    expect(worker.stored.has('/assets/late.js')).toBe(false);
  },
);
