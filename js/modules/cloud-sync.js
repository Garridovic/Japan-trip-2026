// Account sync: keeps the user's synced data (visited places, favourites, checklist) in Auth0 user_metadata.
// LOCAL FIRST: the app always reads and writes localStorage; this module only reconciles with the cloud copy.
//   reconcile() = read the cloud copy, three-way merge with local and the last agreed base (sync-merge.js),
//                 apply the result locally if it changed, write it back if the cloud copy differs, remember it as the base.
// Everything is injected (fetch, timers, storage) so it can be tested without a network.
import { mergeData, sameData } from './sync-merge.js';
import { SYNCED_KEYS } from './user-data.js';

export const SCHEMA_VERSION = 1;
export const META_KEY = 'japan_trip'; // one top-level user_metadata property; no dots or $ in keys
export const SAVE_DELAY_MS = 5000; // Free plan: Management API allows ~2 requests/s for the whole tenant
export const RETRY_DELAYS_MS = [5000, 15000, 60000, 300000];
export const SIZE_WARNING_BYTES = 40 * 1024;
export const BACKUP_KEY = 'user-data-backup';
export const LAST_SYNC_KEY = 'user-data-last-sync';

export class SyncError extends Error {
  constructor(message, { retry = true, status = 0 } = {}) { super(message); this.retry = retry; this.status = status; }
}

export function createCloudSync({
  domain, userId, userData, getToken, storage = null,
  fetchFn = (...args) => fetch(...args), now = () => Date.now(),
  setTimer = setTimeout, clearTimer = clearTimeout, onStatus = () => {}, onRemoteChanges = () => {}
}) {
  const endpoint = `https://${domain}/api/v2/users/${encodeURIComponent(userId)}`;
  let running = null;
  let again = false;
  let retryTimer = null;
  let attempt = 0;
  let state = 'synced';

  const setState = (next, extra = {}) => { state = next; onStatus({ state: next, lastSyncAt: lastSync(), ...extra }); };
  const lastSync = () => { try { return Number(storage?.getItem(LAST_SYNC_KEY)) || 0; } catch { return 0; } };

  async function call(method, body) {
    const token = await getToken();
    let response;
    try {
      response = await fetchFn(method === 'GET' ? `${endpoint}?fields=user_metadata&include_fields=true` : endpoint, {
        method,
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined
      });
    } catch (error) { throw new SyncError(`network: ${error?.message ?? error}`); }
    if (response.status === 401 || response.status === 403) throw new SyncError('unauthorized', { retry: false, status: response.status });
    if (!response.ok) throw new SyncError(`http ${response.status}`, { retry: response.status === 429 || response.status >= 500, status: response.status });
    return response.json();
  }

  async function reconcileOnce() {
    const profile = await call('GET');
    const remote = profile?.user_metadata?.[META_KEY] ?? null;
    if (remote && Number(remote.v) > SCHEMA_VERSION) throw new SyncError('newer-schema', { retry: false });
    const remoteData = remote && typeof remote.data === 'object' && remote.data ? remote.data : {};
    const local = userData.snapshot().data;
    const base = userData.getBase();
    const firstSync = Object.keys(base).length === 0;
    const merged = mergeData(SYNCED_KEYS, base, local, remoteData);

    let changedLocal = false;
    if (!sameData(SYNCED_KEYS, merged, local)) {
      if (firstSync && storage) { try { storage.setItem(BACKUP_KEY, JSON.stringify({ at: now(), data: local })); } catch { /* ignore */ } }
      userData.apply({ updatedAt: now(), data: merged });
      changedLocal = true;
    }
    if (!sameData(SYNCED_KEYS, merged, remoteData) || !remote) {
      const payload = { v: SCHEMA_VERSION, updatedAt: now(), data: merged };
      if (JSON.stringify(payload).length > SIZE_WARNING_BYTES) console.warn('[cloud-sync] user_metadata is getting large');
      await call('PATCH', { user_metadata: { [META_KEY]: payload } });
    }
    userData.setBase(merged);
    try { storage?.setItem(LAST_SYNC_KEY, String(now())); } catch { /* ignore */ }
    return { changedLocal, firstSync };
  }

  /** Runs one reconcile at a time; a request made while one is running triggers exactly one more run. */
  function reconcile() {
    if (running) { again = true; return running; }
    clearRetry();
    setState('syncing');
    running = (async () => {
      let outcome = { changedLocal: false };
      try {
        do {
          again = false;
          const result = await reconcileOnce();
          outcome = { changedLocal: outcome.changedLocal || result.changedLocal, firstSync: result.firstSync };
        } while (again);
        attempt = 0;
        setState('synced');
        if (outcome.changedLocal) onRemoteChanges(outcome);
        return outcome;
      } catch (error) {
        if (error instanceof SyncError && !error.retry) { setState(error.status === 401 || error.status === 403 ? 'signed-out' : 'error', { reason: error.message }); return outcome; }
        setState('pending', { reason: error?.message });
        scheduleRetry();
        return outcome;
      } finally { running = null; }
    })();
    return running;
  }

  function clearRetry() { if (retryTimer) { clearTimer(retryTimer); retryTimer = null; } }
  function scheduleRetry() {
    clearRetry();
    const delay = RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)];
    attempt += 1;
    retryTimer = setTimer(() => { retryTimer = null; reconcile(); }, delay);
  }

  /** The backend handed to userData.connect(): saving is the same reconcile, so two devices never overwrite each other. */
  const backend = { load: async () => null, save: async () => { await reconcile(); } };

  return {
    backend,
    reconcile,
    get state() { return state; },
    /** Network is back, or the app came to the front: try again now if something was waiting. */
    resume() { if (state === 'pending' || userData.hasPendingSave()) { attempt = 0; return reconcile(); } return null; },
    stop() { clearRetry(); }
  };
}
