// Optional account: sign in with Google (Auth0) to keep visited places, favourites and the checklist in the cloud.
// The guide is complete without it. Everything here is best effort: any failure leaves the app exactly as anonymous.
import { byId, h } from './dom.js';
import { openOverlay, releaseOverlay } from './overlay-history.js';
import { toast } from './feedback.js';
import { SYNCED_KEYS } from './user-data.js';
import { createCloudSync, SAVE_DELAY_MS, BACKUP_KEY, LAST_SYNC_KEY } from './cloud-sync.js';
import { createAuth, isConfigured, isAdmin } from './auth.js';
import { updateSection } from './update-settings.js';
import { loadNotices, publishNotices, buildNotice, publishErrorText, MAX_TITLE, MAX_TEXT } from './notices.js';

/** What the user can reset one by one. `empty` is the value stored for "nothing" (the same shape the stores write). */
export const RESETS = Object.freeze([
  { id: 'visited', key: 'visited-v1', empty: '{}', button: 'Restablecer lugares visitados', title: '¿Restablecer los lugares visitados?', done: 'Lugares visitados restablecidos.' },
  { id: 'phrases', key: 'japan-trip:phrase-favorites', empty: '[]', button: 'Restablecer frases favoritas', title: '¿Restablecer las frases favoritas?', done: 'Frases favoritas restablecidas.' },
  { id: 'dishes', key: 'japan-trip:dish-favorites', empty: '[]', button: 'Restablecer platos favoritos', title: '¿Restablecer los platos favoritos?', done: 'Platos favoritos restablecidos.' }
]);
const RESET_DONE_KEY = 'account-reset-done';

const INVITE_DISMISSED_KEY = 'account-invite-dismissed';
const STARTUP_WAIT_MS = 1500;

/** "Hola, Alex": first name from Google, or the start of the name, or nothing. */
export function greetingName(user) {
  const name = (user?.given_name || user?.name || '').trim().split(/\s+/)[0];
  return name || '';
}

export function statusText(state, { online = true, lastSyncAt = 0, now = Date.now() } = {}) {
  if (state === 'syncing') return 'Sincronizando…';
  if (state === 'pending') return online ? 'Hay cambios sin enviar. Se reintentará enseguida.' : 'Sin internet: los cambios se enviarán a tu cuenta cuando vuelva la conexión. Nada se pierde.';
  if (state === 'signed-out') return 'La sesión ha caducado. Vuelve a entrar para seguir sincronizando.';
  if (state === 'error') return 'No se ha podido sincronizar. La guía sigue funcionando con los datos de este dispositivo.';
  if (!lastSyncAt) return 'Sincronizado';
  const minutes = Math.max(0, Math.round((now - lastSyncAt) / 60000));
  if (minutes < 1) return 'Sincronizado · ahora mismo';
  if (minutes < 60) return `Sincronizado · hace ${minutes} min`;
  return `Sincronizado · hace ${Math.round(minutes / 60)} h`;
}

const googleLogo = () => {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 48 48');
  svg.setAttribute('aria-hidden', 'true');
  [['#EA4335', 'M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.2C12.4 13.6 17.7 9.5 24 9.5z'],
    ['#4285F4', 'M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.6 5.9c4.4-4.1 7-10.1 7-17.6z'],
    ['#FBBC05', 'M10.5 28.6a14.5 14.5 0 0 1 0-9.2l-7.9-6.2a24 24 0 0 0 0 21.6l7.9-6.2z'],
    ['#34A853', 'M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.3-8.3 2.3-6.3 0-11.6-4.1-13.5-9.9l-7.9 6.2C6.5 42.6 14.6 48 24 48z']]
    .forEach(([fill, d]) => { const path = document.createElementNS(ns, 'path'); path.setAttribute('fill', fill); path.setAttribute('d', d); svg.append(path); });
  return svg;
};
const personIcon = () => {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const circle = document.createElementNS(ns, 'circle'); circle.setAttribute('cx', '12'); circle.setAttribute('cy', '8.5'); circle.setAttribute('r', '3.6');
  const body = document.createElementNS(ns, 'path'); body.setAttribute('d', 'M4.5 20c.8-3.9 3.9-6 7.5-6s6.7 2.1 7.5 6');
  svg.append(circle, body);
  return svg;
};

