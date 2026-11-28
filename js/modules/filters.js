// Restaurants ("Comer") and alternative places ("Otros lugares") sections, with their filters.
import { artBanner, foodArtKind, extraArtKind } from './placeholder-art.js';
import { byId, h, externalLink, setPressed } from './dom.js';

const filterButton = (className, dataKey, { value, label }, pressed) =>
  h('button', { class: `filter ${className}`, type: 'button', 'aria-pressed': String(pressed), dataset: { [dataKey]: value } }, label);

/** Google Maps directions to a place; the city is added so a short name resolves to the right one. */
export const directionsUrl = (name, context) => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(context ? `${name}, ${context}` : name)}&travelmode=transit`;

const FOOD_CONTAINERS = ['food-highlights', 'food-day-filters', 'food-type-filters', 'food-grid', 'food-note', 'food-count'];

export function renderFood(food, restaurants, queryContext = '') {
  if (!food || restaurants.length === 0) {
    FOOD_CONTAINERS.forEach((id) => byId(id).replaceChildren());
    return;
  }
  byId('food-title').textContent = food.title;
  const highlights = byId('food-highlights');
  highlights.setAttribute('aria-label', food.highlightsLabel);
  highlights.replaceChildren(...food.highlights.map((item) =>
    h('article', { class: 'food-highlight' }, h('strong', {}, item.title), h('p', {}, item.text))
  ));

  const dayContainer = byId('food-day-filters');
  const typeContainer = byId('food-type-filters');
  dayContainer.replaceChildren(...food.dayFilters.map((filter, index) => filterButton('food-day-filter', 'foodDay', filter, index === 0)));
  typeContainer.replaceChildren(...food.typeFilters.map((filter, index) => filterButton('food-type-filter', 'foodType', filter, index === 0)));

  const cards = restaurants.map((item) =>
    h('article', { class: 'food-card', dataset: { foodCategory: item.foodCategory, foodDay: item.day, foodId: item.id } },
      item.photo ? null : artBanner(foodArtKind(item)),
      h('div', { class: 'food-card-top' }, h('span', { class: 'food-type' }, item.foodTypeLabel), h('span', { class: 'food-day' }, item.dayLabel)),
      h('h3', {}, item.name),
      h('p', {}, item.desc),
      h('div', { class: 'food-meta' }, item.note),
      h('div', { class: 'food-actions' },
        externalLink(directionsUrl(item.query ?? item.name, queryContext), 'Cómo llegar', 'primary-action'),
        externalLink(item.mapsUrl, 'Ver en Google Maps ↗', 'secondary'),
        (item.links ?? []).map((link) => externalLink(link.url, link.label, 'secondary'))
      )
    )
  );
  byId('food-grid').replaceChildren(...cards);
  const note = byId('food-note');
  note.replaceChildren(h('strong', {}, food.note.label), ` ${food.note.text}`);

  const count = byId('food-count');
  count.textContent = `Mostrando ${cards.length} lugares.`;
  let selectedDay = 'todos';
  let selectedType = 'todos';
  const apply = () => {
    let visible = 0;
    cards.forEach((card) => {
      const matches = (selectedDay === 'todos' || card.dataset.foodDay === selectedDay) &&
        (selectedType === 'todos' || card.dataset.foodCategory === selectedType);
      card.hidden = !matches;
      if (matches) visible += 1;
    });
    count.textContent = `Mostrando ${visible} de ${cards.length} lugares.`;
  };
  const bind = (container, key, assign) => {
    const buttons = [...container.children];
    buttons.forEach((button) => button.addEventListener('click', () => {
      assign(button.dataset[key]);
      setPressed(buttons, (item) => item === button);
      apply();
    }));
  };
  bind(dayContainer, 'foodDay', (value) => { selectedDay = value; });
  bind(typeContainer, 'foodType', (value) => { selectedType = value; });
}

export function renderExtras(extras, categories, queryContext = '') {
  const toolbar = byId('extras-toolbar');
  const grid = byId('extras-grid');
  if (!extras?.items?.length) {
    toolbar.replaceChildren();
    grid.replaceChildren();
    return;
  }
  const cards = extras.items.map((item) =>
    h('article', { class: 'extra-card', dataset: { category: item.category } },
      item.photo ? null : artBanner(extraArtKind(item)),
      h('span', { class: 'extra-tag' }, item.tag), h('h3', {}, item.name), h('p', {}, item.desc),
      h('div', { class: 'food-actions' }, externalLink(directionsUrl(item.name, queryContext), 'Cómo llegar', 'primary-action')))
  );
  grid.replaceChildren(...cards);
  const filters = [{ value: 'todos', label: 'Todos' }, ...categories.map(({ id, label }) => ({ value: id, label }))];
  const buttons = filters.map((filter, index) => filterButton('', 'filter', filter, index === 0));
  toolbar.replaceChildren(...buttons);
  buttons.forEach((button) => button.addEventListener('click', () => {
    const selected = button.dataset.filter;
    setPressed(buttons, (item) => item === button);
    cards.forEach((card) => { card.hidden = selected !== 'todos' && card.dataset.category !== selected; });
  }));
}
