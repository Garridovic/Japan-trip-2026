// "Modo taxi": full-screen hotel name and address in big Japanese, to show to a driver.
// Any module can place a button with `taxiButton(...)`; one delegated listener opens the screen.
import { byId, h } from './dom.js';
import { openOverlay, releaseOverlay } from './overlay-history.js';
import { findStay, taxiModel, telHref } from './taxi.js';

const OVERLAY = 'taxi-show';

/** A button that opens the taxi screen for a hotel. `stayId` or `name` identify the stay; `city` and `address` are fallbacks. */
export const taxiButton = ({ stayId, name, city, label = '🚕 Enseñar al taxista', className = 'filter taxi-button' }) =>
  h('button', { type: 'button', class: className, 'data-taxi': '', 'data-taxi-stay': stayId, 'data-taxi-name': name, 'data-taxi-city': city, 'aria-label': `Modo taxi: ${name ?? 'hotel'}` }, label);

export function initTaxi(stays, { clipboard = navigator.clipboard } = {}) {
  const modal = byId('taxi-show');
  const body = byId('taxi-show-body');
  let opener = null;

  const close = () => {
    if (modal.hidden) return;
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('phrase-show-open');
    releaseOverlay(OVERLAY);
    opener?.focus?.();
    opener = null;
  };

  function render(model) {
    const copy = h('button', { type: 'button', class: 'phrase-btn is-slow taxi-copy' }, 'Copiar dirección');
    copy.addEventListener('click', async () => {
      try { await clipboard.writeText(model.copyText); copy.textContent = 'Copiada ✓'; } catch { copy.textContent = 'No se pudo copiar'; }
      setTimeout(() => { copy.textContent = 'Copiar dirección'; }, 2200);
    });
    body.replaceChildren(
      h('div', { class: 'taxi-main' },
        h('p', { class: 'taxi-ask', lang: 'ja' }, 'この住所までお願いします'),
        h('p', { class: 'taxi-name', lang: model.nameJa ? 'ja' : 'en' }, model.nameJa || model.name),
        h('p', { class: 'taxi-address', lang: model.addressJa ? 'ja' : 'en' }, model.addressJa || model.address),
        !model.hasJapanese && h('p', { class: 'taxi-missing' }, 'Aún no hay nombre ni dirección en japonés para este hotel: enseña el mapa.'),
        h('p', { class: 'taxi-es' }, model.name, model.city ? ` · ${model.city}` : ''),
        model.hasJapanese && h('p', { class: 'taxi-latin' }, model.address)),
      h('div', { class: 'taxi-side' },
        h('div', { class: 'phrase-show-actions taxi-actions' },
          h('a', { class: 'phrase-btn taxi-directions', href: model.mapsUrl, target: '_blank', rel: 'noopener' }, 'Cómo llegar'),
          copy,
          model.phone && h('a', { class: 'phrase-btn is-slow taxi-call', href: telHref(model.phone), 'aria-label': `Llamar al hotel: ${model.phone}` }, '📞 Llamar'))));
  }

  function open(target, trigger = null) {
    const stay = findStay(stays, { id: target.stayId, name: target.name });
    render(taxiModel(stay, { name: target.name, city: target.city }));
    opener = trigger;
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('phrase-show-open');
    openOverlay(OVERLAY, close);
    byId('taxi-show-close').focus();
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest?.('[data-taxi]');
    if (!button) return;
    event.preventDefault();
    open({ stayId: button.dataset.taxiStay, name: button.dataset.taxiName, city: button.dataset.taxiCity }, button);
  });
  byId('taxi-show-close').addEventListener('click', close);
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') close(); });
  return { open, close };
}
