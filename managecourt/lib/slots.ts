import { HOURS, isPastSlot } from "./dates";
import { hourPrice, isNightHour } from "./pricing";
import type { Block, Booking, Court, SlotInfo, Sport } from "./types";

/** Reservas que ocupan horario (las rechazadas/canceladas liberan el turno) */
export function isActive(b: Booking): boolean {
  return b.status === "pending" || b.status === "confirmed";
}

export function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export function findConflict(
  bookings: Booking[],
  blocks: Block[],
  courtId: string,
  date: string,
  start: number,
  end: number,
  ignoreBookingId?: string,
): { booking?: Booking; block?: Block } | null {
  const booking = bookings.find(
    (b) =>
      b.id !== ignoreBookingId &&
      isActive(b) &&
      b.courtId === courtId &&
      b.date === date &&
      overlaps(start, end, b.startHour, b.endHour),
  );
  if (booking) return { booking };
  const block = blocks.find(
    (k) => k.courtId === courtId && k.date === date && overlaps(start, end, k.startHour, k.endHour),
  );
  if (block) return { block };
  return null;
}

export function getDaySlots(
  court: Court,
  date: string,
  bookings: Booking[],
  blocks: Block[],
  now: Date,
): SlotInfo[] {
  const dayBookings = bookings.filter((b) => b.courtId === court.id && b.date === date && isActive(b));
  const dayBlocks = blocks.filter((k) => k.courtId === court.id && k.date === date);
  return HOURS.map((hour) => {
    const booking = dayBookings.find((b) => hour >= b.startHour && hour < b.endHour);
    const block = dayBlocks.find((k) => hour >= k.startHour && hour < k.endHour);
    let state: SlotInfo["state"] = "available";
    if (block) state = "maintenance";
    else if (booking) state = booking.status === "pending" ? "pending" : "booked";
    else if (isPastSlot(date, hour, now)) state = "past";
    return { hour, state, price: hourPrice(court, hour), isNight: isNightHour(hour), booking, block };
  });
}

export type LiveStatus = "free" | "playing" | "pending" | "maintenance" | "closed";

/** Estado de una cancha en una fecha/hora concreta (para croquis y badges “en vivo”) */
export function courtStatusAt(
  court: Court,
  date: string,
  hour: number,
  bookings: Booking[],
  blocks: Block[],
): { status: LiveStatus; booking?: Booking; block?: Block } {
  if (!HOURS.includes(hour)) return { status: "closed" };
  const block = blocks.find(
    (k) => k.courtId === court.id && k.date === date && hour >= k.startHour && hour < k.endHour,
  );
  if (block) return { status: "maintenance", block };
  const booking = bookings.find(
    (b) => b.courtId === court.id && b.date === date && isActive(b) && hour >= b.startHour && hour < b.endHour,
  );
  if (booking) return { status: booking.status === "pending" ? "pending" : "playing", booking };
  return { status: "free" };
}

/** Turnos libres que quedan desde `fromHour` */
export function freeSlotsCount(slots: SlotInfo[]): number {
  return slots.filter((s) => s.state === "available").length;
}

export interface SportOccupancy {
  sport: Sport;
  bookedHours: number;
  openHours: number;
  pct: number;
}

export function occupancyBySport(
  courts: Court[],
  date: string,
  bookings: Booking[],
  blocks: Block[],
): SportOccupancy[] {
  const map = new Map<Sport, { booked: number; open: number }>();
  for (const court of courts) {
    const entry = map.get(court.sport) ?? { booked: 0, open: 0 };
    for (const hour of HOURS) {
      const s = courtStatusAt(court, date, hour, bookings, blocks);
      if (s.status === "maintenance") continue;
      entry.open++;
      if (s.status === "playing") entry.booked++;
    }
    map.set(court.sport, entry);
  }
  return [...map.entries()].map(([sport, v]) => ({
    sport,
    bookedHours: v.booked,
    openHours: v.open,
    pct: v.open === 0 ? 0 : Math.round((v.booked / v.open) * 100),
  }));
}

export function amountDue(b: Booking): number {
  if (b.paymentStatus === "paid") return 0;
  if (b.paymentStatus === "deposit") return Math.max(0, b.amount - b.depositAmount);
  return b.amount;
}
