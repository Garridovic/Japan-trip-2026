// "Versión de la app" block for the settings screen: the version on screen, the newest published one, and two buttons.
// It talks to updates.js only through events (`updates:request` out, `updates:status` in), so the settings screen can show it
// without importing the updater, and it keeps working if the updater is not there (the rows stay on "—").
import { h } from './dom.js';
import { describeCheck } from './updates.js';

export function formatChecked(at, now = Date.now()) {
  if (!at) return 'todavía no';
  const minutes = Math.round((now - at) / 60000);
  if (minutes < 1) return 'ahora mismo';
  if (minutes < 60) return `hace ${minutes} min`;
  return new Date(at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

export function updateSection({ doc = document } = {}) {
  const installed = h('dd', { id: 'settings-version-installed' }, '—');
  const published = h('dd', { id: 'settings-version-published' }, '—');
  const checked = h('dd', { id: 'settings-version-checked' }, 'todavía no');
  const message = h('p', { id: 'settings-version-message', role: 'status', 'aria-live': 'polite' }, '');
  const request = (action) => doc.dispatchEvent(new CustomEvent('updates:request', { detail: { action } }));
  const check = h('button', { type: 'button', class: 'filter', id: 'settings-update-check', onclick: () => request('check') }, 'Buscar actualización');
  const force = h('button', { type: 'button', class: 'filter is-danger', id: 'settings-update-force', onclick: () => request('force') }, 'Forzar actualización');

  function paint({ running, latest, result, checkedAt, applying }) {
    installed.textContent = running ?? '—';
    published.textContent = latest ?? '—';
    checked.textContent = formatChecked(checkedAt);
    message.textContent = applying ? 'Actualizando…' : result === 'new' ? `Hay una versión nueva (${latest}). Pulsa «Actualizar» en el aviso o fuerza la actualización.` : (result && result !== 'unknown' ? describeCheck(result) : '');
    check.disabled = Boolean(applying);
    force.disabled = Boolean(applying);
    force.textContent = applying ? 'Actualizando…' : 'Forzar actualización';
  }
  doc.addEventListener('updates:status', (event) => paint(event.detail ?? {}));
  request('status');

  return h('section', { class: 'account-section', id: 'settings-version' },
    h('h3', { class: 'account-subtitle' }, 'Versión de la app'),
    h('div', { class: 'account-group' },
      h('dl', { class: 'settings-facts' },
        h('dt', {}, 'Instalada'), installed,
        h('dt', {}, 'Publicada'), published,
        h('dt', {}, 'Última comprobación'), checked),
      message,
      h('div', { class: 'account-actions' }, check, force),
      h('p', { class: 'settings-hint' }, 'Si la app no se actualiza sola, «Forzar actualización» borra la copia guardada y la vuelve a descargar entera. Necesita conexión; tus favoritos y datos privados no se borran.')));
}
