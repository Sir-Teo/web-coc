import { describe, expect, it } from 'vitest';
import { LazyTextures } from '../src/game/lazy-textures';

/** A scene stand-in: a texture set and a loader with its queues and once/off events. */
function scene() {
  const textures = new Set<string>();
  const listeners = new Map<string, (() => void)[]>();
  const load = {
    list: new Set<{ key: string; type: string }>(),
    inflight: new Set<{ key: string; type: string }>(),
    queue: new Set<{ key: string; type: string }>(),
    once(event: string, fn: () => void) {
      listeners.set(event, [...(listeners.get(event) ?? []), fn]);
    },
    off(event: string, fn: () => void) {
      listeners.set(
        event,
        (listeners.get(event) ?? []).filter((f) => f !== fn),
      );
    },
    emit(event: string) {
      const fns = listeners.get(event) ?? [];
      listeners.delete(event);
      for (const fn of fns) fn();
    },
  };
  const added: string[] = [];
  return {
    textures: {
      exists: (key: string) => textures.has(key),
      addImage: (key: string) => {
        added.push(key);
        textures.add(key);
      },
    },
    load,
    set: textures,
    added,
  };
}

describe('LazyTextures', () => {
  it('waits for a loader batch already fetching a key instead of adding it twice', async () => {
    const s = scene();
    const lazy = new LazyTextures(s as never);
    s.load.inflight.add({ key: 'cannon-level-2', type: 'image' });
    const job = lazy.request('cannon-level-2', '/c2.png');
    expect(lazy.loading('cannon-level-2')).toBe(true);
    // The batch finishes the file and adds the texture itself.
    s.set.add('cannon-level-2');
    s.load.emit('filecomplete-image-cannon-level-2');
    await job;
    expect(s.added).toEqual([]);
    expect(lazy.loading('cannon-level-2')).toBe(false);
    expect(lazy.revision).toBe(1);
    expect(lazy.has('cannon-level-2', '/c2.png')).toBe(true);
  });

  it('settles when the batch ends without the file', async () => {
    const s = scene();
    const lazy = new LazyTextures(s as never);
    s.load.queue.add({ key: 'wall-3', type: 'image' });
    const job = lazy.request('wall-3', '/w3.png');
    s.load.emit('complete');
    await job;
    expect(lazy.revision).toBe(0);
    expect(lazy.loading('wall-3')).toBe(false);
  });
});
