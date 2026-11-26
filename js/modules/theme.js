// Colour theme: "auto" follows the phone (prefers-color-scheme), "light" / "dark" force it.
// The choice lives in localStorage ("theme"). An inline script in index.html applies it before the first paint (no flash);
// this module only wires the header button and its popover. Colours themselves live in assets/theme.css.
export const THEME_KEY = 'theme';
export const THEMES = ['auto', 'light', 'dark'];
export const THEME_LABELS = { auto: 'automática', light: 'clara', dark: 'oscura' };
export const THEME_COLORS = { light: '#F7F5F0', dark: '#0E1A21' };

export const normalizeTheme = (value) => (value === 'light' || value === 'dark' ? value : 'auto');

export function readTheme(storage) {
  try { return normalizeTheme(storage.getItem(THEME_KEY)); } catch { return 'auto'; }
}

export function writeTheme(storage, theme) {
  try {
    if (normalizeTheme(theme) === 'auto') storage.removeItem(THEME_KEY);
    else storage.setItem(THEME_KEY, theme);
  } catch { /* private mode: the choice still applies to this visit */ }
}

/** Sets or clears <html data-theme>. Returns the normalized theme. */
export function applyTheme(root, theme) {
  const value = normalizeTheme(theme);
  if (value === 'auto') delete root.dataset.theme;
  else root.dataset.theme = value;
  return value;
}

export function initTheme({ win = window, doc = document } = {}) {
  const root = doc.documentElement;
  const button = doc.getElementById('theme-button');
  const popover = doc.getElementById('theme-popover');
  if (!button || !popover) return null;
  const options = [...popover.querySelectorAll('[data-theme-choice]')];
  const metas = [...doc.querySelectorAll('meta[name="theme-color"]')];
  const original = metas.map((meta) => meta.getAttribute('content'));
  let storage = null;
  try { storage = win.localStorage; } catch { /* blocked */ }

  function show(theme) {
    applyTheme(root, theme);
    metas.forEach((meta, index) => meta.setAttribute('content', theme === 'auto' ? original[index] : THEME_COLORS[theme]));
    options.forEach((option) => option.setAttribute('aria-checked', String(option.dataset.themeChoice === theme)));
    button.setAttribute('aria-label', `Apariencia: ${THEME_LABELS[theme]}`);
    const icon = popover.querySelector(`[data-theme-choice="${theme}"] svg`);
    const target = doc.getElementById('theme-button-icon');
    if (icon && target) target.innerHTML = icon.innerHTML;
  }
  const setOpen = (open) => {
    popover.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
    if (open) popover.querySelector('[aria-checked="true"]')?.focus();
    else button.focus();
  };

  show(storage ? readTheme(storage) : normalizeTheme(root.dataset.theme));
  button.addEventListener('click', () => setOpen(popover.hidden));
  options.forEach((option) => option.addEventListener('click', () => {
    const theme = normalizeTheme(option.dataset.themeChoice);
    if (storage) writeTheme(storage, theme);
    show(theme);
  }));
  doc.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !popover.hidden) setOpen(false); });
  doc.addEventListener('click', (event) => {
    if (!popover.hidden && !popover.contains(event.target) && !button.contains(event.target)) { popover.hidden = true; button.setAttribute('aria-expanded', 'false'); }
  });
  return { show };
}
