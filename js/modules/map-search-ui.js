// Search field of the full-screen map: highlights the matching points, fades the rest and lists the best matches
// under the field. The matching itself is in map-search.js; the map painting is map.setSearch().
import { byId, h } from './dom.js';
import { isSearchable } from './map-search.js';
import { shownLabel } from './map-filters.js';

export const MAX_ROWS = 4;
const APPLY_DELAY = 250; // ms of pause before the map refits, so it does not jump on every letter

export function initMapSearch({ map, doc = document }) {
  const input = byId('map-search-input');
  const clearButton = byId('map-search-clear');
  const drop = byId('map-search-drop');
  const count = byId('map-search-count');
  const controls = input?.closest('.map-view-controls');
  if (!input || !controls) return { clear() {} };

  let timer = null;
  let rows = [];
  let active = -1;

  const closeDrop = () => {
    drop.hidden = true;
    drop.replaceChildren();
    rows = [];
    active = -1;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  };
  const trimmed = () => input.value.trim();

  function apply() {
    clearTimeout(timer);
    map.setSearch(input.value);
  }
  function clear({ touchMap = true } = {}) {
    clearTimeout(timer);
    input.value = '';
    clearButton.hidden = true;
    closeDrop();
    count.hidden = true;
    if (touchMap) map.setSearch('');
  }
  const pick = (point) => { apply(); closeDrop(); input.blur(); map.select(point.id); };

  function setActive(next) {
    rows.forEach((row, i) => row.setAttribute('aria-selected', String(i === next)));
    active = next;
    if (next >= 0) input.setAttribute('aria-activedescendant', rows[next].id); else input.removeAttribute('aria-activedescendant');
  }

  function renderDrop() {
    if (!isSearchable(input.value)) { closeDrop(); return; }
    const outcome = map.previewSearch(input.value);
    drop.replaceChildren();
    rows = [];
    active = -1;
    if (!outcome.results.length) {
      drop.append(h('div', { class: 'map-search-empty', role: 'status' },
        h('strong', {}, `Nada para «${trimmed()}»`),
        h('p', {}, outcome.hidden
          ? `No hay coincidencias entre los ${outcome.shown} puntos que muestra el mapa. Hay ${outcome.hidden} en lugares ocultos por tus filtros.`
          : `No hay coincidencias entre los ${outcome.shown} puntos del mapa. Prueba con otra grafía o con «templo», «santuario» o «ramen».`),
        h('div', { class: 'map-search-empty-actions' },
          outcome.hidden ? h('button', { type: 'button', class: 'map-search-action is-primary', onclick: () => { map.clearFilters(); renderDrop(); apply(); } }, 'Incluirlos') : null,
          h('button', { type: 'button', class: 'map-search-action', onclick: () => { clear(); input.focus(); } }, 'Quitar búsqueda'))));
    } else {
      outcome.results.slice(0, MAX_ROWS).forEach((point, i) => {
        const row = h('button', { type: 'button', class: 'map-search-row-item', role: 'option', id: `map-search-option-${i}`, 'aria-selected': 'false', onclick: () => pick(point) },
          h('span', { class: 'map-search-pt', 'aria-hidden': 'true' }),
          h('span', { class: 'map-search-text' }, h('strong', {}, point.name), h('small', {}, point.desc ?? '')));
        rows.push(row);
        drop.append(row);
      });
      drop.append(h('button', { type: 'button', class: 'map-search-foot', onclick: () => { apply(); closeDrop(); input.blur(); } },
        outcome.results.length === 1 ? 'Ver en el mapa' : `Ver los ${outcome.results.length} en el mapa`));
    }
    drop.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  }

  input.addEventListener('input', () => {
    clearButton.hidden = !input.value;
    renderDrop();
    clearTimeout(timer);
    timer = setTimeout(apply, APPLY_DELAY);
  });
  input.addEventListener('focus', () => { if (isSearchable(input.value)) renderDrop(); });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!rows.length) return;
      event.preventDefault();
      setActive((active + (event.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (active >= 0) { rows[active].click(); return; }
      const outcome = isSearchable(input.value) ? map.previewSearch(input.value) : null;
      if (outcome?.results.length === 1) pick(outcome.results[0]);
      else { apply(); closeDrop(); input.blur(); }
    } else if (event.key === 'Escape') {
      event.preventDefault(); // a type=search field would also empty itself
      if (!drop.hidden) { event.stopPropagation(); closeDrop(); } else if (input.value) { event.stopPropagation(); clear(); }
    }
  });
  clearButton.addEventListener('click', () => { clear(); input.focus(); });
  count.addEventListener('click', () => clear());
  doc.addEventListener('pointerdown', (event) => { if (!drop.hidden && !controls.contains(event.target)) closeDrop(); });
  controls.querySelectorAll('[data-map-sheet]').forEach((button) => button.addEventListener('click', closeDrop));

  // The pill under the field says how many of the shown places match; it also clears the search.
  doc.addEventListener('map:state', (event) => {
    const { search, shown } = event.detail;
    count.hidden = search === null || search === undefined;
    if (!count.hidden) {
      count.textContent = `${shownLabel(search, shown, true)} · Quitar`;
      count.setAttribute('aria-label', `Quitar la búsqueda: ${shownLabel(search, shown, true)}`);
    }
  });
  doc.addEventListener('map:select', () => { closeDrop(); input.blur(); });
  doc.addEventListener('map:city', () => clear({ touchMap: false }));
  doc.addEventListener('map:leave', () => clear());
  return { clear };
}
