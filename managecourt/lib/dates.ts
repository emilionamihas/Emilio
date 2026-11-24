/** Utilidades de fecha en hora local (sin dependencias). */

export const OPEN_HOUR = 8;
/** Último turno empieza a las 23:00 y termina a medianoche */
export const CLOSE_HOUR = 24;
export const HOURS: number[] = Array.from({ length: CLOSE_HOUR - OPEN_HOUR }, (_, i) => OPEN_HOUR + i);

const pad = (n: number) => String(n).padStart(2, "0");

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromISODate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(iso: string, days: number): string {
  const d = fromISODate(iso);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

export function todayISO(): string {
  return toISODate(new Date());
}

export function formatHour(h: number): string {
  return `${pad(h % 24)}:00`;
}

export function formatRange(start: number, end: number): string {
  return `${formatHour(start)} – ${formatHour(end)}`;
}

const WEEKDAY_SHORT = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const WEEKDAY_LONG = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MONTH_SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export function weekdayShort(iso: string): string {
  return WEEKDAY_SHORT[fromISODate(iso).getDay()];
}

export function dayNumber(iso: string): number {
  return fromISODate(iso).getDate();
}

export function monthShort(iso: string): string {
  return MONTH_SHORT[fromISODate(iso).getMonth()];
}

/** "Hoy", "Mañana" o "jueves 27 nov" */
export function friendlyDate(iso: string, today: string): string {
  if (iso === today) return "Hoy";
  if (iso === addDays(today, 1)) return "Mañana";
  if (iso === addDays(today, -1)) return "Ayer";
  const d = fromISODate(iso);
  return `${WEEKDAY_LONG[d.getDay()]} ${d.getDate()} ${MONTH_SHORT[d.getMonth()]}`;
}

export function isPastSlot(date: string, hour: number, now: Date): boolean {
  const today = toISODate(now);
  if (date < today) return true;
  if (date > today) return false;
  // El turno en curso ya no se puede reservar
  return hour <= now.getHours();
}
