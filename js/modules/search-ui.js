// Global search sheet, opened from the magnifier in the top bar (or "/" on a keyboard).
import { byId, h } from './dom.js';
import { openOverlay, releaseOverlay } from './overlay-history.js';
import { buildIndex, search } from './search.js';

const OVERLAY = 'search-sheet';

export function initSearch({ phrases = [], dishes = [], handlers = {} } = {}) {
  const sheet = byId('search-sheet');
  const input = byId('search-input');
  const results = byId('search-results');
  const opener = byId('search-button');
  let city = { places: [], restaurants: [], extras: [] };
  let index = buildIndex({ phrases, dishes });
  let previousFocus = null;

  const setCity = (data) => { city = data; index = buildIndex({ ...data, phrases, dishes }); if (!sheet.hidden) render(); };

  function render() {
    const groups = search(index, input.value);
    if (!input.value.trim()) { results.replaceChildren(h('p', { class: 'search-hint' }, 'Busca lugares, restaurantes, frases o platos: en español, japonés o romaji.')); return; }
    if (!groups.length) { results.replaceChildren(h('p', { class: 'search-hint' }, input.value.trim().length < 2 ? 'Escribe al menos 2 letras.' : `Nada para «${input.value.trim()}».`)); return; }
    results.replaceChildren(...groups.map((group) => h('section', { class: 'search-group', dataset: { kind: group.kind } },
      h('h3', {}, group.label, group.total > group.items.length ? h('span', { class: 'search-more' }, ` · ${group.items.length} de ${group.total}`) : null),
      h('ul', {}, group.items.map((item) => h('li', {},
        h('button', { type: 'button', class: 'search-result', dataset: { kind: item.kind, id: item.id }, onclick: () => choose(item) },
          h('strong', {}, item.title), item.subtitle ? h('span', {}, item.subtitle) : null)))))));
  }

  const close = () => {
    if (sheet.hidden) return;
    sheet.hidden = true;
    sheet.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('phrase-show-open');
    releaseOverlay(OVERLAY);
    previousFocus?.focus?.();
  };
  const open = () => {
    if (!sheet.hidden) return;
    previousFocus = document.activeElement;
    sheet.hidden = false;
    sheet.setAttribute('aria-hidden', 'false');
    document.body.classList.add('phrase-show-open');
    openOverlay(OVERLAY, () => { sheet.hidden = true; sheet.setAttribute('aria-hidden', 'true'); document.body.classList.remove('phrase-show-open'); });
    render();
    input.focus();
    input.select();
  };
  async function choose(item) {
    close();
    await handlers[item.kind]?.(item);
  }

  opener.addEventListener('click', open);
  byId('search-close').addEventListener('click', close);
  input.addEventListener('input', render);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close();
    else if (event.key === '/' && sheet.hidden && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName ?? '')) { event.preventDefault(); open(); }
  });
  return { setCity, open, close };
}
