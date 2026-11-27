// Feature onboarding: small coach marks shown once, at the moment each feature is first useful, so the user is never flooded.
//   Pure rules (`pickFlow`) + a tiny UI. Everything is best effort: any failure leaves the app exactly as it was.
// Rules: at most one tip per screen visit, never two within a minute, «Más tarde» waits for the next session,
// nothing while another dialog is open, and a tip is skipped when its target is not on screen.
import { h } from './dom.js';
import { addDays, localISO } from './trip-status.js';

export const STATE_KEY = 'onboarding-v1';
export const SESSION_GAP_MS = 30 * 60 * 1000;
export const MIN_SPACING_MS = 60 * 1000;
export const SHOW_DELAY_MS = 3000;
export const REPLAY_PARAM = 'onboarding';
export const ENABLE_KEY = 'onboarding-enabled'; // automated browsers (tests) stay free of coach marks unless this is '1'

/** Flows in priority order (the first eligible one wins the visit). `when` runs on the saved state; `target` is a CSS selector. */
export const FLOWS = Object.freeze([
  { id: 'taxi', view: 'viaje', label: 'Modo taxi', title: '🚕 Modo taxi', text: 'Al llegar, enseña tu hotel en pantalla grande, con el nombre en japonés, al conductor.', target: '#lodging-list [data-taxi]', action: { label: 'Probarlo ahora', click: true },
    when: (c) => c.eve },
  { id: 'tabs', view: 'guia', label: 'Pestañas de la guía', title: 'Tu guía, por pestañas', text: 'Desliza las pestañas para ver Día a día, Comer, Otros lugares y Consejos. La guía recuerda la última que abriste.', target: '#city-view .nav-inner',
    when: (c) => c.eve },
  { id: 'offline-map', view: 'mapa', label: 'Mapa sin conexión', title: 'Úsala sin conexión', text: 'La guía funciona sin internet. Guarda también el mapa antes de salir (mejor con wifi).', target: '#map-offline-button', action: { label: 'Guardar mapa', click: true },
    when: (c) => c.sessions >= 2 && c.mapOfflineState !== 'complete' },
  { id: 'checklists', view: 'viaje', label: 'Checklists', title: 'Prepara el viaje', text: 'Marca lo que ya tienes: el progreso se guarda en tu móvil.', target: '#checklist-bar',
    when: (c) => c.sessions >= 2 },
  { id: 'welcome', view: 'guia', label: 'Bienvenida y cambio de ciudad', title: '👋 Bienvenido a tu guía', text: 'Aquí cambias de ciudad: Tokio, Kioto, Osaka, Nara y Hakone. Todo el contenido cambia con ella.', target: '#city-tabs',
    when: (c) => c.sessions <= 1 },
  { id: 'map-filters', view: 'mapa', label: 'Mapa y filtros', title: 'Filtra lo que ves', text: 'Toca aquí para elegir tipo de lugar y jornada. Toca un punto del mapa para abrir su ficha.', target: '#map-filters-button',
    when: (c) => c.sessions <= 1 }
]);

const empty = () => ({ v: 1, sessions: 0, lastActive: 0, lastShown: 0, seen: {}, snoozed: {} });
export function readState(storage) {
  try { const state = JSON.parse(storage?.getItem(STATE_KEY) ?? 'null'); return state && state.v === 1 ? { ...empty(), ...state } : empty(); } catch { return empty(); }
}
export function writeState(storage, state) { try { storage?.setItem(STATE_KEY, JSON.stringify(state)); } catch { /* full or blocked */ } }

/** A new session starts when the app opens after more than 30 minutes without use. Returns the new state (never mutates). */
export function touchSession(state, now) {
  const fresh = !state.lastActive || now - state.lastActive > SESSION_GAP_MS || state.sessions === 0;
  return { ...state, sessions: fresh ? state.sessions + 1 : state.sessions, lastActive: now };
}

/** The day before the trip starts (or any day after): tabs and taxi are for people about to travel. */
export const isEve = (tripStart, today) => Boolean(tripStart) && today >= addDays(tripStart, -1);

/** Which flow to show on `view`, or null. `context`: { now, today, tripStart, mapOfflineState }. */
export function pickFlow(state, view, { now = Date.now(), today = localISO(new Date()), tripStart = '', mapOfflineState = '' } = {}) {
  if (state.lastShown && now - state.lastShown < MIN_SPACING_MS) return null;
  const context = { sessions: state.sessions, eve: isEve(tripStart, today), mapOfflineState };
  return FLOWS.find((flow) => flow.view === view && !state.seen[flow.id] && !(state.snoozed[flow.id] >= state.sessions) && flow.when(context)) ?? null;
}

const visible = (element) => Boolean(element) && !element.hidden && element.getClientRects().length > 0;

