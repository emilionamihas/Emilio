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

const ars = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

export function formatMoney(n: number): string {
  return ars.format(Math.round(n));
}

/** Formato compacto para tarjetas: $45k */
export function formatMoneyShort(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1).replace(".", ",")}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}k`;
  return `$${n}`;
}
