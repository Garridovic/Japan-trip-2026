// "Viaje" view: where we sleep, in order. Static data, so it also works offline.
import { byId, h, externalLink } from './dom.js';
import { nights, formatRange, formatDay, statusFor, copyText } from './lodging.js';

const STATUS_LABEL = { current: 'Ahora', next: 'Próximo' };
const todayInJapan = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date());

export function initLodging(data, { today = todayInJapan(), clipboard = navigator.clipboard } = {}) {
  const section = byId('viaje');
  if (!data?.stays?.length) { section.hidden = true; return null; }
  section.hidden = false;
  byId('lodging-kicker').textContent = data.kicker;
  byId('lodging-title').textContent = data.title;
  byId('lodging-lead').textContent = data.lead;
  byId('lodging-privacy').textContent = data.privacyNote;

  const totalNights = data.stays.reduce((sum, stay) => sum + nights(stay.checkIn, stay.checkOut), 0);
  byId('lodging-count').textContent = `${data.stays.length} alojamientos · ${totalNights} noches`;

  const copyButton = (stay) => {
    const button = h('button', { type: 'button', class: 'filter lodging-copy', 'aria-label': `Copiar dirección de ${stay.name}` }, 'Copiar dirección');
    button.addEventListener('click', async () => {
      try {
        await clipboard.writeText(copyText(stay));
        button.textContent = 'Dirección copiada ✓';
      } catch {
        button.textContent = 'No se pudo copiar';
      }
      setTimeout(() => { button.textContent = 'Copiar dirección'; }, 2500);
    });
    return button;
  };

  byId('lodging-list').replaceChildren(...data.stays.map((stay) => {
    const status = statusFor(stay, today, data.stays);
    return h('article', { class: `lodging-card is-${status}`, dataset: { stayId: stay.id, city: stay.city } },
      h('div', { class: 'lodging-top' },
        h('span', { class: 'lodging-city' }, stay.cityName),
        STATUS_LABEL[status] && h('span', { class: 'lodging-status' }, STATUS_LABEL[status])
      ),
      h('p', { class: 'lodging-dates' }, formatRange(stay.checkIn, stay.checkOut), h('span', { class: 'lodging-nights' }, ` · ${nights(stay.checkIn, stay.checkOut)} ${nights(stay.checkIn, stay.checkOut) === 1 ? 'noche' : 'noches'}`)),
      h('h3', {}, stay.name),
      h('p', { class: 'lodging-address' }, stay.address),
      stay.freeCancellationUntil && h('p', { class: 'lodging-note' }, `Cancelación gratuita hasta el ${formatDay(stay.freeCancellationUntil)}.`),
      stay.reminder && h('p', { class: 'lodging-note' }, stay.reminder),
      h('div', { class: 'lodging-actions' }, externalLink(stay.mapsUrl, 'Abrir en Google Maps ↗', 'lodging-map'), copyButton(stay))
    );
  }));
  return { today };
}
