import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  DESTROYED_EFFECT,
  TROOP_SOUNDS,
  TroopSoundLoader,
  effectSoundFiles,
  troopSample,
} from '../src/game/troop-sounds';

const activation = 'rc_gear_frostblast_snowflack_active';
const target = effectSoundFiles(activation)[0];
const url = '/' + TROOP_SOUNDS[target as keyof typeof TROOP_SOUNDS].path;
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));
let now = 0;
const response = (ok = true) =>
  ({ ok, status: ok ? 200 : 503, arrayBuffer: async () => new ArrayBuffer(2) }) as Response;

beforeEach(() => {
  now = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it.each(['http', 'network', 'body'] as const)(
  'retries a failed %s request after five seconds, without re-fetching successful samples',
  async (failure) => {
    let blocked = true;
    const fetcher = vi.fn(async (path: string) => {
      if (path === url && blocked) {
        if (failure === 'network') throw Error('offline');
        if (failure === 'body')
          return {
            ...response(),
            arrayBuffer: async () => {
              throw Error('interrupted body');
            },
          };
        return response(false);
      }
      return response();
    });
    vi.stubGlobal('fetch', fetcher);
    const register = vi.fn();
    const loader = new TroopSoundLoader(register);
    loader.need([], [], [activation]);
    await settle();
    const initial = fetcher.mock.calls.length;
    expect(register).not.toHaveBeenCalledWith(troopSample(target), expect.anything());
    blocked = false;
    for (now = 0; now < 5000; now += 50) {
      loader.need([], [], [activation]);
      loader.retry();
    }
    await settle();
    expect(fetcher).toHaveBeenCalledTimes(initial);
    now = 5000;
    loader.retry();
    await settle();
    expect(fetcher).toHaveBeenCalledTimes(initial + 1);
    expect(register).toHaveBeenCalledWith(troopSample(target), expect.any(ArrayBuffer));
    now = 500000;
    loader.retry();
    loader.need([], [], [activation]);
    await settle();
    expect(fetcher).toHaveBeenCalledTimes(initial + 1);
    expect(initial).toBe(
      new Set([...effectSoundFiles(activation), ...effectSoundFiles(DESTROYED_EFFECT)]).size,
    );
  },
);

it('backs repeated failures off to five minutes and lets reconnect retry immediately', async () => {
  const fetcher = vi.fn(async (path: string) => response(path !== url));
  vi.stubGlobal('fetch', fetcher);
  const loader = new TroopSoundLoader(() => {});
  loader.need([], [], [activation]);
  await settle();
  const attempts = () => fetcher.mock.calls.filter(([path]) => path === url).length;
  for (const delay of [5000, 10000, 20000, 40000, 80000, 160000, 300000, 300000]) {
    const before = attempts();
    now += delay - 1;
    loader.retry();
    await settle();
    expect(attempts()).toBe(before);
    now++;
    loader.retry();
    await settle();
    expect(attempts()).toBe(before + 1);
  }
  const before = attempts();
  loader.retry(true);
  await settle();
  expect(attempts()).toBe(before + 1);
  loader.retry();
  await settle();
  expect(attempts()).toBe(before + 1);
});

it('deduplicates pending requests even across reconnects and roster updates', async () => {
  let finish: (value: Response) => void;
  const fetcher = vi.fn((path: string) =>
    path === url
      ? new Promise<Response>((resolve) => {
          finish = resolve;
        })
      : Promise.resolve(response()),
  );
  vi.stubGlobal('fetch', fetcher);
  const register = vi.fn();
  const loader = new TroopSoundLoader(register);
  loader.need([], [], [activation]);
  await settle();
  const initial = fetcher.mock.calls.length;
  for (let i = 0; i < 10; i++) {
    loader.need([], [], [activation]);
    loader.retry(true);
  }
  expect(fetcher).toHaveBeenCalledTimes(initial);
  finish!(response());
  await settle();
  expect(register.mock.calls.filter(([name]) => name === troopSample(target))).toHaveLength(1);
});

it('retries only samples still wanted by the current battle', async () => {
  let blocked = true;
  const fetcher = vi.fn(async (path: string) => response(path !== url || !blocked));
  vi.stubGlobal('fetch', fetcher);
  const register = vi.fn();
  const loader = new TroopSoundLoader(register);
  loader.need([], [], [activation]);
  await settle();
  loader.need(['swordsman']);
  await settle();
  const initial = fetcher.mock.calls.filter(([path]) => path === url).length;
  blocked = false;
  now = 10000;
  loader.retry();
  loader.retry(true);
  await settle();
  expect(fetcher.mock.calls.filter(([path]) => path === url)).toHaveLength(initial);
  loader.need([], [], [activation]);
  await settle();
  expect(fetcher.mock.calls.filter(([path]) => path === url)).toHaveLength(initial + 1);
  expect(register).toHaveBeenCalledWith(troopSample(target), expect.any(ArrayBuffer));
});
