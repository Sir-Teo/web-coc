import { it, expect, vi, afterEach } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { initialSave } from '../src/game/model';
import { loadSave } from '../src/game/save';
afterEach(() => vi.unstubAllGlobals());
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
