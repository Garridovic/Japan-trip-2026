// Private data for the "Viaje" view (PINs, booking numbers, notes). It is typed on the phone and lives ONLY in this
// device's localStorage: it is never part of the repository, never sent anywhere and never put in the service worker cache.
export const PRIVATE_STORAGE_KEY = 'japan-trip:lodging-private';
export const FIELDS = [
  { id: 'pin', label: 'PIN o código de acceso', max: 60 },
  { id: 'booking', label: 'Número de reserva', max: 80 },
  { id: 'notes', label: 'Notas (opcional)', max: 600 }
];
export const BACKUP_KIND = 'japan-trip-2026/private-lodging';

const clean = (value, max) => String(value ?? '').slice(0, max);

/** Keeps only known stays and known fields, trimmed to their maximum length; drops empty entries. */
export function sanitize(data, validIds) {
  const result = {};
  for (const [id, entry] of Object.entries(data ?? {})) {
    if (!validIds.has(id) || !entry || typeof entry !== 'object') continue;
    const kept = {};
    for (const { id: field, max } of FIELDS) {
      const value = clean(entry[field], max);
      if (value.trim() !== '') kept[field] = value;
    }
    if (Object.keys(kept).length) result[id] = kept;
  }
  return result;
}

export function createPrivateStore(storage, validIds, key = PRIVATE_STORAGE_KEY) {
  const read = () => {
    try { return sanitize(JSON.parse(storage?.getItem(key) ?? '{}'), validIds); } catch { return {}; }
  };
  let data = read();
  const save = () => { try { storage?.setItem(key, JSON.stringify(data)); return true; } catch { return false; } };
  return {
    get: (id) => ({ pin: '', booking: '', notes: '', ...(data[id] ?? {}) }),
    all: () => structuredClone(data),
    set(id, field, value) {
      if (!validIds.has(id) || !FIELDS.some(({ id: known }) => known === field)) return false;
      data = sanitize({ ...data, [id]: { ...(data[id] ?? {}), [field]: value } }, validIds);
      return save();
    },
    /** Replaces everything (used by "import backup"). */
    replace(next) { data = sanitize(next, validIds); return save(); },
    clear() { data = {}; try { storage?.removeItem(key); } catch { /* nothing to remove */ } },
    isEmpty: () => Object.keys(data).length === 0
  };
}

export function serializeBackup(data, now = new Date()) {
  return JSON.stringify({ kind: BACKUP_KIND, version: 1, exportedAt: now.toISOString(), stays: data }, null, 2);
}

/** Returns { ok, stays } or { ok: false, error } for a backup file's text. */
export function parseBackup(text, validIds) {
  let parsed;
  try { parsed = JSON.parse(text); } catch { return { ok: false, error: 'El archivo no es una copia de seguridad válida.' }; }
  if (parsed?.kind !== BACKUP_KIND || typeof parsed.stays !== 'object' || parsed.stays === null) {
    return { ok: false, error: 'Este archivo no es una copia de seguridad de los datos privados del viaje.' };
  }
  const stays = sanitize(parsed.stays, validIds);
  return { ok: true, stays, count: Object.keys(stays).length };
}
