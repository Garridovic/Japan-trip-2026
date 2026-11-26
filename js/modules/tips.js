// "Consejos prácticos" in the Viaje view: validation and grouping. Pure, so it can be unit-tested.
// Global tips live in data/global/tips.json (`practical`), city tips in data/cities/<id>/tips.json.

const hasText = (value) => typeof value === 'string' && value.trim() !== '';
const ID = /^[a-z0-9-]+$/;

function validateItems(items, label, problems, seen) {
  if (!Array.isArray(items) || items.length === 0) { problems.push(`${label}: items must be a non-empty array`); return; }
  items.forEach((item, index) => {
    const name = `${label} ${item?.id ?? `#${index}`}`;
    if (!ID.test(item?.id ?? '')) problems.push(`${name}: invalid id`);
    if (seen.has(`${label}/${item?.id}`)) problems.push(`${name}: duplicate id`);
    seen.add(`${label}/${item?.id}`);
    for (const field of ['title', 'text', 'source']) if (!hasText(item?.[field])) problems.push(`${name}: missing ${field}`);
    (item?.links ?? []).forEach((link, i) => {
      if (!hasText(link?.label)) problems.push(`${name}: link ${i} missing label`);
      if (!/^https:\/\//.test(link?.href ?? '')) problems.push(`${name}: link ${i} must be https`);
    });
  });
}

/** `cityTips` is a Map(cityId -> {items}). Returns human-readable problems (empty when valid). */
export function validateTips(practical, cityTips = new Map()) {
  const problems = [];
  const seen = new Set();
  const categories = practical?.categories ?? [];
  if (!categories.length) problems.push('practical: categories must be non-empty');
  const ids = new Set(categories.map(({ id }) => id));
  if (ids.size !== categories.length) problems.push('practical: duplicate category id');
  categories.forEach((category) => { if (!ID.test(category?.id ?? '') || !hasText(category?.label)) problems.push(`practical: invalid category ${category?.id}`); });
  ['kicker', 'title'].forEach((field) => { if (!hasText(practical?.[field])) problems.push(`practical: missing ${field}`); });
  validateItems(practical?.items, 'practical', problems, seen);
  (practical?.items ?? []).forEach((item) => { if (!ids.has(item.category)) problems.push(`practical ${item.id}: unknown category ${item.category}`); });
  for (const [cityId, data] of cityTips) validateItems(data?.items, `city ${cityId}`, problems, seen);
  return problems;
}

/**
 * Ordered groups for the interface: global categories first, then one group per city
 * (in journey order) that has tips. Empty groups are dropped.
 */
export function groupTips(practical, cityTips, cities) {
  const groups = (practical?.categories ?? []).map(({ id, label }) => ({
    id, label, kind: 'global', items: (practical.items ?? []).filter((item) => item.category === id)
  }));
  for (const city of cities) {
    const items = cityTips.get(city.id)?.items ?? [];
    groups.push({ id: `city-${city.id}`, label: city.name, kind: 'city', items });
  }
  return groups.filter((group) => group.items.length > 0);
}
