"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { COURTS } from "./data/courts";
import { buildSeed } from "./data/seed";
import { todayISO } from "./dates";
import { makeId, makePassCode } from "./ids";
import { priceRange } from "./pricing";
import { findConflict } from "./slots";
import type {
  ActionResult,
  Block,
  BlockReason,
  Booking,
  BookingRequestInput,
  Court,
  ManualBookingInput,
  PaymentStatus,
} from "./types";

/**
 * Estado global de ManageCourt.
 *
 * Hoy persiste en localStorage y se sincroniza entre pestañas (ver StoreGate).
 * Para pasar a Supabase/PostgreSQL: cada acción de abajo es una mutación
 * atómica que se reemplaza por un insert/update + suscripción Realtime,
 * manteniendo la misma firma para que la UI no cambie.
 */
export interface ManageCourtState {
  courts: Court[];
  bookings: Booking[];
  blocks: Block[];
  /** Pases solicitados desde este dispositivo */
  myPassIds: string[];
  seededOn: string | null;
  hydrated: boolean;

  // Cliente
  requestBooking: (input: BookingRequestInput) => ActionResult<Booking>;

  // Gestor
  approveBooking: (id: string) => ActionResult;
  rejectBooking: (id: string) => ActionResult;
  cancelBooking: (id: string) => ActionResult;
  createManualBooking: (input: ManualBookingInput) => ActionResult<Booking>;
  moveBooking: (id: string, target: { courtId: string; date: string; startHour: number }) => ActionResult;
  setPaymentStatus: (id: string, status: PaymentStatus, depositAmount?: number) => ActionResult;
  addBlock: (input: {
    courtId: string;
    date: string;
    startHour: number;
    endHour: number;
    reason: BlockReason;
    note: string;
  }) => ActionResult<Block>;
  removeBlock: (id: string) => ActionResult;

  // Sistema
  seedIfEmpty: () => void;
  resetDemo: () => void;
  setHydrated: () => void;
}

// Clave nueva para la versión en soles: no reutiliza datos viejos guardados en pesos
const STORAGE_KEY = "managecourt-pe";

function conflictMessage(c: ReturnType<typeof findConflict>): string {
  if (!c) return "";
  if (c.block) return c.block.reason === "maintenance" ? "Ese horario está en mantenimiento." : "Ese horario está bloqueado por un torneo.";
  if (c.booking?.status === "pending") return "Alguien acaba de solicitar ese horario. Elige otro.";
  return "Ese horario ya está reservado.";
}

