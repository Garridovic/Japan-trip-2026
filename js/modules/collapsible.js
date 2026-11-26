// Filter panels that start collapsed on phones (so the content comes first) and open on wide screens.
export const WIDE_QUERY = '(min-width: 700px)';

export function initCollapsibles(win = window, doc = document) {
  const wide = win.matchMedia?.(WIDE_QUERY).matches ?? true;
  doc.querySelectorAll('details[data-open-on-wide]').forEach((details) => { details.open = wide; });
}
