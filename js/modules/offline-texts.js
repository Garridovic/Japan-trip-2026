// Every word the offline chip shows, in one place. Change a text here and nothing else.
// `label` is the full text; `short` is used on narrow phones (and hidden entirely under 360 px, where only the status dot remains).
export const OFFLINE_TEXTS = {
  ready:      { label: 'Funciona sin internet',   short: 'Sin internet',   aria: 'Guía guardada: funciona sin internet' },
  essentials: { label: 'Sin fotos grandes',       short: 'Sin fotos HD',   aria: 'Guía guardada para usar sin internet, faltan las fotos grandes' },
  saving:     { label: 'Guardando',               short: '',               aria: 'Descargando la guía para usarla sin internet' }, // adds the percentage
  installing: { label: 'Guardando…',              short: '…',              aria: 'Guardando la guía para usarla sin internet' },
  incomplete: { label: 'Descarga incompleta',     short: 'Incompleta',     aria: 'La copia para usar sin internet está incompleta: toca para repararla' },
  none:       { label: 'Descargar guía',          short: 'Descargar',      aria: 'Todavía no hay copia para usar sin internet: toca para descargarla' },
  network:    { label: 'Sin red · guía guardada', short: 'Sin red',        aria: 'Sin red ahora mismo: la guía funciona con lo guardado en el móvil' }
};
