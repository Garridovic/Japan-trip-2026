// "Viaje" view: where we sleep, in order. Static data, so it also works offline.
import { taxiButton } from './taxi-ui.js';
import { byId, h, externalLink } from './dom.js';
import { nights, formatRange, formatDay, statusFor, copyText } from './lodging.js';
import { FIELDS, createPrivateStore, serializeBackup, parseBackup } from './private-notes.js';

const STATUS_LABEL = { current: 'Ahora', next: 'Próximo' };
const todayInJapan = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date());

export function initLodging(data, { today = todayInJapan(), clipboard = navigator.clipboard, storage = safeStorage(), win = window } = {}) {
  const section = byId('viaje');
  if (!data?.stays?.length) { section.hidden = true; return null; }
  section.hidden = false;
  byId('lodging-kicker').textContent = data.kicker;
  byId('lodging-title').textContent = data.title;
  byId('lodging-lead').textContent = data.lead;
  byId('lodging-privacy').textContent = data.privacyNote;

  const totalNights = data.stays.reduce((sum, stay) => sum + nights(stay.checkIn, stay.checkOut), 0);
  byId('lodging-count').textContent = `${data.stays.length} alojamientos · ${totalNights} noches`;

  const store = createPrivateStore(storage, new Set(data.stays.map(({ id }) => id)));

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

  // Private fields: typed here, saved on this device only (never sent anywhere).
  const printLines = (stay) => {
    const values = store.get(stay.id);
    return FIELDS.filter(({ id }) => values[id]).map(({ id, label }) => h('p', { class: 'lodging-print-line' }, h('strong', {}, `${label}: `), values[id]));
  };
  const refreshPrint = () => data.stays.forEach((stay) => {
    document.querySelector(`.lodging-card[data-stay-id="${stay.id}"] .lodging-print-private`)?.replaceChildren(...printLines(stay));
  });
  const privateBlock = (stay) => {
    const values = store.get(stay.id);
    const filled = FIELDS.some(({ id }) => values[id]);
    return h('details', { class: 'lodging-private', open: filled },
      h('summary', {}, '🔒 Datos privados (solo en este móvil)'),
      FIELDS.map(({ id, label, max }) => {
        const inputId = `private-${stay.id}-${id}`;
        const control = id === 'notes'
          ? h('textarea', { id: inputId, rows: 2, maxlength: max, autocomplete: 'off', spellcheck: 'false' })
          : h('input', { id: inputId, type: 'text', maxlength: max, autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', inputmode: id === 'pin' ? 'text' : 'text' });
        control.value = values[id] ?? '';
        control.addEventListener('input', () => { store.set(stay.id, id, control.value); refreshPrint(); });
        return h('label', { class: 'lodging-field', for: inputId }, h('span', {}, label), control);
      }),
      h('p', { class: 'muted small' }, 'Se guarda al escribir, solo en este dispositivo. No se sube a ningún sitio ni está en la web.')
    );
  };

  const renderList = () => byId('lodging-list').replaceChildren(...data.stays.map((stay) => {
    const status = statusFor(stay, today, data.stays);
    return h('article', { class: `lodging-card is-${status}`, dataset: { stayId: stay.id, city: stay.city } },
      h('div', { class: 'lodging-top' },
        h('span', { class: 'lodging-city' }, stay.cityName),
        STATUS_LABEL[status] && h('span', { class: 'lodging-status' }, STATUS_LABEL[status])
      ),
      h('p', { class: 'lodging-dates' }, formatRange(stay.checkIn, stay.checkOut), h('span', { class: 'lodging-nights' }, ` · ${nights(stay.checkIn, stay.checkOut)} ${nights(stay.checkIn, stay.checkOut) === 1 ? 'noche' : 'noches'}`)),
      h('h3', {}, stay.name),
      h('p', { class: 'lodging-address' }, stay.address),
      stay.checkInHint && h('p', { class: 'lodging-note' }, stay.checkInHint),
      stay.freeCancellationUntil && h('p', { class: 'lodging-note' }, `Cancelación gratuita hasta el ${formatDay(stay.freeCancellationUntil)}.`),
      stay.reminder && h('p', { class: 'lodging-note' }, stay.reminder),
      h('div', { class: 'lodging-actions' }, externalLink(stay.mapsUrl, 'Abrir en Google Maps ↗', 'lodging-map'), copyButton(stay), taxiButton({ stayId: stay.id, name: stay.name, city: stay.cityName })),
      privateBlock(stay),
      h('div', { class: 'lodging-print-private' }, printLines(stay)),
      h('p', { class: 'lodging-print-maps' }, `Mapa: ${stay.mapsUrl}`)
    );
  }));
  renderList();

  // Only this view can be saved as PDF: it opens the print view, which shows nothing else.
  byId('lodging-pdf').addEventListener('click', () => { refreshPrint(); win.print(); });
  win.addEventListener('beforeprint', refreshPrint);

  // Backup: export / import / clear. Files stay on the device.
  const status = byId('lodging-backup-status');
  const say = (text) => { status.textContent = text; };
  byId('lodging-export').addEventListener('click', () => {
    if (store.isEmpty()) return say('Todavía no hay datos privados que guardar.');
    const blob = new Blob([serializeBackup(store.all())], { type: 'application/json' });
    const link = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'japon-2026-datos-privados.json' });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    say('Copia exportada: el archivo está en tu dispositivo.');
  });
  byId('lodging-import').addEventListener('change', async (event) => {
    const [file] = event.target.files;
    event.target.value = '';
    if (!file) return;
    const result = parseBackup(await file.text(), new Set(data.stays.map(({ id }) => id)));
    if (!result.ok) return say(result.error);
    if (!win.confirm(`¿Importar la copia (${result.count} alojamientos con datos)? Sustituye los datos privados que tengas ahora en este móvil.`)) return;
    store.replace(result.stays);
    say(`Copia importada: ${result.count} alojamientos.`);
    renderList();
  });
  byId('lodging-clear').addEventListener('click', () => {
    if (!win.confirm('¿Borrar todos los PINs, reservas y notas guardados en este móvil? No se puede deshacer (si no tienes una copia de seguridad).')) return;
    store.clear();
    say('Datos privados borrados de este dispositivo.');
    renderList();
  });
  return { today, store };
}

function safeStorage() {
  try { return window.localStorage; } catch { return null; }
}