export function initOnboarding({ win = window, storage = null, tripStart = '', toast = () => {}, delayMs = SHOW_DELAY_MS } = {}) {
  const doc = win.document;
  try { storage = storage ?? win.localStorage; } catch { /* blocked */ }
  if (!storage) return null;
  if (win.navigator?.webdriver && storage.getItem(ENABLE_KEY) !== '1') return null;
  let state = touchSession(readState(storage), Date.now());
  writeState(storage, state);
  let tip = null;
  let timer = null;
  let currentView = null;

  const save = (patch) => { state = { ...state, ...patch }; writeState(storage, state); };
  const mapOfflineState = () => doc.getElementById('save-offline-map')?.dataset.state || '';
  const dialogOpen = () => [...doc.querySelectorAll('[role="dialog"]:not([hidden]), .account-popover:not([hidden])')].some((dialog) => !dialog.classList.contains('onb-tip') && dialog.getClientRects().length > 0 && win.getComputedStyle(dialog).visibility !== 'hidden');

  function close() { tip?.node.remove(); tip?.highlight?.classList.remove('onb-highlight'); win.removeEventListener('resize', tip?.place); doc.removeEventListener('scroll', tip?.place, true); tip = null; }

  /** The strip of screen the tip may use: below the header and above the bottom bar. */
  function safeArea() {
    const top = Math.max(8, doc.getElementById('top-bar')?.getBoundingClientRect().bottom ?? 0) + 8;
    const bar = doc.getElementById('app-bar')?.getBoundingClientRect();
    const bottom = (bar && bar.height > 0 ? bar.top : win.innerHeight) - 8;
    return { top, bottom };
  }

  /** Brings the target on screen (it may be thousands of pixels down the page) with room for the tip below it. */
  function reveal(target, tipHeight) {
    const { top, bottom } = safeArea();
    const rect = target.getBoundingClientRect();
    if (rect.top >= top && rect.bottom + tipHeight + 12 <= bottom) return;
    win.scrollBy({ top: rect.top - top - 12, behavior: 'instant' });
  }

  function place() {
    if (!tip) return;
    const node = tip.node;
    const { top: min, bottom: max } = safeArea();
    node.style.maxHeight = `${Math.max(120, max - min)}px`;
    const rect = tip.target.getBoundingClientRect();
    const height = node.offsetHeight;
    node.style.overflowY = node.scrollHeight > height + 1 ? 'auto' : 'visible'; // scroll inside only when there is truly no room (keeps the arrow visible otherwise)
    const below = max - rect.bottom - 10 >= height || rect.top - min - 10 < height;
    const wanted = below ? rect.bottom + 10 : rect.top - height - 10;
    node.style.top = `${Math.min(Math.max(wanted, min), Math.max(min, max - height))}px`;
    node.dataset.side = below ? 'below' : 'above';
    // Horizontally: centred under (or over) the target, kept inside the screen. On a phone the tip is as wide as the screen, so it just sits at the margin.
    const width = node.offsetWidth;
    const center = rect.left + rect.width / 2;
    const left = Math.min(Math.max(center - width / 2, 12), Math.max(12, win.innerWidth - 12 - width));
    node.style.left = `${left}px`;
    const arrow = Math.min(Math.max(center - left - 7, 16), width - 30);
    node.style.setProperty('--onb-arrow', `${arrow}px`);
  }

  function show(flow, { forced = false } = {}) {
    const target = doc.querySelector(flow.target);
    if (!visible(target)) { if (forced) toast('Esta ayuda no está disponible en esta pantalla ahora mismo.'); return false; }
    close();
    const done = (key) => () => { save({ [key]: { ...state[key], [flow.id]: key === 'seen' ? Date.now() : state.sessions } }); close(); };
    const buttons = [
      flow.action ? h('button', { type: 'button', class: 'filter is-primary', onclick: () => { done('seen')(); (flow.action.click ? target : null)?.click(); } }, flow.action.label) : null,
      h('button', { type: 'button', class: 'filter', onclick: done('seen') }, 'Entendido'),
      forced ? null : h('button', { type: 'button', class: 'filter onb-later', onclick: done('snoozed') }, 'Más tarde')
    ];
    const node = h('div', { class: 'onb-tip', role: 'dialog', 'aria-label': flow.title, dataset: { flow: flow.id } },
      h('strong', {}, flow.title), h('p', {}, flow.text), h('div', { class: 'onb-actions' }, buttons));
    doc.body.append(node);
    target.classList.add('onb-highlight');
    reveal(target, node.offsetHeight);
    tip = { node, target, highlight: target, place: () => win.requestAnimationFrame(place) };
    place();
    win.addEventListener('resize', tip.place);
    doc.addEventListener('scroll', tip.place, true);
    doc.addEventListener('keydown', function esc(event) { if (event.key === 'Escape' && tip?.node === node) { done('snoozed')(); doc.removeEventListener('keydown', esc); } });
    save({ lastShown: Date.now() });
    return true;
  }

  function onView(view) {
    currentView = view;
    close();
    win.clearTimeout(timer);
    state = touchSession(state, Date.now());
    writeState(storage, state);
    const forced = forcedId && FLOWS.find((flow) => flow.id === forcedId && flow.view === view);
    if (forced) {
      forcedId = null;
      timer = win.setTimeout(() => { if (currentView === view) show(forced, { forced: true }); }, 1200);
      return;
    }
    timer = win.setTimeout(() => {
      if (currentView !== view || dialogOpen()) return;
      const flow = pickFlow(state, view, { tripStart, mapOfflineState: mapOfflineState() });
      if (flow) show(flow);
    }, delayMs);
  }

  // «Cómo funciona» (in the account panel) sends people here with ?onboarding=<id>: show that tip once, then clean the URL.
  let forcedId = null;
  try {
    const url = new URL(win.location.href);
    if (url.searchParams.has(REPLAY_PARAM)) {
      forcedId = url.searchParams.get(REPLAY_PARAM);
      url.searchParams.delete(REPLAY_PARAM);
      win.history.replaceState(win.history.state, '', url);
    }
  } catch { /* ignore */ }

  return { onView, close };
}
