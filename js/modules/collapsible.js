// Filter panels that start collapsed on phones (so the content comes first) and open on wide screens.
export const WIDE_QUERY = '(min-width: 700px)';

export function initCollapsibles(win = window, doc = document) {
  const wide = win.matchMedia?.(WIDE_QUERY).matches ?? true;
  doc.querySelectorAll('details[data-open-on-wide]').forEach((details) => { details.open = wide; });
}

const CLOSE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';

/** Sets the label of a filter button: "Filtros" plus a round badge with the number of active filters. */
export function setFilterSummary(summary, count) {
  summary.textContent = 'Filtros';
  summary.setAttribute('aria-label', count ? `Filtros, ${count} ${count === 1 ? 'activo' : 'activos'}` : 'Filtros');
  if (!count) return;
  const badge = summary.ownerDocument.createElement('span');
  badge.className = 'filter-count';
  badge.setAttribute('aria-hidden', 'true');
  badge.textContent = String(count);
  summary.append(badge);
}

/**
 * Bottom of a filter sheet, like the map's: "Restablecer" (only while something is filtered) and "Ver N platos",
 * which closes the sheet. Created on the first call, then only its texts change.
 */
export function setSheetFooter(details, { shown, singular, plural, active, onReset }) {
  const doc = details.ownerDocument;
  let footer = details.querySelector(':scope > .sheet-footer');
  if (!footer) {
    footer = doc.createElement('div');
    footer.className = 'sheet-footer';
    footer.innerHTML = '<button type="button" class="sheet-reset">Restablecer</button><button type="button" class="map-sheet-apply sheet-apply"></button>';
    footer.querySelector('.sheet-apply').addEventListener('click', () => { details.open = false; details.querySelector('summary')?.focus(); });
    details.append(footer);
  }
  const reset = footer.querySelector('.sheet-reset');
  reset.onclick = onReset;
  reset.hidden = !active;
  footer.querySelector('.sheet-apply').textContent = `Ver ${shown} ${shown === 1 ? singular : plural}`;
}

/** Filter panels of Frases and Platos: a round-ish "Filtros" button that opens a bottom sheet, like the map. */
export function initFilterSheets(doc = document) {
  doc.querySelectorAll('details.is-sheet').forEach((details) => {
    const close = doc.createElement('button');
    close.type = 'button';
    close.className = 'sheet-close';
    close.setAttribute('aria-label', 'Cerrar filtros');
    close.innerHTML = CLOSE_ICON;
    close.addEventListener('click', () => { details.open = false; details.querySelector('summary')?.focus(); });
    details.append(close);
    doc.addEventListener('click', (event) => {
      if (details.open && !event.composedPath().includes(details)) details.open = false; // composedPath: a chip the sheet just re-rendered is already detached
    });
    doc.addEventListener('keydown', (event) => { if (event.key === 'Escape' && details.open) details.open = false; });
  });
}
