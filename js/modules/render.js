// Renders the content of the active city (and the shared global content) into the static page shell.
import { byId, h, externalLink } from './dom.js';
import { connectionsFrom } from './journey.js';
import { renderFood, renderExtras } from './filters.js';

const setSectionVisible = (id, visible) => {
  byId(id).hidden = !visible;
  document.querySelector(`[data-nav-section="${id}"]`)?.toggleAttribute('hidden', !visible);
};

function renderHero(journey, cityEntry, city) {
  byId('hero-eyebrow').textContent = journey.eyebrow ?? journey.title;
  byId('hero-title').textContent = cityEntry.name;
  byId('hero-subtitle').textContent = city.hero.subtitle;
  byId('hero-meta').replaceChildren(...city.hero.meta.map((text) => h('span', {}, text)));
  const hotel = byId('hero-hotel');
  hotel.hidden = !city.hero.hotel;
  hotel.replaceChildren();
  if (city.hero.hotel) {
    hotel.replaceChildren(
      'Alojamiento: ', h('strong', {}, city.hero.hotel.name), ' · ',
      externalLink(city.hero.hotel.mapUrl, 'Ver hotel en Google Maps ↗')
    );
  }
  document.querySelectorAll('[data-city-name]').forEach((node) => { node.textContent = cityEntry.name; });
  byId('poi-kicker').textContent = `GUÍA DE ${cityEntry.name.toUpperCase()}`;
  document.title = city.pageTitle;
  document.querySelector('meta[name="description"]')?.setAttribute('content', city.description);
}

function renderRoute(stops) {
  const route = h('p', { class: 'route' });
  stops.forEach((stop, index) => {
    if (index > 0) route.append(' ', h('span', {}, '→'), ' ');
    route.append(stop);
  });
  return route;
}

function renderItinerary(itinerary) {
  const days = itinerary.days.filter((day) => day.quick && day.detail);
  byId('quick-grid').replaceChildren(...days.map(({ key, quick }) =>
    h('article', { class: 'quick-card' },
      h('div', { class: 'quick-top' }, h('span', { class: 'date' }, quick.date), h('span', { class: 'zone' }, quick.zone)),
      h('h3', {}, quick.title),
      renderRoute(quick.route),
      h('div', { class: 'quick-foot' }, h('small', {}, quick.note), h('a', { class: 'text-link', href: `#dia${key}` }, 'Ver detalle ↓'))
    )
  ));
  const note = byId('quick-note');
  note.hidden = !itinerary.summaryNote;
  note.textContent = itinerary.summaryNote ?? '';

  byId('day-list').replaceChildren(...days.map(({ key, detail }) =>
    h('details', { class: 'day-detail', id: `dia${key}` },
      h('summary', {},
        h('span', { class: 'day-number' }, key, h('small', {}, detail.dayOfWeek)),
        h('span', { class: 'summary-copy' }, h('h3', {}, detail.title), h('span', { class: 'muted' }, detail.summary)),
        h('span', { class: 'chevron' }, '⌄')
      ),
      h('div', { class: 'detail-body' },
        h('p', { class: 'detail-lead' }, detail.lead),
        h('div', { class: 'stops' }, detail.stops.map((stop) =>
          h('div', { class: 'stop' }, h('span', { class: 'time' }, stop.time), h('div', {}, h('strong', {}, stop.title), h('p', {}, stop.text), stop.suggestion && h('p', { class: 'stop-suggestion' }, h('strong', {}, 'Sugerencia: '), stop.suggestion)))
        )),
        detail.highlight && h('div', { class: 'highlight' }, h('strong', {}, detail.highlight.label), ` ${detail.highlight.text}`),
        h('div', { class: 'detail-bottom' },
          h('span', { class: 'transport' }, h('strong', {}, 'Desplazamientos:'), ` ${detail.transport}`),
          externalLink(detail.mapUrl, 'Abrir recorrido ↗', 'map-link')
        )
      )
    )
  ));
}

function renderConnections(journey, cityId) {
  byId('connection-notes').replaceChildren(...connectionsFrom(journey, cityId).map((connection) =>
    h('div', { class: 'note-card connection-card' }, h('h3', {}, connection.title), h('p', {}, connection.note))
  ));
}

function renderTips(tips) {
  setSectionVisible('practico', Boolean(tips?.items?.length));
  if (!tips?.items?.length) return byId('notes-grid').replaceChildren();
  byId('tips-kicker').textContent = tips.kicker;
  byId('tips-title').textContent = tips.title;
  byId('notes-grid').replaceChildren(...tips.items.map((tip) =>
    h('article', { class: 'note-card' }, h('h3', {}, tip.title), h('p', {}, tip.text))
  ));
}

function renderSources(sources) {
  setSectionVisible('fuentes', Boolean(sources?.items?.length));
  if (!sources?.items?.length) return byId('sources-card').replaceChildren();
  byId('sources-card').replaceChildren(
    h('summary', {}, sources.summary),
    h('ul', {}, sources.items.map((item) => h('li', {}, externalLink(item.href, item.label)))),
    h('p', { class: 'muted' }, sources.note)
  );
}

function renderFooter(city) {
  byId('footer-label').textContent = city.footerLabel;
  byId('footer-kml').hidden = !city.kml;
  if (city.kml) byId('footer-kml-link').setAttribute('href', city.kml);
}

export function renderCity({ journey, cityEntry, bundle, global }) {
  renderHero(journey, cityEntry, bundle.city);
  renderItinerary(bundle.itinerary);
  renderConnections(journey, cityEntry.id);
  renderFood(bundle.food, bundle.restaurants, bundle.city.map.queryContext);
  setSectionVisible('comer', Boolean(bundle.food && bundle.restaurants.length));
  renderExtras(bundle.extras, bundle.city.map.alternativeCategories ?? [], bundle.city.map.queryContext);
  setSectionVisible('alternativas', Boolean(bundle.extras?.items?.length));
  renderTips(global.tips);
  renderSources(bundle.sources);
  renderFooter(bundle.city);
}
