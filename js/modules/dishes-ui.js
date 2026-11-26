// "Platos" section: identify a dish by photo or by name (search), favourites and a full-screen "show" sheet.
import { userStorage } from './user-data.js';
import { openOverlay, releaseOverlay } from './overlay-history.js';
import { byId, h, externalLink } from './dom.js';
import { createFavoritesStore } from './phrases.js';
import { createSpeech } from './speech.js';
import { ALL, FAVORITES, PROTEINS, DISH_FAVORITES_KEY, filterDishes } from './dishes.js';

const PROTEIN_ICON = { carne: '🥩', pescado: '🐟', vegetariano: '🌱', variable: '❔' };
const PROTEIN_FILTERS = [
  { id: ALL, label: 'Cualquiera' },
  { id: 'carne', label: '🥩 Con carne', short: 'Con carne' },
  { id: 'pescado', label: '🐟 Pescado o marisco', short: 'Pescado o marisco' },
  { id: 'vegetariano', label: '🌱 Sin carne ni pescado', short: 'Sin carne ni pescado' }
];

export function initDishes(data, credits = [], { storage = safeStorage(), speech = createSpeech() } = {}) {
  const section = byId('platos');
  if (!data?.dishes?.length) { section.hidden = true; return null; }

  const favorites = createFavoritesStore(storage, DISH_FAVORITES_KEY);
  favorites.prune(new Set(data.dishes.map(({ id }) => id)));
  const creditById = new Map(credits.map((credit) => [credit.dishId, credit]));
  const categoryLabels = new Map(data.categories.map(({ id, label }) => [id, label]));
  const state = { category: ALL, protein: ALL, query: '', view: 'photos' };

  byId('dishes-kicker').textContent = data.kicker;
  byId('dishes-title').textContent = data.title;
  byId('dishes-lead').textContent = data.lead;
  byId('dishes-disclaimer').textContent = data.disclaimer;
  section.hidden = false;

  const proteinText = (dish) => data.proteinLabels[dish.protein];
  const badge = (dish) => h('span', { class: `dish-protein is-${dish.protein}`, title: proteinText(dish) }, `${PROTEIN_ICON[dish.protein]} ${proteinText(dish)}`);
  const creditLine = (dish) => {
    const credit = creditById.get(dish.id);
    if (!credit) return null;
    return h('p', { class: 'dish-credit' }, 'Foto: ', externalLink(credit.sourcePage, `${credit.author} · ${credit.license}`));
  };

  const photoOf = (dish, className, sizes) => {
    const photo = dish.photos[0];
    if (!photo) return h('div', { class: `${className} is-empty`, 'aria-hidden': 'true', lang: 'ja' }, dish.ja);
    return h('img', { class: className, src: photo.src, srcset: photo.srcSet, sizes, alt: photo.alt, loading: 'lazy', decoding: 'async' });
  };

  // ----- full-screen detail sheet -----
  const modal = byId('dish-show');
  const showBody = byId('dish-show-body');
  let opener = null;
  const closeShow = () => {
    if (modal.hidden) return;
    speech.stop();
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('phrase-show-open');
    releaseOverlay('dish-show');
    opener?.focus?.();
    opener = null;
  };
  const openShow = (dish, trigger) => {
    opener = trigger;
    const listen = h('button', { type: 'button', class: 'phrase-btn', onclick: () => speech.speak(dish.ja) }, '🔊 Escuchar');
    listen.disabled = !speech.status().supported;
    showBody.replaceChildren(
      dish.photos[0] && photoOf(dish, 'dish-show-photo', '100vw'),
      h('p', { class: 'phrase-show-ja', lang: 'ja' }, dish.ja),
      h('p', { class: 'phrase-show-romaji' }, dish.romaji),
      h('p', { class: 'phrase-show-es' }, dish.es),
      h('p', { class: 'dish-show-description' }, dish.description),
      h('div', { class: 'dish-tags' }, badge(dish), dish.allergens.map((a) => h('span', { class: 'dish-allergen' }, data.allergenLabels[a]))),
      h('p', { class: 'dish-show-disclaimer' }, data.disclaimer),
      h('div', { class: 'phrase-show-actions' }, listen),
      creditLine(dish)
    );
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('phrase-show-open');
    openOverlay('dish-show', closeShow);
    modal.scrollTop = 0;
    byId('dish-show-close').focus();
  };
  modal.querySelectorAll('[data-close-dish]').forEach((node) => node.addEventListener('click', closeShow));
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeShow(); });

  // ----- cards -----
  const favoriteButton = (dish) => {
    const button = h('button', { type: 'button', class: 'phrase-fav dish-fav', 'aria-pressed': String(favorites.has(dish.id)), 'aria-label': `Favorito: ${dish.es}` }, '★');
    button.addEventListener('click', () => {
      favorites.toggle(dish.id);
      if (state.category === FAVORITES) render(); else { button.setAttribute('aria-pressed', String(favorites.has(dish.id))); renderChips(); }
    });
    return button;
  };
  const renderCard = (dish) => h('article', { class: 'dish-card', dataset: { dishId: dish.id, category: dish.category } },
    h('button', { type: 'button', class: 'dish-open', 'aria-label': `Ver ${dish.es} en pantalla grande`, onclick: (event) => openShow(dish, event.currentTarget) },
      photoOf(dish, 'dish-photo', '(max-width: 700px) 50vw, 25vw'),
      h('span', { class: 'dish-names' },
        h('span', { class: 'dish-ja', lang: 'ja' }, dish.ja),
        h('span', { class: 'dish-romaji' }, dish.romaji),
        h('span', { class: 'dish-es' }, dish.es)
      )
    ),
    h('div', { class: 'dish-meta' },
      badge(dish),
      dish.region && h('span', { class: 'dish-region' }, dish.region),
      favoriteButton(dish)
    )
  );

  // ----- chips, search, view -----
  const chipContainer = byId('dishes-chips');
  const proteinContainer = byId('dishes-protein');
  const chip = (id, label, current, onSelect, extra = {}) =>
    h('button', { type: 'button', class: 'filter phrase-chip', 'aria-pressed': String(current === id), dataset: extra, onclick: () => onSelect(id) }, label);
  const favButton = byId('dishes-fav');
  const filtersSummary = byId('dishes-filters-summary');
  const renderChips = () => {
    const categories = [{ id: ALL, label: 'Todos' }, ...data.categories];
    chipContainer.replaceChildren(...categories.map(({ id, label }) => chip(id, label, state.category, (value) => { state.category = value; render(); }, { dishCategory: id })));
    proteinContainer.replaceChildren(...PROTEIN_FILTERS.map(({ id, label }) => chip(id, label, state.protein, (value) => { state.protein = value; render(); }, { dishProtein: id })));
    favButton.textContent = `★ Favoritos (${favorites.all().size})`;
    favButton.setAttribute('aria-pressed', String(state.category === FAVORITES));
    const parts = [categories.find(({ id }) => id === state.category), PROTEIN_FILTERS.find(({ id }) => id === state.protein)]
      .filter((entry) => entry && entry.id !== ALL).map((entry) => entry.short ?? entry.label);
    filtersSummary.textContent = parts.length ? `Filtros · ${parts.join(' · ')}` : 'Filtros';
  };
  favButton.addEventListener('click', () => {
    state.category = state.category === FAVORITES ? ALL : FAVORITES;
    render();
  });

  const grid = byId('dishes-grid');
  const count = byId('dishes-count');
  const empty = byId('dishes-empty');
  function render() {
    renderChips();
    const visible = filterDishes(data.dishes, { ...state, favorites: favorites.all() });
    grid.className = `dish-grid is-${state.view}`;
    grid.replaceChildren(...visible.map(renderCard));
    count.textContent = `${visible.length} ${visible.length === 1 ? 'plato' : 'platos'}`;
    empty.hidden = visible.length > 0;
    empty.textContent = state.category === FAVORITES && !state.query && state.protein === ALL
      ? 'Aún no tienes favoritos. Pulsa la estrella ★ de un plato para guardarlo aquí.'
      : 'No hay platos que coincidan. Prueba con otra palabra o quita algún filtro.';
    document.querySelectorAll('[data-dish-view]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.dishView === state.view)));
  }
  byId('dishes-search').addEventListener('input', (event) => { state.query = event.target.value; render(); });
  document.querySelectorAll('[data-dish-view]').forEach((button) => button.addEventListener('click', () => { state.view = button.dataset.dishView; render(); }));

  // ----- photo credits -----
  const creditList = byId('dishes-credits-list');
  creditList.replaceChildren(...credits.map((credit) =>
    h('li', {}, `${credit.dishName}: `, externalLink(credit.sourcePage, credit.fileTitle.replace(/^File:/, '')), ` · ${credit.author} · ${credit.license}`)
  ));
  byId('dishes-credits').hidden = credits.length === 0;

  render();
  return { render };
}

function safeStorage() {
  return userStorage(); // favourites go through the single user-data layer
}
