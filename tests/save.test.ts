import { it, expect, vi, afterEach } from 'vitest';
import { IDBFactory, IDBDatabase as FakeIDBDatabase } from 'fake-indexeddb';
import { GameModel, initialSave } from '../src/game/model';
import { loadSave, saveGame, SaveRecoveryError, validateSave } from '../src/game/save';
import { overfullArmyVillage } from './fixtures/legacy-army-village';
afterEach(() => vi.unstubAllGlobals());
async function replayStorage(rejectPendingBackup = false) {
  const local = new Map<string, string>();
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => local.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (rejectPendingBackup && value.includes('"steps"')) throw Error('QuotaExceededError');
      local.set(key, value);
    },
  });
  await loadSave();
  return { local, backup: () => JSON.parse(local.get('crown-clan-save-v1') ?? 'null') };
}
function recordedVillage() {
  const model = new GameModel();
  model.state.spells.lightning = 1;
  model.startBattle(0, true);
  model.activeSpell = 'lightning';
  expect(model.castSpell(10, 10)).toBe(true);
  model.step(0.05);
  model.finishBattle();
  model.returnHome();
  expect(model.state.raidLog![0].replay).toBeDefined();
  return model.state;
}

it('backs up a fresh recording before yielding and removes its inline copy after durable commit', async () => {
  const { backup } = await replayStorage(),
    state = recordedVillage();
  const pending = saveGame(state);
  // Reload/pagehide can happen before the IndexedDB transaction completes.
  try {
    expect(backup().raidLog[0].replay).toEqual(state.raidLog![0].replay);
    expect(validateSave(backup())).toBe(true);
  } finally {
    await pending;
  }
  expect(await pending).toBe(true);
  expect(backup().raidLog[0].replay).toBeUndefined();
  expect((await loadSave())!.raidLog![0].replay).toEqual(state.raidLog![0].replay);
});

it('does not let an older commit discard the newer pending-recording backup', async () => {
  const { backup } = await replayStorage(),
    first = recordedVillage(),
    next = structuredClone(first);
  first.gold = 111;
  next.gold = 222;
  const older = saveGame(first),
    newer = saveGame(next);
  try {
    expect(backup().gold).toBe(222);
    expect(backup().raidLog[0].replay).toBeDefined();
    await older;
    expect(backup().gold).toBe(222);
    expect(backup().saveRevision).toBe(next.saveRevision);
    expect(backup().raidLog[0].replay).toBeDefined();
    await newer;
    expect(backup().gold).toBe(222);
    expect(backup().raidLog[0].replay).toBeUndefined();
  } finally {
    await Promise.all([older, newer]);
  }
  const loaded = (await loadSave())!;
  expect(loaded.gold).toBe(222);
  expect(loaded.raidLog![0].replay).toEqual(next.raidLog![0].replay);
});

it('recovers the pending recording from the local backup when IndexedDB transactions fail', async () => {
  const { backup } = await replayStorage(),
    state = recordedVillage();
  const transaction = vi.spyOn(FakeIDBDatabase.prototype, 'transaction').mockImplementation(() => {
    throw Error('IndexedDB unavailable');
  });
  try {
    expect(await saveGame(state)).toBe(true);
    expect(backup().raidLog[0].replay).toEqual(state.raidLog![0].replay);
    const loaded = (await loadSave())!;
    expect(loaded.raidLog![0].replay).toEqual(state.raidLog![0].replay);
    expect(validateSave(loaded)).toBe(true);
  } finally {
    transaction.mockRestore();
  }
});

it('keeps the small village backup and IndexedDB recording when the pending backup exceeds quota', async () => {
  const { backup } = await replayStorage(true),
    state = recordedVillage();
  expect(await saveGame(state)).toBe(true);
  expect(backup().raidLog[0].replay).toBeUndefined();
  expect(validateSave(backup())).toBe(true);
  expect((await loadSave())!.raidLog![0].replay).toEqual(state.raidLog![0].replay);
});
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
it('keeps recordings out of the village snapshot and stores each one once', async () => {
  const factory = new IDBFactory();
  vi.stubGlobal('indexedDB', factory);
  const local = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => local.get(key) ?? null,
    setItem: (key: string, value: string) => local.set(key, value),
  });
  await loadSave();
  const m = new GameModel();
  m.state.spells.lightning = 2;
  for (let i = 0; i < 2; i++) {
    m.startBattle(0, true);
    m.activeSpell = 'lightning';
    m.castSpell(10, 10);
    m.step(0.05);
    m.finishBattle();
    m.returnHome();
  }
  expect(m.state.raidLog!.filter((r) => r.replay)).toHaveLength(2);
  expect(await saveGame(m.state)).toBe(true);
  // Neither store's village carries a recording; the backup stays small.
  expect(local.get('crown-clan-save-v1')).not.toContain('"steps"');
  const keys = async () =>
    new Promise<IDBValidKey[]>((resolve) => {
      const request = factory.open('crown-and-clan', 1);
      request.onsuccess = () => {
        const req = request.result.transaction('saves').objectStore('saves').getAllKeys();
        req.onsuccess = () => {
          request.result.close();
          resolve(req.result);
        };
      };
    });
  expect((await keys()).filter((k) => String(k).startsWith('replay:'))).toHaveLength(2);
  // Loading attaches them again, identical to what was recorded.
  const loaded = await loadSave();
  expect(loaded!.raidLog!.map((r) => r.replay)).toEqual(m.state.raidLog!.map((r) => r.replay));
  expect(validateSave(loaded)).toBe(true);
  // A recording that leaves the log leaves the store with it.
  m.state.raidLog = m.state.raidLog!.slice(0, 1);
  await saveGame(m.state);
  expect((await keys()).filter((k) => String(k).startsWith('replay:'))).toHaveLength(1);
});
