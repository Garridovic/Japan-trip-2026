// Pure helpers for the global "Platos" section: validation, search and filtering (no DOM access).
import { normalizeText } from './phrases.js';

export const ALL = 'todos';
export const FAVORITES = 'favoritos';
export const PROTEINS = ['carne', 'pescado', 'vegetariano', 'variable'];
export const DISH_FAVORITES_KEY = 'japan-trip:dish-favorites';

const searchText = (dish) => normalizeText([dish.es, dish.ja, dish.romaji].join(' '));
const queryTerms = (query) => String(query ?? '').trim().split(/\s+/).map(normalizeText).filter(Boolean);

export function matchesDishQuery(dish, query) {
  const terms = queryTerms(query);
  const haystack = searchText(dish);
  return terms.every((term) => haystack.includes(term));
}

export function filterDishes(dishes, { category = ALL, protein = ALL, query = '', favorites = new Set() } = {}) {
  return dishes.filter((dish) => {
    if (category === FAVORITES && !favorites.has(dish.id)) return false;
    if (category !== ALL && category !== FAVORITES && dish.category !== category) return false;
    if (protein !== ALL && dish.protein !== protein) return false;
    return matchesDishQuery(dish, query);
  });
}

/** Photos must be declared with local files that have a credit record; `fileExists` is injected so this stays pure. */
export function validateDishes(data, credits = [], fileExists = () => true) {
  const problems = [];
  if (!Array.isArray(data?.dishes) || data.dishes.length === 0) return ['dishes must be a non-empty array'];
  const categoryIds = new Set((data.categories ?? []).map(({ id }) => id));
  const allergens = new Set(Object.keys(data.allergenLabels ?? {}));
  const creditById = new Map(credits.map((credit) => [credit.dishId, credit]));
  const seen = new Set();
  const hasText = (value) => typeof value === 'string' && value.trim() !== '';
  if (!hasText(data.disclaimer)) problems.push('disclaimer is required');
  data.dishes.forEach((dish, index) => {
    const label = dish?.id ?? `#${index}`;
    if (!/^[a-z0-9-]+$/.test(dish?.id ?? '')) problems.push(`dish ${label}: invalid id`);
    if (seen.has(dish.id)) problems.push(`dish ${label}: duplicate id`);
    seen.add(dish.id);
    if (!categoryIds.has(dish.category)) problems.push(`dish ${label}: unknown category ${dish.category}`);
    for (const field of ['es', 'ja', 'romaji', 'description']) if (!hasText(dish[field])) problems.push(`dish ${label}: missing ${field}`);
    if (hasText(dish.ja) && !/[぀-ヿ一-鿿]/.test(dish.ja)) problems.push(`dish ${label}: ja has no Japanese characters`);
    if (!PROTEINS.includes(dish.protein)) problems.push(`dish ${label}: invalid protein ${dish.protein}`);
    (dish.allergens ?? []).forEach((allergen) => { if (!allergens.has(allergen)) problems.push(`dish ${label}: unknown allergen ${allergen}`); });
    if (!Array.isArray(dish.photos)) problems.push(`dish ${label}: photos must be an array`);
    (dish.photos ?? []).forEach((photo) => {
      if (!fileExists(photo.src)) problems.push(`dish ${label}: missing photo file ${photo.src}`);
      if (!hasText(photo.alt)) problems.push(`dish ${label}: photo without alt text`);
      const credit = creditById.get(dish.id);
      if (!credit) problems.push(`dish ${label}: photo without credit record`);
      else for (const field of ['author', 'license', 'sourcePage']) if (!hasText(credit[field])) problems.push(`dish ${label}: credit missing ${field}`);
    });
  });
  credits.forEach((credit) => { if (!seen.has(credit.dishId)) problems.push(`credit for unknown dish ${credit.dishId}`); });
  (data.categories ?? []).forEach(({ id }) => {
    if (!data.dishes.some((dish) => dish.category === id)) problems.push(`category ${id} has no dishes`);
  });
  return problems;
}
