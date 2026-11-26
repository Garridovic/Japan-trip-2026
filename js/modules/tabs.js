// City selector in the header: one button with the current city that opens a list.
// A list (instead of one tab per city) keeps the header the same size whether the trip has two cities or ten.
import { byId, h } from './dom.js';

export function initTabs(cities, onSelect) {
  const container = byId('city-tabs');
  const view = byId('city-view');
  let activeId = null;
  const label = h('span', { class: 'city-select-label' }, '');
  const select = h('button', {
    type: 'button',
    class: 'city-select',
    id: 'city-select',
    'aria-haspopup': 'listbox',
    'aria-expanded': 'false',
    'aria-controls': 'city-menu',
    'aria-label': 'Ciudad'
  }, label, h('span', { class: 'city-select-chevron', 'aria-hidden': 'true' }, '▾'));
  const options = cities.map((city) =>
    h('button', {
      type: 'button',
      role: 'option',
      id: `tab-${city.id}`,
      class: 'city-option',
      'aria-selected': 'false',
      tabindex: '-1',
      dataset: { city: city.id },
      onclick: () => { close(); onSelect(city.id); }
    }, city.name)
  );
  const menu = h('div', { class: 'city-menu', id: 'city-menu', role: 'listbox', 'aria-label': 'Ciudades del viaje', hidden: true }, ...options);
  container.replaceChildren(select, menu);
  container.hidden = options.length === 0;
  select.hidden = options.length < 2; // a single city needs no selector
  const names = new Map(cities.map((city) => [city.id, city.name]));

  function open() {
    menu.hidden = false;
    select.setAttribute('aria-expanded', 'true');
    (options.find((option) => option.dataset.city === activeId) ?? options[0])?.focus();
  }
  function close({ restoreFocus = false } = {}) {
    if (menu.hidden) return;
    menu.hidden = true;
    select.setAttribute('aria-expanded', 'false');
    if (restoreFocus) select.focus();
  }
  select.addEventListener('click', () => (menu.hidden ? open() : close()));
  container.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { close({ restoreFocus: true }); return; }
    if (menu.hidden && ['ArrowDown', 'ArrowUp'].includes(event.key) && document.activeElement === select) { event.preventDefault(); open(); return; }
    const current = options.findIndex((option) => option === document.activeElement);
    if (current < 0) return;
    const moves = { ArrowDown: current + 1, ArrowUp: current - 1, Home: 0, End: options.length - 1 };
    if (!(event.key in moves)) return;
    event.preventDefault();
    options[(moves[event.key] + options.length) % options.length].focus();
  });
  document.addEventListener('click', (event) => { if (!container.contains(event.target)) close(); });

  return {
    setActive(cityId) {
      activeId = cityId;
      label.textContent = names.get(cityId) ?? '';
      options.forEach((option) => {
        const isActive = option.dataset.city === cityId;
        option.setAttribute('aria-selected', String(isActive));
      });
      view.setAttribute('aria-labelledby', 'city-select');
    }
  };
}
