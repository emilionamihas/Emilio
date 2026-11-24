import { formatRange, friendlyDate, todayISO } from "./dates";
import { formatMoney } from "./pricing";
import type { Booking, Court } from "./types";

export function whatsappUrl(phone: string, text: string): string {
  const digits = phone.replace(/\D/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

export function bookingMessage(b: Booking, court: Court): string {
  const when = `${friendlyDate(b.date, todayISO())} ${formatRange(b.startHour, b.endHour)}`;
  const first = b.customerName.split(" ")[0];
  if (b.status === "confirmed") {
    return `¡Hola ${first}! Tu reserva en ManageCourt está confirmada: ${court.name}, ${when}. Total ${formatMoney(b.amount)}. Tu pase ${b.passCode} ya está validado. ¡Te esperamos!`;
  }
  return `¡Hola ${first}! Te escribimos de ManageCourt por tu solicitud en ${court.name} para ${when} (${formatMoney(b.amount)}).`;
}
