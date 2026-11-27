// The single place where the user's own data is read and written: visited places, favourite phrases and dishes,
// and the trip checklist. Everything goes through `userStorage()`, which looks like localStorage (getItem / setItem /
// removeItem) so the stores that already exist did not change. Lodging notes (PINs, bookings) are NOT here on purpose:
// they never leave the phone.
//
// Sync hook (used by cloud-sync.js, Auth0 user_metadata): call `userData.connect(backend, { delayMs })` before the app
// starts, with   backend = { load(): Promise<snapshot|null>, save(snapshot): Promise<void> }.
//   - `load` runs once at start; a snapshot it returns replaces the local values (cloud-sync returns null and merges itself).
//   - `save` runs (debounced by `delayMs`) after every change of a synced key, with the full snapshot.
//   - `getBase()/setBase()` keep the last version both sides agreed on, for the three-way merge in sync-merge.js.
// A snapshot is { updatedAt, data: { <key>: <string> } } where the keys are SYNCED_KEYS. The UI never needs to change.
// Keys are literal on purpose (visited.js imports this module, so importing it back would be a cycle);
// tests/user-data.test.js checks they match the stores' own constants.
export const CHECKLIST_KEY = 'checklist-v1';
export const SYNCED_KEYS = Object.freeze(['visited-v1', 'japan-trip:phrase-favorites', 'japan-trip:dish-favorites', 'japan-trip:dish-tried', CHECKLIST_KEY, 'stamps-v1']);
const UPDATED_KEY = 'user-data-updated-at';
const BASE_KEY = 'user-data-synced-base';
const SAVE_DELAY_MS = 800;

export function createUserData(storage, { now = () => Date.now(), setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  let backend = null;
  let delayMs = SAVE_DELAY_MS;
  let timer = null;
  const listeners = new Set();

  const read = (key) => { try { return storage?.getItem(key) ?? null; } catch { return null; } };
  const write = (key, value) => { try { storage?.setItem(key, value); } catch { /* private mode: kept for this visit only */ } };

  const snapshot = () => {
    const data = {};
    for (const key of SYNCED_KEYS) { const value = read(key); if (value !== null) data[key] = value; }
    return { updatedAt: Number(read(UPDATED_KEY)) || 0, data };
  };
  const flush = async () => {
    timer = null;
    if (!backend) return;
    try { await backend.save(snapshot()); } catch (error) { console.warn('[user-data] save failed', error); }
  };
  const touch = (key) => {
    if (!SYNCED_KEYS.includes(key)) return;
    write(UPDATED_KEY, String(now()));
    listeners.forEach((listener) => listener(key));
    if (!backend) return;
    if (timer) clearTimer(timer);
    timer = setTimer(flush, delayMs);
  };

  /** Storage-shaped facade handed to every store. */
  const facade = {
    getItem: (key) => read(key),
    setItem(key, value) { write(key, value); touch(key); },
    removeItem(key) { try { storage?.removeItem(key); } catch { /* ignore */ } touch(key); }
  };

  return {
    storage: facade,
    snapshot,
    /** Replaces the synced keys with a snapshot (only known keys, only strings). Call before the stores are created. */
    apply(incoming) {
      if (!incoming || typeof incoming.data !== 'object') return false;
      for (const key of SYNCED_KEYS) if (typeof incoming.data[key] === 'string') write(key, incoming.data[key]);
      if (incoming.updatedAt) write(UPDATED_KEY, String(incoming.updatedAt));
      return true;
    },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    connect(newBackend, options = {}) { backend = newBackend; delayMs = options.delayMs ?? SAVE_DELAY_MS; },
    disconnect() { backend = null; if (timer) clearTimer(timer); timer = null; },
    /** True while a debounced save is waiting. */
    hasPendingSave: () => timer !== null,
    /** Last data both sides agreed on ({ key: rawString }); empty before the first sync. */
    getBase() { try { const parsed = JSON.parse(read(BASE_KEY) ?? '{}'); return parsed && typeof parsed === 'object' ? parsed : {}; } catch { return {}; } },
    setBase(data) { write(BASE_KEY, JSON.stringify(data ?? {})); },
    clearBase() { try { storage?.removeItem(BASE_KEY); } catch { /* ignore */ } },
    /** Loads from the backend (if any). Never throws and never blocks the app for long. */
    async load({ timeoutMs = 3000 } = {}) {
      if (!backend) return false;
      try {
        const remote = await Promise.race([backend.load(), new Promise((resolve) => setTimer(() => resolve(null), timeoutMs))]);
        return this.apply(remote);
      } catch (error) { console.warn('[user-data] load failed', error); return false; }
    },
    flush
  };
}

let shared = null;
export function userData() {
  if (!shared) {
    let storage = null;
    try { storage = window.localStorage; } catch { /* blocked */ }
    shared = createUserData(storage);
    window.japanTripUserData = shared; // the hook an account-sync module uses: window.japanTripUserData.connect(backend)
  }
  return shared;
}
export const userStorage = () => userData().storage;
