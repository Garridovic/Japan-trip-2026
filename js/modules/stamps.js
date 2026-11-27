// "Mis sellos": a stamp book where the traveller notes every real stamp they collect (goshuin at temples and shrines,
// gojōin at castles), with an optional note and place. Pure logic (no DOM). Stored under one synced key through
// user-data.js:  { entries: [{ id, label, place?: "kyoto:fushimi", date: "2026-12-12", updatedAt }] }.
// Places where a real stamp is confirmed carry `stamp: { kind, source }` in data/cities/<city>/places.json.
export const STAMPS_KEY = 'stamps-v1';
export const MAX_ENTRIES = 200;
export const MAX_LABEL = 60;
export const STAMP_KINDS = { goshuin: 'Goshuin', gojoin: 'Gojōin' };

export const SHAPES = ['circle', 'square', 'octagon', 'ring'];
export const MOTIFS = ['torii', 'sun', 'waves', 'mountain'];

/** Small stable hash: the same entry always gets the same artwork. */
export function hashId(text) {
  let hash = 2166136261;
  for (const char of String(text)) { hash ^= char.codePointAt(0); hash = Math.imul(hash, 16777619) >>> 0; }
  return hash >>> 0;
}

/** Shape, motif and a slight tilt (-5..+5°) chosen from an id. */
export function stampLook(id) {
  const hash = hashId(id);
  return { shape: SHAPES[hash % SHAPES.length], motif: MOTIFS[(hash >>> 3) % MOTIFS.length], tilt: ((hash >>> 6) % 11) - 5 };
}

const cleanLabel = (text) => String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_LABEL);
const isPlaceKey = (value) => typeof value === 'string' && /^[a-z0-9-]+:[a-z0-9-]+$/.test(value);

export function parseStamps(raw) {
  try {
    const parsed = JSON.parse(raw ?? '{}');
    const list = Array.isArray(parsed?.entries) ? parsed.entries : [];
    return list
      .filter((entry) => entry && typeof entry.id === 'string' && typeof entry.label === 'string')
      .slice(0, MAX_ENTRIES)
      .map((entry) => ({
        id: entry.id,
        label: cleanLabel(entry.label) || 'Sello',
        ...(isPlaceKey(entry.place) ? { place: entry.place } : {}),
        date: typeof entry.date === 'string' ? entry.date.slice(0, 10) : '',
        updatedAt: Number(entry.updatedAt) || 0
      }));
  } catch { return []; }
}

export const serializeStamps = (entries) => JSON.stringify({ entries: [...entries].sort((a, b) => a.id.localeCompare(b.id)) });

/** Newest first (by date, then by when it was written). */
export const sortedEntries = (entries) => [...entries].sort((a, b) => (b.date.localeCompare(a.date)) || (b.updatedAt - a.updatedAt));

/** { total, byCity: Map(cityId → count) } — entries without a place only count in the total. */
export function countStamps(entries) {
  const byCity = new Map();
  for (const entry of entries) {
    const cityId = entry.place?.split(':')[0];
    if (cityId) byCity.set(cityId, (byCity.get(cityId) ?? 0) + 1);
  }
  return { total: entries.length, byCity };
}

/** Places of one city where a real stamp is confirmed. */
export const stampPlaces = (places) => places.filter((place) => place.stamp && STAMP_KINDS[place.stamp.kind]);

const localDate = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export function createStampStore(storage, { now = () => new Date(), makeId = () => `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}` } = {}) {
  let entries;
  try { entries = parseStamps(storage?.getItem(STAMPS_KEY)); } catch { entries = []; }
  const listeners = new Set();
  const persist = () => { try { storage?.setItem(STAMPS_KEY, serializeStamps(entries)); } catch { /* private mode */ } };
  const changed = (change) => { persist(); listeners.forEach((listener) => listener(change)); };
  return {
    entries: () => sortedEntries(entries),
    /** Adds a stamp. The label falls back to the place name, then to "Sello". Returns the entry, or null when full. */
    add({ label = '', place = null, placeName = '' } = {}) {
      if (entries.length >= MAX_ENTRIES) return null;
      const moment = now();
      const entry = { id: makeId(), label: cleanLabel(label) || cleanLabel(placeName) || 'Sello', ...(isPlaceKey(place) ? { place } : {}), date: localDate(moment), updatedAt: moment.getTime() };
      entries = [...entries, entry];
      changed({ type: 'add', entry });
      return entry;
    },
    remove(id) {
      const entry = entries.find((item) => item.id === id);
      if (!entry) return null;
      entries = entries.filter((item) => item.id !== id);
      changed({ type: 'remove', entry });
      return entry;
    },
    /** Puts back a removed entry exactly as it was (undo). */
    restore(entry) {
      if (!entry || entries.some((item) => item.id === entry.id) || entries.length >= MAX_ENTRIES) return;
      entries = [...entries, entry];
      changed({ type: 'add', entry });
    },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); }
  };
}
