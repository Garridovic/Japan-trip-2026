// App views: Guía (the city guide), Viaje, Frases and Platos (global). Pure URL helpers + the bottom bar controller.
export const VIEW_QUERY_PARAM = 'view';
export const VIEWS = ['guia', 'viaje', 'frases', 'platos'];
export const DEFAULT_VIEW = 'guia';

/** Returns a valid view id for a query string; anything unknown falls back to the guide. */
export function viewFromSearch(search) {
  const value = new URLSearchParams(search).get(VIEW_QUERY_PARAM);
  return VIEWS.includes(value) ? value : DEFAULT_VIEW;
}

/** Sets or clears the `view` param (the guide is the default, so it keeps the URL clean). */
export function withView(url, view) {
  const next = new URL(url);
  if (view === DEFAULT_VIEW) next.searchParams.delete(VIEW_QUERY_PARAM);
  else next.searchParams.set(VIEW_QUERY_PARAM, view);
  return next;
}

export function initViews(onSelect, doc = document) {
  const buttons = [...doc.querySelectorAll('[data-view-target]')];
  const panels = new Map([...doc.querySelectorAll('.app-view')].map((panel) => [panel.dataset.view, panel]));
  buttons.forEach((button) => button.addEventListener('click', () => onSelect(button.dataset.viewTarget)));
  return {
    setActive(view) {
      panels.forEach((panel, id) => { panel.hidden = id !== view; });
      buttons.forEach((button) => {
        if (button.dataset.viewTarget === view) button.setAttribute('aria-current', 'page');
        else button.removeAttribute('aria-current');
      });
      doc.body.dataset.view = view;
    }
  };
}
