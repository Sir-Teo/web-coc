import { it, expect, vi, afterEach } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { initialSave } from '../src/game/model';
import { loadSave, saveGame, SaveRecoveryError } from '../src/game/save';
import { overfullArmyVillage } from './fixtures/legacy-army-village';
afterEach(() => vi.unstubAllGlobals());
async function storePrimary(factory: IDBFactory, save: unknown) {
  await new Promise<void>((resolve, reject) => {
    const request = factory.open('crown-and-clan', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('saves');
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('saves', 'readwrite');
      tx.objectStore('saves').put(save, 'village');
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    };
  });
}
it.each([false, true])(
  'preserves a newer unplaceable historical save without rolling back progress (primary=%s)',
  async (primaryBlocked) => {
    const factory = new IDBFactory();
    const old = overfullArmyVillage();
    const current = initialSave();
    current.lastTick = old.lastTick - 10000;
    const primary = primaryBlocked ? old : current;
    const backup = primaryBlocked ? current : old;
    vi.stubGlobal('indexedDB', factory);
    vi.stubGlobal('localStorage', { getItem: () => JSON.stringify(backup) });
    await storePrimary(factory, primary);
    const error = await loadSave().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SaveRecoveryError);
    const copies = (error as SaveRecoveryError).copies;
    expect(JSON.parse(copies.find((c) => c.source === 'primary')!.text)).toEqual(primary);
    expect(JSON.parse(copies.find((c) => c.source === 'backup')!.text)).toEqual(backup);
  },
);
it('loads a newer usable save even when an older store cannot migrate', async () => {
  const factory = new IDBFactory();
  const old = overfullArmyVillage();
  const current = initialSave();
  current.lastTick = old.lastTick + 10000;
  vi.stubGlobal('indexedDB', factory);
  vi.stubGlobal('localStorage', { getItem: () => JSON.stringify(old) });
  await storePrimary(factory, current);
  expect(await loadSave()).toEqual(current);
});
it('keeps unreadable stored data available for recovery instead of starting a fresh village', async () => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('localStorage', { getItem: () => '{broken' });
  const error = await loadSave().catch((e: unknown) => e);
  expect(error).toBeInstanceOf(SaveRecoveryError);
  expect((error as SaveRecoveryError).copies).toEqual([{ source: 'backup', text: '{broken' }]);
});
it('starts a new village only when neither store contains a save', async () => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('localStorage', { getItem: () => null });
  expect(await loadSave()).toBeUndefined();
});
it('recovers a valid IndexedDB save when the local backup is corrupt', async () => {
  const factory = new IDBFactory();
  vi.stubGlobal('indexedDB', factory);
  vi.stubGlobal('localStorage', { getItem: () => '{broken' });
  const expected = initialSave();
  expected.gold = 87654;
  await new Promise<void>((resolve, reject) => {
    const request = factory.open('crown-and-clan', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('saves');
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('saves', 'readwrite');
      tx.objectStore('saves').put(expected, 'village');
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    };
  });
  expect((await loadSave())?.gold).toBe(87654);
});
it('recovers the local backup when IndexedDB is unavailable', async () => {
  const expected = initialSave();
  expected.gold = 65432;
  vi.stubGlobal('indexedDB', {
    open: () => {
      throw new Error('Unavailable');
    },
  });
  vi.stubGlobal('localStorage', { getItem: () => JSON.stringify(expected) });
  expect((await loadSave())?.gold).toBe(65432);
});
it('prefers the newer commit when both stores share an economy clock', async () => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  const local = new Map<string, string>();
  let localFails = false;
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => local.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (localFails) throw new Error('QuotaExceededError');
      local.set(key, value);
    },
  });
  expect(await loadSave()).toBeUndefined();
  const state = initialSave();
  state.gold = 100;
  expect(await saveGame(state)).toBe(true);
  // The next commit reaches IndexedDB only; lastTick has not moved.
  localFails = true;
  state.gold = 200;
  expect(await saveGame(state)).toBe(true);
  const loaded = await loadSave();
  expect(loaded?.gold).toBe(200);
  expect(loaded?.saveRevision).toBeGreaterThan(JSON.parse([...local.values()][0]).saveRevision);
});
it('keeps revisions increasing after an older backup is imported', async () => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  const local = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => local.get(key) ?? null,
    setItem: (key: string, value: string) => local.set(key, value),
  });
  await loadSave();
  const current = initialSave();
  for (let i = 0; i < 3; i++) await saveGame(current);
  // A backup exported long ago carries a low revision of its own.
  const imported = { ...initialSave(), gold: 4242, saveRevision: 1 };
  await saveGame(imported);
  expect(imported.saveRevision).toBeGreaterThan(current.saveRevision!);
  expect((await loadSave())?.gold).toBe(4242);
});
