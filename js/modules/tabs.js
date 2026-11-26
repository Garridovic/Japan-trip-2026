// Top-level city tabs, generated from the enabled cities of the journey.
import { byId, h } from './dom.js';

export function initTabs(cities, onSelect) {
  const container = byId('city-tabs');
  const view = byId('city-view');
  const tabs = cities.map((city) =>
    h('button', {
      type: 'button',
      role: 'tab',
      id: `tab-${city.id}`,
      class: 'city-tab',
      'aria-controls': 'city-view',
      'aria-selected': 'false',
      tabindex: '-1',
      dataset: { city: city.id },
      onclick: () => onSelect(city.id)
    }, city.name)
  );
  container.replaceChildren(...tabs);
  container.hidden = tabs.length === 0;

  container.addEventListener('keydown', (event) => {
    const current = tabs.findIndex((tab) => tab === document.activeElement);
    if (current < 0) return;
    const moves = { ArrowRight: current + 1, ArrowLeft: current - 1, Home: 0, End: tabs.length - 1 };
    if (!(event.key in moves)) return;
    event.preventDefault();
    const next = tabs[(moves[event.key] + tabs.length) % tabs.length];
    next.focus();
    onSelect(next.dataset.city);
  });

  return {
    setActive(cityId) {
      tabs.forEach((tab) => {
        const isActive = tab.dataset.city === cityId;
        tab.setAttribute('aria-selected', String(isActive));
        tab.tabIndex = isActive ? 0 : -1;
        if (isActive) tab.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
      });
      view.setAttribute('aria-labelledby', `tab-${cityId}`);
    }
  };
}
