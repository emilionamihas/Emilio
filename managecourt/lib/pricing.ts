import type { Court } from "./types";

/** Desde esta hora se enciende la iluminación y rige la tarifa nocturna */
export const NIGHT_FROM_HOUR = 19;

export function isNightHour(hour: number): boolean {
  return hour >= NIGHT_FROM_HOUR;
}

export function hourPrice(court: Court, hour: number): number {
  return isNightHour(hour) ? court.nightRate : court.dayRate;
}

export interface PriceBreakdown {
  dayHours: number;
  nightHours: number;
  dayTotal: number;
  nightTotal: number;
  total: number;
}

export function priceRange(court: Court, startHour: number, endHour: number): PriceBreakdown {
  let dayHours = 0;
  let nightHours = 0;
  for (let h = startHour; h < endHour; h++) {
    if (isNightHour(h)) nightHours++;
    else dayHours++;
  }
  const dayTotal = dayHours * court.dayRate;
  const nightTotal = nightHours * court.nightRate;
  return { dayHours, nightHours, dayTotal, nightTotal, total: dayTotal + nightTotal };
}

/** Soles peruanos: S/ 120 (las tarifas son enteras, sin céntimos) */
const pen = new Intl.NumberFormat("es-PE", {
  style: "currency",
  currency: "PEN",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export function formatMoney(n: number): string {
  return pen.format(Math.round(n));
}

/** Formato compacto para la grilla de turnos: S/ 120 · S/ 12.5k */
export function formatMoneyShort(n: number): string {
  if (n >= 10_000) return `S/ ${(n / 1_000).toFixed(1)}k`;
  return `S/ ${Math.round(n)}`;
}
