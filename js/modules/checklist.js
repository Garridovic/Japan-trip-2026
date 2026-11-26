// Trip checklist: base items from data/global/checklist.json plus the user's own. Pure logic (no DOM).
// Stored under one key as { checked: [ids], custom: [{id,text,group}], removed: [baseIds hidden by the user] }.
export const MAX_CUSTOM = 100;
export const MAX_TEXT = 80;

export function parseChecklist(raw) {
  const empty = { checked: new Set(), custom: [], removed: new Set() };
  try {
    const parsed = JSON.parse(raw ?? '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return empty;
    const strings = (list) => (Array.isArray(list) ? list.filter((value) => typeof value === 'string') : []);
    const custom = (Array.isArray(parsed.custom) ? parsed.custom : [])
      .filter((item) => item && typeof item.id === 'string' && typeof item.text === 'string' && item.text.trim())
      .slice(0, MAX_CUSTOM)
      .map((item) => ({ id: item.id, text: item.text.trim().slice(0, MAX_TEXT), group: typeof item.group === 'string' ? item.group : 'mis' }));
    return { checked: new Set(strings(parsed.checked)), custom, removed: new Set(strings(parsed.removed)) };
  } catch { return empty; }
}

export const serializeChecklist = (state) => JSON.stringify({ checked: [...state.checked].sort(), custom: state.custom, removed: [...state.removed].sort() });

export function validateChecklist(data) {
  const problems = [];
  const groups = new Set((data?.groups ?? []).map(({ id }) => id));
  if (!groups.size) problems.push('checklist: no groups');
  const seen = new Set();
  (data?.items ?? []).forEach((item, index) => {
    const label = item?.id ?? `#${index}`;
    if (!/^[a-z0-9-]+$/.test(item?.id ?? '')) problems.push(`item ${label}: invalid id`);
    if (seen.has(item?.id)) problems.push(`item ${label}: duplicate id`);
    seen.add(item?.id);
    if (!groups.has(item?.group)) problems.push(`item ${label}: unknown group ${item?.group}`);
    if (typeof item?.text !== 'string' || !item.text.trim()) problems.push(`item ${label}: missing text`);
  });
  if (!data?.items?.length) problems.push('checklist: no items');
  return problems;
}

/** Items shown, grouped: base (minus removed) then custom, each with its checked flag. */
export function groupChecklist(data, state) {
  const groups = [...data.groups, { id: 'mis', label: 'Mis cosas' }];
  return groups.map((group) => ({
    ...group,
    items: [
      ...data.items.filter((item) => item.group === group.id && !state.removed.has(item.id)).map((item) => ({ ...item, custom: false, checked: state.checked.has(item.id) })),
      ...state.custom.filter((item) => item.group === group.id).map((item) => ({ ...item, custom: true, checked: state.checked.has(item.id) }))
    ]
  })).filter((group) => group.items.length || group.id === 'mis');
}

export const progress = (groups) => {
  const items = groups.flatMap(({ items: list }) => list);
  return { done: items.filter(({ checked }) => checked).length, total: items.length };
};

export function createChecklistStore(storage, key = 'checklist-v1', makeId = () => `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`) {
  let state = parseChecklist(storage?.getItem(key));
  const listeners = new Set();
  const save = () => { try { storage?.setItem(key, serializeChecklist(state)); } catch { /* memory only */ } listeners.forEach((listener) => listener()); };
  return {
    state: () => state,
    toggle(id) { if (state.checked.has(id)) state.checked.delete(id); else state.checked.add(id); save(); return state.checked.has(id); },
    add(text, group = 'mis') {
      const clean = String(text ?? '').trim().slice(0, MAX_TEXT);
      if (!clean || state.custom.length >= MAX_CUSTOM) return null;
      if (state.custom.some((item) => item.text.toLowerCase() === clean.toLowerCase())) return null;
      const item = { id: makeId(), text: clean, group };
      state.custom.push(item);
      save();
      return item;
    },
    remove(id) {
      if (state.custom.some((item) => item.id === id)) state.custom = state.custom.filter((item) => item.id !== id);
      else state.removed.add(id);
      state.checked.delete(id);
      save();
    },
    uncheckAll() { state.checked = new Set(); save(); },
    restoreBase() { state.removed = new Set(); save(); },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); }
  };
}
