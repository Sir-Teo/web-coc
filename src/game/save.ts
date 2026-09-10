import { BUILDINGS, TROOP_KEYS } from './data';
import { initialSave, type Save } from './model';
const KEY = 'crown-clan-save-v1';
function finite(v: unknown) {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0;
}
export function validateSave(input: unknown): input is Save {
  if (!input || typeof input !== 'object') return false;
  const s = input as Save;
  if (
    s.version !== 1 ||
    typeof s.tutorial !== 'boolean' ||
    !Number.isInteger(s.nextId) ||
    !['gold', 'elixir', 'gems', 'trophies', 'xp', 'lastTick', 'nextId'].every((k) =>
      finite(s[k as keyof Save]),
    ) ||
    !Array.isArray(s.buildings) ||
    s.buildings.length > 250 ||
    s.buildings.length === 0 ||
    !s.army ||
    !s.settings ||
    !s.stats ||
    !Array.isArray(s.queue) ||
    s.queue.length > 300 ||
    !Array.isArray(s.stars) ||
    s.stars.length !== 12
  )
    return false;
  if (
    !TROOP_KEYS.every((k) => Number.isInteger(s.army[k]) && s.army[k] >= 0 && s.army[k] < 10000) ||
    !s.stars.every((v) => Number.isInteger(v) && v >= 0 && v <= 3)
  )
    return false;
  if (
    !['sound', 'music', 'reducedMotion'].every(
      (k) => typeof s.settings[k as keyof Save['settings']] === 'boolean',
    ) ||
    !['raids', 'destroyed', 'collected'].every((k) => finite(s.stats[k as keyof Save['stats']]))
  )
    return false;
  if (
    s.claimedQuests !== undefined &&
    (!Array.isArray(s.claimedQuests) ||
      s.claimedQuests.length > 4 ||
      s.claimedQuests.some(
        (q) => !['gold-rush', 'first-raid', 'wall-breaker', 'valley-explorer'].includes(q),
      ) ||
      new Set(s.claimedQuests).size !== s.claimedQuests.length)
  )
    return false;
  const armyRecord = (value: unknown) =>
    value !== null &&
    typeof value === 'object' &&
    TROOP_KEYS.every(
      (k) =>
        Number.isInteger((value as Record<string, number>)[k]) &&
        (value as Record<string, number>)[k] >= 0 &&
        (value as Record<string, number>)[k] < 10000,
    );
  if (
    s.troopLevels !== undefined &&
    (!armyRecord(s.troopLevels) ||
      TROOP_KEYS.some((k) => s.troopLevels![k] < 1 || s.troopLevels![k] > 3))
  )
    return false;
  if (s.lastArmy !== undefined && !armyRecord(s.lastArmy)) return false;
  if (
    s.research !== undefined &&
    (!s.research ||
      !TROOP_KEYS.includes(s.research.kind) ||
      !finite(s.research.end) ||
      (s.troopLevels?.[s.research.kind] ?? 1) >= 3)
  )
    return false;
  const ids = new Set<number>();
  for (const b of s.buildings) {
    if (
      !b ||
      !Object.hasOwn(BUILDINGS, b.kind) ||
      !Number.isInteger(b.id) ||
      b.id < 1 ||
      ids.has(b.id) ||
      !Number.isInteger(b.x) ||
      !Number.isInteger(b.y) ||
      b.x < 0 ||
      b.y < 0 ||
      b.x + BUILDINGS[b.kind].size > 28 ||
      b.y + BUILDINGS[b.kind].size > 28 ||
      !Number.isInteger(b.level) ||
      b.level < 1 ||
      b.level > 3 ||
      !finite(b.hp) ||
      !finite(b.maxHp) ||
      !finite(b.stored) ||
      !finite(b.cooldown) ||
      (b.upgradeEnd !== undefined && !finite(b.upgradeEnd))
    )
      return false;
    ids.add(b.id);
  }
  return (
    s.buildings.some((b) => b.kind === 'townhall') &&
    s.buildings.some((b) => b.kind === 'builder') &&
    s.nextId > Math.max(...ids) &&
    s.queue.every((q) => q && TROOP_KEYS.includes(q.kind) && finite(q.end))
  );
}
let db: IDBDatabase | null = null;
export async function loadSave(): Promise<Save | undefined> {
  // Read stores independently: a corrupt backup must not hide a healthy primary save.
  let backup: unknown;
  let primary: unknown;
  try {
    backup = JSON.parse(localStorage.getItem(KEY) || 'null');
  } catch {
    /* Try IndexedDB. */
  }
  try {
    db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('crown-and-clan', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('saves');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('Save database is blocked by another tab'));
    });
    primary = await new Promise<unknown>((resolve, reject) => {
      const req = db!.transaction('saves').objectStore('saves').get('village');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } catch {
    /* A valid local backup remains usable. */
  }
  if (validateSave(primary) && validateSave(backup))
    return primary.lastTick > backup.lastTick ? primary : backup;
  if (validateSave(primary)) return primary;
  if (validateSave(backup)) return backup;
  return undefined;
}
export async function saveGame(state: Save): Promise<boolean> {
  let stored = false;
  const copy = structuredClone(state);
  try {
    localStorage.setItem(KEY, JSON.stringify(copy));
    stored = true;
  } catch {
    /* IndexedDB may still be available. */
  }
  if (db)
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db!.transaction('saves', 'readwrite');
        tx.objectStore('saves').put(copy, 'village');
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
      stored = true;
    } catch {
      /* Keep the local backup. */
    }
  return stored;
}
export function exportSave(state: Save) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = 'crown-and-clan-village.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function freshSave() {
  return initialSave();
}
