// Map filters with multiple choice: several days, several kinds of place and two "solo" switches.
// Pure functions (no DOM, no Leaflet) so the rules can be tested on their own.
//   days:  day values ('8', '9', 'extra'…). Empty = every day.
//   kinds: 'visitas' (everything that is not a restaurant) and/or 'restaurantes'. Empty = both.
//   only:  'pendientes' (visitable places not yet visited) and/or 'sellos' (places with a stamp). Each one narrows the result.

export const KIND_LABELS = { visitas: 'Visitas', restaurantes: 'Comida' };
export const ONLY_LABELS = { pendientes: 'Pendientes', sellos: 'Con sello' };

export function emptyFilters() {
  return { days: [], kinds: [], only: [] };
}

/** Adds the value if missing, removes it if present (returns a new array). */
export function toggleValue(list, value) {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

export function matchesDay(point, days) {
  if (!days.length) return true;
  const pointDays = String(point.day ?? '').split(',');
  return days.some((day) => pointDays.includes(day));
}

export function matchesKind(point, kinds) {
  if (!kinds.length) return true;
  const isRestaurant = point.type === 'restaurant';
  return (kinds.includes('restaurantes') && isRestaurant) || (kinds.includes('visitas') && !isRestaurant);
}

/** isPending(point) says whether a visitable place is still to be visited. */
export function matchesOnly(point, only, isPending) {
  if (only.includes('pendientes') && !isPending(point)) return false;
  if (only.includes('sellos') && !point.stamp) return false;
  return true;
}

export function matchesFilters(point, filters, isPending = () => true) {
  return matchesDay(point, filters.days) && matchesKind(point, filters.kinds) && matchesOnly(point, filters.only, isPending);
}

export function countActive(filters) {
  return filters.days.length + filters.kinds.length + filters.only.length;
}

/** The day route needs exactly one real day (not "Alternativas"). */
export function singleRouteDay(filters) {
  return filters.days.length === 1 && /^\d+$/.test(filters.days[0]) ? filters.days[0] : null;
}

/** Active filters as {key, value, label}, in the order they appear in the sheet. dayLabel(value) names a day. */
export function activeFilterList(filters, dayLabel = (value) => value) {
  return [
    ...filters.days.map((value) => ({ key: 'day', value, label: dayLabel(value) })),
    ...filters.kinds.map((value) => ({ key: 'kind', value, label: KIND_LABELS[value] ?? value })),
    ...filters.only.map((value) => ({ key: 'only', value, label: ONLY_LABELS[value] ?? value }))
  ];
}

/** "4 de 18 lugares" (or "18 lugares" with no filters). */
export function shownLabel(shown, total, active) {
  const noun = (n) => (n === 1 ? 'lugar' : 'lugares');
  return active ? `${shown} de ${total} ${noun(total)}` : `${total} ${noun(total)}`;
}

/** Sentence for the status line under the guide's map. */
export function describeFilters(filters, shown, total, dayLabel = (value) => value) {
  if (!countActive(filters)) return `Mostrando los ${total} puntos: visitas, alternativas, eventos y restaurantes.`;
  const parts = activeFilterList(filters, dayLabel).map((item) => item.label);
  return `Mostrando ${shown} de ${total} puntos · ${parts.join(', ')}.`;
}
