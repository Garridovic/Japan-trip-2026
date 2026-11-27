// Where the trip is for one city, in words ("Faltan 14 días", "Día 2 de 4"). Pure: takes the phone's date.
// Dates are ISO ("2026-12-11"); `arrival` is the first night, `departure` the day the traveller leaves.
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const WEEKDAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const dayNumber = (iso) => Math.round(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);
const parts = (iso) => { const [year, month, day] = iso.split('-').map(Number); return { year, month, day }; };
export const daysBetween = (fromIso, toIso) => dayNumber(toIso) - dayNumber(fromIso);
export const localISO = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export const addDays = (iso, count) => new Date((dayNumber(iso) + count) * 86_400_000).toISOString().slice(0, 10);
export const weekdayShort = (iso) => WEEKDAYS[new Date(`${iso}T00:00:00Z`).getUTCDay()];
export const dateShort = (iso) => `${parts(iso).day} ${MONTHS[parts(iso).month - 1]}`;

/** "11–15 dic" (same month) or "30 nov–2 dic". */
export function dateRange(arrival, departure) {
  const a = parts(arrival);
  const d = parts(departure);
  return a.month === d.month ? `${a.day}–${d.day} ${MONTHS[a.month - 1]}` : `${a.day} ${MONTHS[a.month - 1]}–${d.day} ${MONTHS[d.month - 1]}`;
}

export const nightsLabel = (nights) => (nights === 1 ? '1 noche' : `${nights} noches`);

/** { kind: 'before'|'during'|'after'|'unknown', label, nights, range } */
export function tripStatus({ arrival, departure }, now = new Date()) {
  if (!arrival || !departure) return { kind: 'unknown', label: '', nights: 0, range: '' };
  const today = localISO(now);
  const nights = Math.max(0, daysBetween(arrival, departure));
  const range = dateRange(arrival, departure);
  if (today < arrival) {
    const left = daysBetween(today, arrival);
    return { kind: 'before', nights, range, daysLeft: left, label: left === 1 ? 'Empieza mañana' : `Faltan ${left} días` };
  }
  if (today > departure) return { kind: 'after', nights, range, label: 'Viaje terminado' };
  if (today === departure) return { kind: 'during', nights, range, day: nights + 1, label: 'Día de salida' };
  const day = daysBetween(arrival, today) + 1;
  return { kind: 'during', nights, range, day, label: `Día ${day} de ${nights}` };
}