export async function initAccount({ config, userData, win = window, storage = null, proximity = null } = {}) {
  const button = byId('account-button');
  const popover = byId('account-popover');
  if (!isConfigured(config) || !button || !popover) return null;
  try { storage = storage ?? win.localStorage; } catch { /* blocked */ }

  let auth = null;
  let sync = null;
  let status = { state: 'synced', lastSyncAt: 0 };
  let view = 'main'; // 'main' | 'logout' | 'reset'
  let resetItem = null;
  let versionNode = null; // the "Versión de la app" block, created once
  let started = false;
  // administrator form state (declared up here: render() can run before the code below is reached)
  const adminDraft = { titulo: '', texto: '', dias: '7' };
  let adminCurrent = null; // the notice now published (null = none)
  let adminMessage = '';
  let adminBusy = false;
  let adminRead = false;
  let busy = false;
  const online = () => win.navigator.onLine !== false;

  try {
    auth = await createAuth(config);
    await auth?.init();
  } catch (error) { console.warn('[account] sign-in unavailable', error); auth = null; }

  const user = auth?.user ?? null;
  if (auth?.callbackError) toast('No se ha podido iniciar sesión. Inténtalo de nuevo.');

  if (user) {
    sync = createCloudSync({
      domain: config.domain, userId: user.sub, userData, storage, getToken: () => auth.getToken(),
      onStatus: (next) => { status = next; render(); },
      onRemoteChanges: () => { if (started) toast('Se han traído cambios de tu cuenta.', { actionLabel: 'Actualizar', onAction: () => win.location.reload(), duration: 15000 }); else render(); }
    });
    userData.connect(sync.backend, { delayMs: SAVE_DELAY_MS });
    win.addEventListener('online', () => sync.resume());
    win.document.addEventListener('visibilitychange', () => {
      if (win.document.visibilityState === 'hidden') { if (userData.hasPendingSave()) userData.flush(); } else sync.resume();
    });
    win.addEventListener('pagehide', () => { if (userData.hasPendingSave()) userData.flush(); });
    // Local first: wait only briefly so a good connection gets merged data before the stores read it; a slow one finishes later.
    const first = sync.reconcile();
    await Promise.race([first, new Promise((resolve) => setTimeout(resolve, STARTUP_WAIT_MS))]);
  }

  // ---------- view ----------
  function renderButton() {
    button.hidden = false;
    win.document.body.classList.add('has-account'); // lets the header shrink its buttons on a 320 px phone
    button.dataset.state = user ? 'signed-in' : 'anonymous';
    button.dataset.sync = user ? status.state : '';
    button.setAttribute('aria-label', user ? `Cuenta de ${greetingName(user) || 'Google'}` : 'Cuenta (sin sesión)');
    button.replaceChildren();
    if (!user) { button.append(personIcon()); return; }
    const initial = (greetingName(user)[0] || '?').toUpperCase();
    const fallback = () => h('span', { class: 'account-avatar' }, initial);
    if (user.picture) {
      const image = h('img', { class: 'account-avatar', src: user.picture, alt: '', referrerpolicy: 'no-referrer', width: 44, height: 44 });
      image.addEventListener('error', () => image.replaceWith(fallback()));
      button.append(image);
    } else button.append(fallback());
    button.append(h('span', { class: 'account-dot', 'aria-hidden': 'true' }));
  }

  function renderGreeting() {
    const greeting = byId('account-greeting');
    if (!greeting) return;
    const name = greetingName(user);
    greeting.hidden = !name;
    greeting.textContent = name ? `Hola, ${name}` : '';
  }

  function privacy() { return h('p', {}, '🔒 Los PINs y las reservas del alojamiento nunca salen de este dispositivo.'); }
  function signInButton() { return h('button', { type: 'button', class: 'filter account-google', onclick: () => signIn(false), disabled: !online() || !auth }, googleLogo(), 'Entrar con Google'); }

  /** «Entrar»: Auth0's normal login page (no connection forced), so every enabled way of signing in is offered. */
  function signInPromptButton() { return h('button', { type: 'button', class: 'filter account-enter', onclick: () => signIn(true), disabled: !online() || !auth }, 'Entrar'); }

  function resetButtons() {
    return RESETS.map((item) => h('button', { type: 'button', class: 'filter', onclick: () => { resetItem = item; view = 'reset'; render(); } }, item.button));
  }

  /** Writes "nothing" through the user-data layer (so it syncs like any change), sends it, and reloads so every screen re-reads it. */
  async function resetData(item) {
    busy = true; render();
    try {
      userData.storage.setItem(item.key, item.empty);
      if (sync && online()) await Promise.race([userData.flush(), new Promise((resolve) => setTimeout(resolve, 4000))]);
      try { win.sessionStorage.setItem(RESET_DONE_KEY, item.done); } catch { /* ignore */ }
    } finally { win.location.reload(); }
  }

  function chevron() {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('class', 'account-chevron');
    const path = document.createElementNS(ns, 'path'); path.setAttribute('d', 'm9 6 6 6-6 6'); svg.append(path);
    return svg;
  }
  function backIcon() {
    const svg = chevron(); svg.setAttribute('class', 'account-back-icon');
    svg.firstChild.setAttribute('d', 'm15 6-6 6 6 6');
    return svg;
  }
  /** A titled card, like the sections of a settings screen. */
  function section(title, ...nodes) { return h('section', { class: 'account-section' }, h('h3', { class: 'account-subtitle' }, title), h('div', { class: 'account-group' }, ...nodes)); }
  function resetRows() { return RESETS.map((item) => h('button', { type: 'button', class: 'account-row', onclick: () => { resetItem = item; view = 'reset'; render(); } }, h('span', {}, item.button), chevron())); }
  /** The whole panel is a screen of its own: a bar with the back arrow, then the scrolling sections. */
  function screen(...body) {
    popover.append(
      h('div', { class: 'account-bar' },
        h('button', { type: 'button', class: 'account-back', 'aria-label': 'Volver', onclick: () => { if (view === 'main') setOpen(false); else { view = 'main'; resetItem = null; render(); } } }, backIcon()),
        h('h2', {}, 'Cuenta y ajustes')),
      h('div', { class: 'account-body' }, ...body));
  }

  function renderPopover() {
    popover.replaceChildren();
    if (view === 'reset' && resetItem) {
      screen(section(resetItem.title,
        h('p', {}, user ? 'Se borrarán en este dispositivo y también en tu cuenta, y dejarán de aparecer en tus otros dispositivos. No se puede deshacer.' : 'Se borrarán en este dispositivo. No se puede deshacer.'),
        h('div', { class: 'account-actions' },
          h('button', { type: 'button', class: 'filter is-danger', onclick: () => resetData(resetItem), disabled: busy }, 'Restablecer'),
          h('button', { type: 'button', class: 'filter', onclick: () => { view = 'main'; resetItem = null; render(); } }, 'Cancelar'))));
      return;
    }
    if (!user) {
      screen(
        section('Tu cuenta',
          h('p', {}, 'Estás usando la guía sin sesión y funciona entera. Si entras con Google, tus visitados, favoritos y checklist se guardan en la nube y los ves en todos tus dispositivos.'),
          privacy(),
          h('div', { class: 'account-actions' },
            signInButton(),
            signInPromptButton(),
            !online() ? h('p', {}, 'Para entrar hace falta internet. La guía sigue funcionando sin él.') : null,
            !auth ? h('p', {}, 'No se ha podido cargar el inicio de sesión ahora mismo.') : null)),
        proximity ? section('Lugares cercanos', proximity.settingNode()) : null,
        section('Datos de este dispositivo', ...resetRows()),
        versionLine()
      );
      return;
    }
    if (view === 'logout') {
      screen(section('¿Cerrar sesión?',
        h('p', {}, 'Tus datos siguen guardados en tu cuenta. En este dispositivo se mantienen visitados, favoritos y checklist, y seguirás usando la guía sin sesión.'),
        h('div', { class: 'account-actions' },
          h('button', { type: 'button', class: 'filter is-danger', onclick: () => signOut(false), disabled: busy }, 'Cerrar sesión'),
          h('button', { type: 'button', class: 'filter', onclick: () => signOut(true), disabled: busy }, 'Cerrar y borrar los datos de este dispositivo'),
          h('button', { type: 'button', class: 'filter', onclick: () => { view = 'main'; render(); } }, 'Cancelar'))));
      return;
    }
    const who = h('div', { class: 'account-who' },
      user.picture ? h('img', { class: 'account-avatar', src: user.picture, alt: '', referrerpolicy: 'no-referrer' }) : h('span', { class: 'account-avatar' }, (greetingName(user)[0] || '?').toUpperCase()),
      h('div', {}, h('strong', {}, user.name || greetingName(user)), h('span', {}, user.email || '')));
    screen(
      section('Cuenta y sincronización',
        who,
        h('div', { class: 'account-status', dataset: { sync: status.state }, role: 'status' }, statusText(status.state, { online: online(), lastSyncAt: status.lastSyncAt })),
        privacy(),
        h('div', { class: 'account-actions' },
          status.state === 'signed-out' ? signInButton() : h('button', { type: 'button', class: 'filter', onclick: () => sync.reconcile(), disabled: busy || !online() }, 'Sincronizar ahora'))),
      proximity ? section('Lugares cercanos', proximity.settingNode()) : null,
      section('Restablecer mis datos', ...resetRows()),
      isAdmin(user) ? adminSection() : null,
      h('div', { class: 'account-actions account-logout' }, h('button', { type: 'button', class: 'filter is-danger', onclick: () => { view = 'logout'; render(); } }, 'Cerrar sesión')),
      versionLine()
    );
  }

  /** Only for the administrator role: publish a notice for everyone (or withdraw it). The Worker re-checks the role from the signed ID token. */
  function adminSection() {
    if (!adminRead) { adminRead = true; loadNotices({ storage }).then(({ notices }) => { adminCurrent = notices.at(-1) ?? null; if (!popover.hidden) render(); }); }
    const field = (label, control) => h('label', {}, label, control);
    const input = (key, props) => { const el = h(props.tag ?? 'input', { ...props, tag: null, value: null }); el.value = adminDraft[key]; el.addEventListener('input', () => { adminDraft[key] = el.value; }); return el; };
    async function send(list, done) {
      adminBusy = true; adminMessage = ''; render();
      const result = await publishNotices(list, { getIdToken: () => auth.getIdToken() }).catch(() => ({ ok: false, reason: 'token' }));
      adminBusy = false;
      if (result.ok) { adminCurrent = list.at(-1) ?? null; adminMessage = done; if (list.length) { adminDraft.titulo = ''; adminDraft.texto = ''; } } else adminMessage = publishErrorText(result.reason);
      render();
    }
    return h('section', { class: 'account-section account-admin', dataset: { role: 'admin' } },
      h('h3', { class: 'account-subtitle' }, 'Administración'),
      h('div', { class: 'account-group admin-form' },
        h('strong', {}, 'Publicar un aviso para todos'),
        h('p', { class: 'muted small' }, 'Aparece en la parte superior de la app de cada persona la próxima vez que la abra. Texto público: sin PINs ni reservas.'),
        field('Título', input('titulo', { type: 'text', maxlength: MAX_TITLE, autocomplete: 'off' })),
        field('Texto', input('texto', { tag: 'textarea', maxlength: MAX_TEXT })),
        field('Caduca en', (() => { const select = h('select', {}, ...[['1', '1 día'], ['3', '3 días'], ['7', '7 días'], ['14', '14 días']].map(([v, l]) => h('option', { value: v }, l))); select.value = adminDraft.dias; select.addEventListener('change', () => { adminDraft.dias = select.value; }); return select; })()),
        h('div', { class: 'account-actions' },
          h('button', { type: 'button', class: 'filter', id: 'admin-publish', disabled: adminBusy || !online(), onclick: () => { if (!adminDraft.titulo.trim()) { adminMessage = 'Escribe un título.'; render(); return; } send([buildNotice(adminDraft)], 'Aviso publicado.'); } }, adminBusy ? 'Enviando…' : 'Publicar aviso'),
          adminCurrent ? h('button', { type: 'button', class: 'filter is-danger', id: 'admin-withdraw', disabled: adminBusy || !online(), onclick: () => send([], 'Aviso retirado.') }, 'Retirar aviso') : null),
        adminCurrent ? h('p', { class: 'admin-current' }, `Publicado: «${adminCurrent.titulo}»`) : null,
        adminMessage ? h('p', { class: 'muted small', role: 'status' }, adminMessage) : null));
  }

  /** "Versión de la app": installed and published versions plus «Buscar» / «Forzar actualización». One node, moved into each render (it listens to the updater). */
  function versionLine() { versionNode ??= updateSection(); return versionNode; }

  function renderInvite() {
    const invite = byId('account-invite');
    if (!invite) return;
    let dismissed = false;
    try { dismissed = storage?.getItem(INVITE_DISMISSED_KEY) === '1'; } catch { /* ignore */ }
    invite.hidden = Boolean(user) || dismissed || !auth;
    invite.replaceChildren();
    if (invite.hidden) return;
    invite.append(
      h('strong', {}, 'Guarda tus visitados y listas en la nube'),
      h('p', {}, 'Entra con Google para verlos también en tu ordenador. Es opcional.'),
      h('div', { class: 'account-actions' },
        signInButton(),
        h('button', { type: 'button', class: 'filter', onclick: () => { try { storage?.setItem(INVITE_DISMISSED_KEY, '1'); } catch { /* ignore */ } renderInvite(); } }, 'Ahora no'))
    );
  }

  function render() { renderButton(); renderGreeting(); renderPopover(); renderInvite(); }
  proximity?.onChange(() => { if (!popover.hidden && view === 'main') renderPopover(); });

  const OVERLAY = 'account';
  const hide = () => { popover.hidden = true; button.setAttribute('aria-expanded', 'false'); win.document.body.classList.remove('account-open'); };
  function setOpen(open) {
    if (open === !popover.hidden) return;
    if (open) {
      view = 'main'; resetItem = null; renderPopover();
      popover.hidden = false;
      button.setAttribute('aria-expanded', 'true');
      win.document.body.classList.add('account-open');
      openOverlay(OVERLAY, hide, win); // the Back button / swipe closes the screen instead of leaving the guide
      popover.querySelector('.account-back')?.focus();
    } else {
      hide();
      releaseOverlay(OVERLAY, win);
      button.focus();
    }
  }
  button.addEventListener('click', () => setOpen(popover.hidden));
  win.document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !popover.hidden) setOpen(false); });
  win.addEventListener('online', render);
  win.addEventListener('offline', render);

  async function signIn(withPrompt = false) {
    if (!auth || !online()) return;
    try { await userData.flush(); } catch { /* ignore */ }
    try { await (withPrompt ? auth.loginWithPrompt() : auth.login()); } catch (error) { console.warn('[account] login failed', error); toast('No se ha podido abrir el inicio de sesión.'); }
  }

  async function signOut(wipe) {
    busy = true; render();
    try {
      if (online() && sync) await Promise.race([sync.reconcile(), new Promise((resolve) => setTimeout(resolve, 3000))]);
      sync?.stop();
      userData.disconnect();
      userData.clearBase(); // the next account that signs in on this device starts from a plain union
      if (wipe && storage) {
        for (const key of [...SYNCED_KEYS, BACKUP_KEY, LAST_SYNC_KEY]) { try { storage.removeItem(key); } catch { /* ignore */ } }
      }
      await auth.logout();
    } catch (error) { busy = false; console.warn('[account] logout failed', error); toast('No se ha podido cerrar la sesión.'); render(); }
  }

  render();
  try { const done = win.sessionStorage.getItem(RESET_DONE_KEY); if (done) { win.sessionStorage.removeItem(RESET_DONE_KEY); toast(done); } } catch { /* ignore */ }
  return {
    user, markStarted() { started = true; },
    /** For tests and the QA thread. */
    get status() { return status; }
  };
}
