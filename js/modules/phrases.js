// Pure helpers for the global "Frases" section: validation, search, filtering and favourites.
// No DOM access here so everything can be unit-tested with node:test.

export const FAVORITES_CATEGORY = 'favoritas';
export const ALL_CATEGORY = 'todas';
export const FAVORITES_STORAGE_KEY = 'japan-trip:phrase-favorites';

/** Lowercase, strip accents, and drop spaces and punctuation so «o negai-shimas» matches «onegaishimas». */
export function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[\s\-_.,;:!?¿¡'"«»()·・、。！？]+/g, '');
}

const searchText = (phrase) => normalizeText([phrase.es, phrase.ja, phrase.romaji].join(' '));
// Query terms are normalized one by one so a multi-word search still matches across the phrase.
const queryTerms = (query) => String(query ?? '').trim().split(/\s+/).map(normalizeText).filter(Boolean);

export function matchesQuery(phrase, query) {
  const terms = queryTerms(query);
  if (terms.length === 0) return true;
  const haystack = searchText(phrase);
  return terms.every((term) => haystack.includes(term));
}

export function filterPhrases(phrases, { category = ALL_CATEGORY, query = '', favorites = new Set() } = {}) {
  return phrases.filter((phrase) => {
    if (category === FAVORITES_CATEGORY && !favorites.has(phrase.id)) return false;
    if (category !== ALL_CATEGORY && category !== FAVORITES_CATEGORY && phrase.category !== category) return false;
    return matchesQuery(phrase, query);
  });
}

export function validatePhrases(data) {
  const problems = [];
  const categoryIds = new Set((data?.categories ?? []).map(({ id }) => id));
  if (!Array.isArray(data?.phrases) || data.phrases.length === 0) return ['phrases must be a non-empty array'];
  const seen = new Set();
  const hasText = (value) => typeof value === 'string' && value.trim() !== '';
  const hasJapanese = (value) => /[぀-ヿ一-鿿]/.test(value);
  data.phrases.forEach((phrase, index) => {
    const label = phrase?.id ?? `#${index}`;
    if (!/^[a-z0-9-]+$/.test(phrase?.id ?? '')) problems.push(`phrase ${label}: invalid id`);
    if (seen.has(phrase.id)) problems.push(`phrase ${label}: duplicate id`);
    seen.add(phrase.id);
    if (!categoryIds.has(phrase.category)) problems.push(`phrase ${label}: unknown category ${phrase.category}`);
    if (!['pdf', 'added'].includes(phrase.source)) problems.push(`phrase ${label}: source must be "pdf" or "added"`);
    for (const field of ['es', 'ja', 'romaji']) if (!hasText(phrase[field])) problems.push(`phrase ${label}: missing ${field}`);
    if (hasText(phrase.ja) && !hasJapanese(phrase.ja)) problems.push(`phrase ${label}: ja has no Japanese characters`);
    if (!Array.isArray(phrase.examples) || phrase.examples.length !== 2) problems.push(`phrase ${label}: needs exactly 2 examples`);
    (phrase.examples ?? []).forEach((example, i) => {
      for (const field of ['es', 'ja', 'romaji']) if (!hasText(example?.[field])) problems.push(`phrase ${label}: example ${i} missing ${field}`);
      if (hasText(example?.ja) && !hasJapanese(example.ja)) problems.push(`phrase ${label}: example ${i} ja has no Japanese characters`);
    });
  });
  (data.categories ?? []).forEach(({ id }) => {
    if (!data.phrases.some((phrase) => phrase.category === id)) problems.push(`category ${id} has no phrases`);
  });
  return problems;
}

/** Favourites persisted in localStorage; every storage failure (private mode, blocked) degrades to memory only. */
export function createFavoritesStore(storage, key = FAVORITES_STORAGE_KEY) {
  const read = () => {
    try {
      const parsed = JSON.parse(storage?.getItem(key) ?? '[]');
      return new Set(Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : []);
    } catch { return new Set(); }
  };
  let ids = read();
  const save = () => { try { storage?.setItem(key, JSON.stringify([...ids])); } catch { /* keep in memory */ } };
  return {
    has: (id) => ids.has(id),
    all: () => new Set(ids),
    toggle(id) {
      if (ids.has(id)) ids.delete(id); else ids.add(id);
      save();
      return ids.has(id);
    },
    /** Drops saved ids that no longer exist in the data. */
    prune(validIds) { ids = new Set([...ids].filter((id) => validIds.has(id))); save(); }
  };
}
