// Pure three-way merge of the user's synced data (no DOM, no storage). Used by cloud-sync.js.
//   base   : the last version both sides agreed on (empty on the first login, which makes the merge a plain union)
//   local  : what this device has now
//   remote : what the account has now
// Rule: result = (base + added by either side) - removed by either side. Without a base (first login) nothing counts as
// removed, so the merge is a union and nothing is lost.
// Values are the raw strings that user-data.js stores (JSON). Unreadable values are left exactly as they are.

const SEP = '\u0000';

const mergeSets = (base, local, remote) => {
  const result = new Set([...base, ...local, ...remote]);
  // Removed = in the base but gone from a side. A side that merely kept an item cannot bring it back,
  // and an item that only appears on one side (an addition) was never in the base, so it always survives.
  for (const side of [local, remote]) for (const item of base) if (!side.has(item)) result.delete(item);
  return result;
};

const asStrings = (list) => new Set((Array.isArray(list) ? list : []).filter((value) => typeof value === 'string'));
const parse = (raw) => { try { return raw == null ? null : JSON.parse(raw); } catch { return undefined; } };

// ---- visited: { "kyoto": ["id", ...], ... } ----
const flattenVisited = (value) => {
  const out = new Set();
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [city, ids] of Object.entries(value)) for (const id of asStrings(ids)) out.add(`${city}${SEP}${id}`);
  }
  return out;
};
const unflattenVisited = (set) => {
  const by = {};
  for (const entry of set) { const [city, id] = entry.split(SEP); (by[city] ??= []).push(id); }
  for (const city of Object.keys(by)) by[city].sort();
  return JSON.stringify(Object.fromEntries(Object.entries(by).sort(([a], [b]) => a.localeCompare(b))));
};

// ---- favourites: ["id", ...] ----
const favouritesValue = (value) => asStrings(value);
const serializeFavourites = (set) => JSON.stringify([...set].sort());

// ---- checklist: { checked: [ids], custom: [{id,text,group,updatedAt?}], removed: [ids] } ----
const customMap = (value) => new Map((Array.isArray(value?.custom) ? value.custom : [])
  .filter((item) => item && typeof item.id === 'string').map((item) => [item.id, item]));

function mergeChecklist(baseValue, localValue, remoteValue) {
  const checked = mergeSets(asStrings(baseValue?.checked), asStrings(localValue?.checked), asStrings(remoteValue?.checked));
  const removed = mergeSets(asStrings(baseValue?.removed), asStrings(localValue?.removed), asStrings(remoteValue?.removed));
  const base = customMap(baseValue);
  const local = customMap(localValue);
  const remote = customMap(remoteValue);
  const ids = mergeSets(new Set(base.keys()), new Set(local.keys()), new Set(remote.keys()));
  const custom = [];
  for (const id of ids) {
    const a = local.get(id);
    const b = remote.get(id);
    if (a && b) custom.push((Number(b.updatedAt) || 0) > (Number(a.updatedAt) || 0) ? b : a);
    else custom.push(a ?? b ?? base.get(id));
  }
  custom.sort((x, y) => String(x.id).localeCompare(String(y.id)));
  return JSON.stringify({ checked: [...checked].sort(), custom, removed: [...removed].sort() });
}

const CODECS = {
  'visited-v1': { merge: (b, l, r) => unflattenVisited(mergeSets(flattenVisited(b), flattenVisited(l), flattenVisited(r))) },
  'japan-trip:phrase-favorites': { merge: (b, l, r) => serializeFavourites(mergeSets(favouritesValue(b), favouritesValue(l), favouritesValue(r))) },
  'japan-trip:dish-favorites': { merge: (b, l, r) => serializeFavourites(mergeSets(favouritesValue(b), favouritesValue(l), favouritesValue(r))) },
  'checklist-v1': { merge: mergeChecklist }
};

/** Merges one key. Returns the raw string to store, or `undefined` to leave the key out. */
export function mergeValue(key, baseRaw, localRaw, remoteRaw) {
  if (localRaw == null && remoteRaw == null) return baseRaw ?? undefined;
  if (localRaw === remoteRaw) return localRaw;
  const codec = CODECS[key];
  const [base, local, remote] = [parse(baseRaw), parse(localRaw), parse(remoteRaw)];
  // Unknown key or unreadable data: never invent anything. Keep the side that is readable (local first).
  if (!codec || local === undefined || remote === undefined || base === undefined) return localRaw ?? remoteRaw;
  return codec.merge(base ?? {}, local ?? {}, remote ?? {});
}

/** Merges two data objects { key: rawString } with a base. Only keys in `keys` are touched. */
export function mergeData(keys, base = {}, local = {}, remote = {}) {
  const merged = {};
  for (const key of keys) {
    const value = mergeValue(key, base[key], local[key], remote[key]);
    if (typeof value === 'string') merged[key] = value;
  }
  return merged;
}

/** Same content regardless of key order / whitespace. */
export function sameData(keys, a = {}, b = {}) {
  return keys.every((key) => {
    if (a[key] === b[key]) return true;
    try { return JSON.stringify(JSON.parse(a[key])) === JSON.stringify(JSON.parse(b[key])); } catch { return false; }
  });
}
