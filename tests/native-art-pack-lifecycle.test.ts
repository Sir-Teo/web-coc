import { afterEach, expect, it, vi } from 'vitest';
import type Phaser from 'phaser';
import { NativeArtPacks, nativePackPrefix } from '../src/game/native-art-pack';
import { nativeMeshTexture, type NativeMeshGraph } from '../src/game/native-mesh';

const path = 'assets/example-native/graph.json';
const key = (id = 0) => nativeMeshTexture(nativePackPrefix(path, 'buildings'), String(id));
type Pack = { scenes: Record<string, NativeMeshGraph> };
type Reply = { ok: boolean; status: number; json(): Promise<Pack> };
const disposables: NativeArtPacks<Pack>[] = [];

afterEach(() => {
  for (const packs of disposables.splice(0)) packs.destroy();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function world(count = 1) {
  const textures = new Map<string, object>();
  const manager = {
    exists: (key: string) => textures.has(key),
    get: (key: string) => textures.get(key),
    addImage: vi.fn((key: string) => {
      textures.set(key, { key });
    }),
    remove: vi.fn((key: string) => {
      textures.delete(key);
    }),
  };
  const scene = { textures: manager } as unknown as Phaser.Scene;
  const pack: Pack = {
    scenes: {
      buildings: {
        exports: {},
        shapes: {},
        clips: {},
        matrices: [],
        colors: [],
        textures: Object.fromEntries(
          Array.from({ length: count }, (_, id) => [
            String(id),
            {
              path: `assets/example-native/page-${id}.png`,
              width: 16,
              height: 16,
            },
          ]),
        ),
      },
    },
  };
  const reply: Reply = { ok: true, status: 200, json: async () => pack };
  const fetcher = vi.fn<() => Promise<Reply>>(async () => reply);
  const images: string[] = [];
  const control: { decode(src: string): Promise<void> } = { decode: async () => {} };
  const online = new EventTarget();
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.stubGlobal('window', online);
  vi.stubGlobal('fetch', fetcher);
  vi.stubGlobal(
    'Image',
    class {
      src = '';
      decode() {
        images.push(this.src);
        return control.decode(this.src);
      }
    },
  );
  const create = () => {
    const packs = new NativeArtPacks<Pack>(scene);
    disposables.push(packs);
    return packs;
  };
  const ready = (packs: NativeArtPacks<Pack>) =>
    vi.waitFor(() => expect(packs.get(path)).toEqual(pack));
  return {
    textures,
    manager,
    pack,
    reply,
    fetcher,
    images,
    control,
    online,
    errors,
    create,
    ready,
  };
}

it('releases completed pack textures and refuses new loads after destruction', async () => {
  const w = world(2);
  const packs = w.create();
  packs.get(path);
  await w.ready(packs);
  expect(w.textures.size).toBe(2);
  packs.destroy();
  packs.destroy();
  expect(w.textures.size).toBe(0);
  expect(w.manager.remove).toHaveBeenCalledTimes(2);
  expect(packs.get(path)).toBeUndefined();
  expect(w.fetcher).toHaveBeenCalledTimes(1);
});

it('keeps shared textures until their last live loader releases them', async () => {
  const w = world();
  const first = w.create();
  const second = w.create();
  first.get(path);
  second.get(path);
  await Promise.all([w.ready(first), w.ready(second)]);
  expect(w.manager.addImage).toHaveBeenCalledTimes(1);
  first.destroy();
  expect(w.textures.has(key())).toBe(true);
  expect(second.get(path)).toEqual(w.pack);
  second.destroy();
  expect(w.textures.size).toBe(0);
  expect(w.manager.remove).toHaveBeenCalledTimes(1);
});

it('preserves textures registered outside the pack loaders', async () => {
  const w = world();
  const external = {};
  w.textures.set(key(), external);
  const packs = w.create();
  packs.get(path);
  await w.ready(packs);
  expect(w.images).toHaveLength(0);
  packs.destroy();
  expect(w.textures.get(key())).toBe(external);
  expect(w.manager.remove).not.toHaveBeenCalled();
});

it('cleans failed partial uploads, ignores late decodes and retries after reconnect', async () => {
  const w = world(3);
  const pages = [deferred<void>(), deferred<void>(), deferred<void>()];
  w.control.decode = (src) => pages[Number(/page-(\d+)/.exec(src)![1])].promise;
  const packs = w.create();
  packs.get(path);
  await vi.waitFor(() => expect(w.images).toHaveLength(3));
  pages[0].resolve();
  await vi.waitFor(() => expect(w.textures.has(key())).toBe(true));
  pages[1].reject(Error('Image unavailable'));
  await vi.waitFor(() => expect(packs.unavailable(path)).toBe(true));
  expect(w.textures.size).toBe(0);
  pages[2].resolve();
  await flush();
  expect(w.textures.size).toBe(0);
  expect(packs.get(path)).toBeUndefined();
  expect(w.fetcher).toHaveBeenCalledTimes(1);
  w.control.decode = async () => {};
  w.online.dispatchEvent(new Event('online'));
  packs.get(path);
  await w.ready(packs);
  expect(packs.unavailable(path)).toBe(false);
  expect(w.fetcher).toHaveBeenCalledTimes(2);
  expect(w.textures.size).toBe(3);
  expect(w.errors).toHaveBeenCalledTimes(1);
});

it('does not decode images when metadata finishes after destruction', async () => {
  const w = world();
  const response = deferred<Reply>();
  w.fetcher.mockReturnValueOnce(response.promise);
  const packs = w.create();
  packs.get(path);
  packs.destroy();
  response.resolve(w.reply);
  await flush();
  expect(w.images).toHaveLength(0);
  expect(w.textures.size).toBe(0);
  expect(packs.get(path)).toBeUndefined();
});

it('does not register a decoded page after destruction', async () => {
  const w = world();
  const page = deferred<void>();
  w.control.decode = () => page.promise;
  const packs = w.create();
  packs.get(path);
  await vi.waitFor(() => expect(w.images).toHaveLength(1));
  packs.destroy();
  page.resolve();
  await flush();
  expect(w.textures.size).toBe(0);
  expect(w.manager.addImage).not.toHaveBeenCalled();
});

it('ignores failures from obsolete requests after destruction', async () => {
  const w = world();
  const response = deferred<Reply>();
  w.fetcher.mockReturnValueOnce(response.promise);
  const packs = w.create();
  packs.get(path);
  packs.destroy();
  response.reject(Error('Obsolete request'));
  await flush();
  expect(packs.unavailable(path)).toBe(false);
  expect(w.errors).not.toHaveBeenCalled();
});

it('does not remove an externally replaced texture with the same key', async () => {
  const w = world();
  const packs = w.create();
  packs.get(path);
  await w.ready(packs);
  const replacement = {};
  w.textures.set(key(), replacement);
  packs.destroy();
  expect(w.textures.get(key())).toBe(replacement);
});

it('keeps a pack unavailable if the texture manager rejects registration', async () => {
  const w = world();
  w.manager.addImage.mockImplementation(() => {});
  const packs = w.create();
  packs.get(path);
  await vi.waitFor(() => expect(packs.unavailable(path)).toBe(true));
  expect(packs.get(path)).toBeUndefined();
  expect(w.textures.size).toBe(0);
});

it('invalidates a paused presentation only after every page of a pack is drawable', async () => {
  const w = world(),
    page = deferred<void>();
  w.control.decode = () => page.promise;
  const packs = w.create();
  expect(packs.revision).toBe(0);
  packs.get(path);
  await vi.waitFor(() => expect(w.images).toHaveLength(1));
  expect(packs.revision).toBe(0);
  page.resolve();
  await w.ready(packs);
  expect(packs.revision).toBe(1);
  packs.get(path);
  expect(packs.revision).toBe(1);
});
it('invalidates paused frames once when backoff expires and again after reconnecting or loading', async () => {
  let now = 1000;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  const w = world();
  w.fetcher.mockResolvedValueOnce({ ok: false, status: 503, json: async () => w.pack });
  const packs = w.create();
  packs.get(path);
  await vi.waitFor(() => expect(packs.unavailable(path)).toBe(true));
  expect(packs.revision).toBe(0);
  now = 5999;
  expect(packs.revision).toBe(0);
  now = 6000;
  expect(packs.revision).toBe(1);
  expect(packs.revision).toBe(1);
  w.online.dispatchEvent(new Event('online'));
  expect(packs.revision).toBe(2);
  await w.ready(packs);
  expect(packs.revision).toBe(3);
  expect(w.fetcher).toHaveBeenCalledTimes(2);
});
