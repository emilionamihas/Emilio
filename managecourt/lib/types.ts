/**
 * Modelo de dominio de ManageCourt.
 * Cada interfaz tiene su tabla espejo en supabase/schema.sql (snake_case).
 */

export type Sport = "futbol" | "basquet" | "tenis" | "padel";

export type Surface =
  | "cesped-sintetico"
  | "parquet"
  | "polvo-ladrillo"
  | "cemento"
  | "cesped-padel";

export interface MapRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Court {
  id: string;
  name: string;
  sport: Sport;
  surface: Surface;
  covered: boolean;
  /** Formato de juego, ej. "Fútbol 5" */
  format: string;
  capacity: number;
  /** Tarifa por hora en soles (S/) antes de encender la iluminación */
  dayRate: number;
  /** Tarifa por hora con iluminación (desde NIGHT_FROM_HOUR) */
  nightRate: number;
  /** Posición en el croquis del complejo (viewBox 1000 x 640) */
  map: MapRect;
}

export type BookingStatus = "pending" | "confirmed" | "rejected" | "cancelled";

export type PaymentStatus = "paid" | "deposit" | "unpaid";

export type PaymentMethod = "yape" | "plin" | "efectivo" | "transferencia" | "tarjeta";

export type BookingSource = "online" | "manual";

export interface Booking {
  id: string;
  courtId: string;
  /** Fecha local YYYY-MM-DD */
  date: string;
  /** Hora de inicio (entera, 0-23) */
  startHour: number;
  /** Hora de fin exclusiva */
  endHour: number;
  customerName: string;
  phone: string;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  /** Importe total calculado al reservar */
  amount: number;
  /** Adelanto recibido (si paymentStatus = deposit) */
  depositAmount: number;
  status: BookingStatus;
  source: BookingSource;
  /** Código corto del pase digital */
  passCode: string;
  createdAt: string;
  updatedAt: string;
}

export type BlockReason = "maintenance" | "tournament";

export interface Block {
  id: string;
  courtId: string;
  date: string;
  startHour: number;
  endHour: number;
  reason: BlockReason;
  note: string;
  createdAt: string;
}

/** Estado visible de un turno de una hora en la grilla */
export type SlotState =
  | "available"
  | "selected"
  | "pending"
  | "booked"
  | "maintenance"
  | "past";

export interface SlotInfo {
  hour: number;
  state: Exclude<SlotState, "selected">;
  price: number;
  isNight: boolean;
  booking?: Booking;
  block?: Block;
}

export interface BookingRequestInput {
  courtId: string;
  date: string;
  startHour: number;
  endHour: number;
  customerName: string;
  phone: string;
  paymentMethod: PaymentMethod;
}

export interface ManualBookingInput extends BookingRequestInput {
  paymentStatus: PaymentStatus;
  depositAmount?: number;
}

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };
