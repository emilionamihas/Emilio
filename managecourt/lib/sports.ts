import type { BookingStatus, PaymentMethod, PaymentStatus, Sport, Surface } from "./types";

/**
 * Tokens visuales por deporte. Las clases son literales para que Tailwind las detecte.
 */
export interface SportTheme {
  id: Sport;
  label: string;
  short: string;
  hex: string;
  /** Color de texto legible sobre el color del deporte */
  onHex: string;
  bg: string;
  bgSoft: string;
  text: string;
  textDeep: string;
  border: string;
  ring: string;
  gradient: string;
}

export const SPORTS: Record<Sport, SportTheme> = {
  futbol: {
    id: "futbol",
    label: "Fútbol",
    short: "FÚT",
    hex: "#10b981",
    onHex: "#ffffff",
    bg: "bg-futbol",
    bgSoft: "bg-futbol-soft dark:bg-futbol/15",
    text: "text-futbol",
    textDeep: "text-futbol-deep dark:text-futbol",
    border: "border-futbol",
    ring: "ring-futbol",
    gradient: "from-futbol to-futbol-deep",
  },
  basquet: {
    id: "basquet",
    label: "Básquet",
    short: "BÁS",
    hex: "#f97316",
    onHex: "#ffffff",
    bg: "bg-basquet",
    bgSoft: "bg-basquet-soft dark:bg-basquet/15",
    text: "text-basquet",
    textDeep: "text-basquet-deep dark:text-basquet",
    border: "border-basquet",
    ring: "ring-basquet",
    gradient: "from-basquet to-basquet-deep",
  },
  tenis: {
    id: "tenis",
    label: "Tenis",
    short: "TEN",
    hex: "#c6e83a",
    onHex: "#1a2e05",
    bg: "bg-tenis",
    bgSoft: "bg-tenis-soft dark:bg-tenis/15",
    text: "text-tenis-deep dark:text-tenis",
    textDeep: "text-tenis-deep dark:text-tenis",
    border: "border-tenis",
    ring: "ring-tenis",
    gradient: "from-tenis to-tenis-deep",
  },
  padel: {
    id: "padel",
    label: "Pádel",
    short: "PÁD",
    hex: "#2563eb",
    onHex: "#ffffff",
    bg: "bg-padel",
    bgSoft: "bg-padel-soft dark:bg-padel/15",
    text: "text-padel",
    textDeep: "text-padel-deep dark:text-padel",
    border: "border-padel",
    ring: "ring-padel",
    gradient: "from-padel to-padel-deep",
  },
};

export const SPORT_ORDER: Sport[] = ["futbol", "basquet", "tenis", "padel"];

export const SURFACE_LABEL: Record<Surface, string> = {
  "cesped-sintetico": "Césped sintético",
  parquet: "Parquet",
  "polvo-ladrillo": "Polvo de ladrillo",
  cemento: "Cemento",
  "cesped-padel": "Césped de pádel",
};

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  efectivo: "Efectivo en cancha",
  transferencia: "Transferencia",
  mercadopago: "Mercado Pago",
  tarjeta: "Tarjeta",
};

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  paid: "Pagado",
  deposit: "Seña / Anticipo",
  unpaid: "Pendiente en cancha",
};

export const BOOKING_STATUS_LABEL: Record<BookingStatus, string> = {
  pending: "Pendiente de aprobación",
  confirmed: "Reservado",
  rejected: "Rechazado",
  cancelled: "Cancelado",
};
