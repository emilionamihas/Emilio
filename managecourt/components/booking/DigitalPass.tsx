"use client";

import { AnimatePresence, motion } from "framer-motion";
import { CircleX, Hourglass, ShieldCheck } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { LogoMark } from "@/components/brand/Logo";
import { PulseDot } from "@/components/ui/PulseDot";
import { SportIcon } from "@/components/ui/SportIcon";
import { cn } from "@/lib/cn";
import { formatRange, friendlyDate, todayISO } from "@/lib/dates";
import { formatMoney } from "@/lib/pricing";
import { PAYMENT_METHOD_LABEL, SPORTS } from "@/lib/sports";
import type { Booking, Court } from "@/lib/types";

/** Contenido del QR: lo leería el lector de acceso al conectar el backend */
export function passPayload(b: Booking): string {
  return `MANAGECOURT|${b.passCode}|${b.id}|${b.courtId}|${b.date}|${b.startHour}-${b.endHour}`;
}

const STATUS = {
  pending: { label: "Pendiente de verificación", color: "#f59e0b", icon: Hourglass },
  confirmed: { label: "Verificado · Reserva confirmada", color: "#10b981", icon: ShieldCheck },
  rejected: { label: "Solicitud rechazada", color: "#e11d48", icon: CircleX },
  cancelled: { label: "Reserva cancelada", color: "#64748b", icon: CircleX },
} as const;

interface PassProps {
  booking: Booking;
  court: Court;
  compact?: boolean;
  /** Color del fondo donde se apoya el pase (para las muescas de perforación) */
  cutout?: "surface" | "bg";
}

export function DigitalPass({ booking, court, compact = false, cutout = "surface" }: PassProps) {
  const theme = SPORTS[court.sport];
  const status = STATUS[booking.status];
  const Icon = status.icon;
  const valid = booking.status === "confirmed";
  const voided = booking.status === "rejected" || booking.status === "cancelled";

  return (
    <motion.article
      layout
      className="relative mx-auto w-full max-w-sm overflow-hidden rounded-[1.6rem] bg-ink text-white shadow-[0_30px_60px_-30px_rgb(11_16_32/0.8)]"
      aria-label={`Pase digital ${booking.passCode}`}
    >
      {/* Encabezado de marca */}
      <div className={cn("relative bg-gradient-to-br px-5 pb-5 pt-4 court-lines", theme.gradient)}>
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <LogoMark size={28} />
            <span className="font-display text-sm font-black italic tracking-tight">ManageCourt</span>
          </span>
          <span className="rounded-full bg-black/25 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em]">
            Pase digital
          </span>
        </div>
        <div className="mt-4 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider opacity-85">
              <SportIcon sport={court.sport} size={14} /> {theme.label} · {court.format}
            </p>
            <p className="truncate font-display text-2xl font-black leading-tight">{court.name}</p>
          </div>
        </div>
      </div>

      {/* Perforación */}
      <div className="relative h-0">
        <span className={cn("absolute -left-3 -top-3 h-6 w-6 rounded-full", cutout === "bg" ? "bg-bg" : "bg-surface")} />
        <span className={cn("absolute -right-3 -top-3 h-6 w-6 rounded-full", cutout === "bg" ? "bg-bg" : "bg-surface")} />
      </div>

      <div className="space-y-4 px-5 pb-5 pt-5">
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <Field label="Fecha" value={capitalize(friendlyDate(booking.date, todayISO()))} />
          <Field label="Horario" value={formatRange(booking.startHour, booking.endHour)} />
          <Field label="Titular" value={booking.customerName} />
          <Field label="Total" value={formatMoney(booking.amount)} />
          {!compact && <Field label="Pago" value={PAYMENT_METHOD_LABEL[booking.paymentMethod]} />}
          {!compact && <Field label="Código" value={booking.passCode} mono />}
        </dl>

        <div className="flex items-center gap-4 rounded-2xl bg-white/5 p-3">
          <div className="relative shrink-0 rounded-xl bg-white p-2">
            <QRCodeSVG
              value={passPayload(booking)}
              size={compact ? 84 : 104}
              level="M"
              fgColor="#0b1020"
              bgColor="#ffffff"
              className={cn("transition-[filter,opacity] duration-500", !valid && "opacity-35 blur-[1.5px]")}
            />
            <AnimatePresence>
              {valid && (
                <motion.span
                  initial={{ scale: 0, rotate: -30 }}
                  animate={{ scale: 1, rotate: 0 }}
                  exit={{ scale: 0 }}
                  transition={{ type: "spring", stiffness: 400, damping: 18 }}
                  className="absolute -bottom-2 -right-2 grid h-8 w-8 place-items-center rounded-full bg-futbol text-white ring-4 ring-ink"
                >
                  <ShieldCheck size={16} />
                </motion.span>
              )}
            </AnimatePresence>
          </div>
          <div className="min-w-0">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={booking.status}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="flex items-center gap-2 text-sm font-bold"
                style={{ color: status.color }}
              >
                {booking.status === "pending" ? <PulseDot color={status.color} /> : <Icon size={16} />}
                <span>{status.label}</span>
              </motion.div>
            </AnimatePresence>
            <p className="mt-1 text-xs leading-relaxed text-white/60">
              {booking.status === "pending" && "El complejo revisa tu pedido. El QR se activa cuando lo aprueben."}
              {valid && "Mostrá este código en recepción al llegar."}
              {voided && "Este pase ya no es válido. Podés pedir otro horario."}
            </p>
            {compact && <p className="mt-2 font-mono text-xs tracking-wider text-white/80">{booking.passCode}</p>}
          </div>
        </div>
      </div>
    </motion.article>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/50">{label}</dt>
      <dd className={cn("truncate font-semibold", mono && "font-mono tracking-wider")}>{value}</dd>
    </div>
  );
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