export const useStore = create<ManageCourtState>()(
  persist(
    (set, get) => ({
      courts: COURTS,
      bookings: [],
      blocks: [],
      myPassIds: [],
      seededOn: null,
      hydrated: false,

      requestBooking: (input) => {
        const { bookings, blocks, courts } = get();
        const court = courts.find((c) => c.id === input.courtId);
        if (!court) return { ok: false, error: "Cancha inexistente." };
        if (input.endHour <= input.startHour) return { ok: false, error: "Elige al menos un turno." };
        const conflict = findConflict(bookings, blocks, input.courtId, input.date, input.startHour, input.endHour);
        if (conflict) return { ok: false, error: conflictMessage(conflict) };
        const now = new Date().toISOString();
        const booking: Booking = {
          ...input,
          id: makeId("bkg"),
          amount: priceRange(court, input.startHour, input.endHour).total,
          depositAmount: 0,
          paymentStatus: "unpaid",
          status: "pending",
          source: "online",
          passCode: makePassCode(),
          createdAt: now,
          updatedAt: now,
        };
        set((s) => ({ bookings: [...s.bookings, booking], myPassIds: [booking.id, ...s.myPassIds] }));
        return { ok: true, data: booking };
      },

      approveBooking: (id) => {
        const b = get().bookings.find((x) => x.id === id);
        if (!b) return { ok: false, error: "Solicitud no encontrada." };
        if (b.status !== "pending") return { ok: false, error: "La solicitud ya fue procesada." };
        set((s) => ({
          bookings: s.bookings.map((x) =>
            x.id === id ? { ...x, status: "confirmed", updatedAt: new Date().toISOString() } : x,
          ),
        }));
        return { ok: true, data: undefined };
      },

      rejectBooking: (id) => {
        const b = get().bookings.find((x) => x.id === id);
        if (!b) return { ok: false, error: "Solicitud no encontrada." };
        set((s) => ({
          bookings: s.bookings.map((x) =>
            x.id === id ? { ...x, status: "rejected", updatedAt: new Date().toISOString() } : x,
          ),
        }));
        return { ok: true, data: undefined };
      },

      cancelBooking: (id) => {
        set((s) => ({
          bookings: s.bookings.map((x) =>
            x.id === id ? { ...x, status: "cancelled", updatedAt: new Date().toISOString() } : x,
          ),
        }));
        return { ok: true, data: undefined };
      },

      createManualBooking: (input) => {
        const { bookings, blocks, courts } = get();
        const court = courts.find((c) => c.id === input.courtId);
        if (!court) return { ok: false, error: "Cancha inexistente." };
        if (!input.customerName.trim()) return { ok: false, error: "Falta el nombre del cliente." };
        const conflict = findConflict(bookings, blocks, input.courtId, input.date, input.startHour, input.endHour);
        if (conflict) return { ok: false, error: conflictMessage(conflict) };
        const now = new Date().toISOString();
        const amount = priceRange(court, input.startHour, input.endHour).total;
        const booking: Booking = {
          courtId: input.courtId,
          date: input.date,
          startHour: input.startHour,
          endHour: input.endHour,
          customerName: input.customerName.trim(),
          phone: input.phone.trim(),
          paymentMethod: input.paymentMethod,
          paymentStatus: input.paymentStatus,
          depositAmount: input.paymentStatus === "deposit" ? Math.min(input.depositAmount ?? Math.round(amount / 2), amount) : 0,
          id: makeId("bkg"),
          amount,
          status: "confirmed",
          source: "manual",
          passCode: makePassCode(),
          createdAt: now,
          updatedAt: now,
        };
        set((s) => ({ bookings: [...s.bookings, booking] }));
        return { ok: true, data: booking };
      },

      moveBooking: (id, target) => {
        const { bookings, blocks, courts } = get();
        const b = bookings.find((x) => x.id === id);
        if (!b) return { ok: false, error: "Reserva no encontrada." };
        const court = courts.find((c) => c.id === target.courtId);
        if (!court) return { ok: false, error: "Cancha inexistente." };
        const len = b.endHour - b.startHour;
        const endHour = target.startHour + len;
        if (endHour > 24) return { ok: false, error: "La reserva no entra antes del cierre." };
        const conflict = findConflict(bookings, blocks, target.courtId, target.date, target.startHour, endHour, id);
        if (conflict) return { ok: false, error: conflictMessage(conflict) };
        const amount = priceRange(court, target.startHour, endHour).total;
        set((s) => ({
          bookings: s.bookings.map((x) =>
            x.id === id
              ? {
                  ...x,
                  courtId: target.courtId,
                  date: target.date,
                  startHour: target.startHour,
                  endHour,
                  amount,
                  depositAmount: Math.min(x.depositAmount, amount),
                  updatedAt: new Date().toISOString(),
                }
              : x,
          ),
        }));
        return { ok: true, data: undefined };
      },

      setPaymentStatus: (id, status, depositAmount) => {
        set((s) => ({
          bookings: s.bookings.map((x) =>
            x.id === id
              ? {
                  ...x,
                  paymentStatus: status,
                  depositAmount:
                    status === "deposit"
                      ? Math.min(depositAmount ?? (x.depositAmount || Math.round(x.amount / 2)), x.amount)
                      : 0,
                  updatedAt: new Date().toISOString(),
                }
              : x,
          ),
        }));
        return { ok: true, data: undefined };
      },

      addBlock: (input) => {
        const { bookings, blocks } = get();
        if (input.endHour <= input.startHour) return { ok: false, error: "Rango horario inválido." };
        const conflict = findConflict(bookings, blocks, input.courtId, input.date, input.startHour, input.endHour);
        if (conflict) {
          return {
            ok: false,
            error: conflict.block
              ? "Ya existe un bloqueo en ese rango."
              : "Hay reservas en ese rango. Muévelas o cancélalas antes de bloquear.",
          };
        }
        const block: Block = { ...input, id: makeId("blk"), createdAt: new Date().toISOString() };
        set((s) => ({ blocks: [...s.blocks, block] }));
        return { ok: true, data: block };
      },

      removeBlock: (id) => {
        set((s) => ({ blocks: s.blocks.filter((k) => k.id !== id) }));
        return { ok: true, data: undefined };
      },

      seedIfEmpty: () => {
        if (get().seededOn) return;
        const today = todayISO();
        const { bookings, blocks } = buildSeed(COURTS, today, new Date().getHours());
        set({ courts: COURTS, bookings, blocks, seededOn: today });
      },

      resetDemo: () => {
        const today = todayISO();
        const { bookings, blocks } = buildSeed(COURTS, today, new Date().getHours());
        set({ courts: COURTS, bookings, blocks, myPassIds: [], seededOn: today });
      },

      setHydrated: () => set({ hydrated: true }),
    }),
    {
      name: STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      // El servidor no conoce localStorage: hidratamos manualmente tras el montaje
      // para evitar diferencias entre el HTML del servidor y el del cliente.
      skipHydration: true,
      partialize: (s) => ({
        bookings: s.bookings,
        blocks: s.blocks,
        myPassIds: s.myPassIds,
        seededOn: s.seededOn,
      }),
    },
  ),
);

export const STORE_STORAGE_KEY = STORAGE_KEY;

export function courtById(courts: Court[], id: string): Court | undefined {
  return courts.find((c) => c.id === id);
}
