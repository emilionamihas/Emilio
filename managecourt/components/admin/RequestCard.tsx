"use client";

import { motion, type Variants } from "framer-motion";
import { Calendar, Check, Clock, CreditCard, MessageCircle, X } from "lucide-react";
import { useState } from "react";
import { SportIcon } from "@/components/ui/SportIcon";
import { cn } from "@/lib/cn";
import { formatRange, friendlyDate, todayISO } from "@/lib/dates";
import { formatMoney } from "@/lib/pricing";
import { PAYMENT_METHOD_LABEL, SPORTS } from "@/lib/sports";
import type { Booking, Court } from "@/lib/types";
import { bookingMessage, whatsappUrl } from "@/lib/whatsapp";

export type Decision = "approve" | "reject";

export const requestVariants: Variants = {
  hidden: { opacity: 0, y: 18, scale: 0.97 },
  show: { opacity: 1, y: 0, scale: 1, transition: { type: "spring", stiffness: 300, damping: 26 } },
  exit: (d: Decision | undefined) => ({
    opacity: 0,
    x: d === "reject" ? -80 : 80,
    scale: 0.9,
    transition: { duration: 0.32, ease: [0.4, 0, 1, 1] },
  }),
};

interface Props {
  booking: Booking;
  court: Court;
  decision?: Decision;
  onDecide: (d: Decision) => void;
  now: Date;
}

export function RequestCard({ booking, court, decision, onDecide, now }: Props) {
  const theme = SPORTS[court.sport];
  const minutes = Math.max(0, Math.round((now.getTime() - new Date(booking.createdAt).getTime()) / 60000));
  const isNew = minutes < 15;
  const [confirmReject, setConfirmReject] = useState(false);

  return (
    <motion.li
      layout
      custom={decision}
      variants={requestVariants}
      initial="hidden"
      animate="show"
      exit="exit"
      className="relative overflow-hidden rounded-3xl border border-line bg-surface"
    >
      {/* Flash de decisión */}
      {decision && (
        <motion.div
          className={cn("pointer-events-none absolute inset-0 z-10", decision === "approve" ? "bg-futbol/15" : "bg-blocked/12")}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        />
      )}
      <div className="flex">
        <div className="w-1.5 shrink-0" style={{ backgroundColor: theme.hex }} />
        {/* @container: los botones se adaptan al ancho de la tarjeta, no al de la pantalla */}
        <div className="@container min-w-0 flex-1 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="truncate font-bold">{booking.customerName}</p>
                {isNew && (
                  <motion.span
                    className="rounded-full bg-pending px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-ink"
                    animate={{ scale: [1, 1.08, 1] }}
                    transition={{ duration: 1.4, repeat: Infinity }}
                  >
                    Nuevo
                  </motion.span>
                )}
              </div>
              <p className="mt-0.5 flex items-center gap-1.5 text-sm font-semibold" style={{ color: theme.id === "tenis" ? "#65a30d" : theme.hex }}>
                <SportIcon sport={court.sport} size={15} />
                {theme.label} · {court.name}
              </p>
            </div>
            <div className="text-right">
              <p className="font-display text-xl font-black leading-none">{formatMoney(booking.amount)}</p>
              <p className="mt-1 text-[11px] text-muted">{minutes < 1 ? "recién" : `hace ${minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h`}`}</p>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted">
            <span className="flex items-center gap-1.5">
              <Calendar size={14} /> {capitalize(friendlyDate(booking.date, todayISO()))}
            </span>
            <span className="flex items-center gap-1.5">
              <Clock size={14} /> {formatRange(booking.startHour, booking.endHour)}
            </span>
            <span className="flex items-center gap-1.5">
              <CreditCard size={14} /> {PAYMENT_METHOD_LABEL[booking.paymentMethod]}
            </span>
          </div>

          <div className="mt-4 grid grid-cols-[auto_auto_1fr] gap-2 @[25rem]:grid-cols-[auto_1fr_1fr]">
            <motion.a
              whileTap={{ scale: 0.92 }}
              href={whatsappUrl(booking.phone, bookingMessage(booking, court))}
              target="_blank"
              rel="noopener noreferrer"
              className="grid h-11 w-11 place-items-center rounded-2xl bg-[#25d366] text-[#073b1d]"
              aria-label={`Abrir WhatsApp con ${booking.customerName} (${booking.phone})`}
              title={booking.phone}
            >
              <MessageCircle size={20} />
            </motion.a>

            {confirmReject ? (
              <>
                <DecisionButton tone="neutral" onClick={() => setConfirmReject(false)} disabled={!!decision}>
                  Volver
                </DecisionButton>
                <DecisionButton tone="reject" onClick={() => onDecide("reject")} disabled={!!decision} active={decision === "reject"}>
                  <X size={17} /> Confirmar
                </DecisionButton>
              </>
            ) : (
              <>
                <DecisionButton tone="reject" outline onClick={() => setConfirmReject(true)} disabled={!!decision} ariaLabel="Rechazar solicitud">
                  <X size={17} /> <span className="hidden @[25rem]:inline">Rechazar</span>
                </DecisionButton>
                <DecisionButton tone="approve" onClick={() => onDecide("approve")} disabled={!!decision} active={decision === "approve"}>
                  <Check size={17} /> <span className="@[16rem]:hidden">Aprobar</span>
                  <span className="hidden @[16rem]:inline">Aprobar reserva</span>
                </DecisionButton>
              </>
            )}
          </div>
        </div>
      </div>
    </motion.li>
  );
}

function DecisionButton({
  tone,
  outline,
  active,
  children,
  ariaLabel,
  ...rest
}: {
  tone: "approve" | "reject" | "neutral";
  outline?: boolean;
  active?: boolean;
  ariaLabel?: string;
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <motion.button
      type="button"
      whileHover={rest.disabled ? undefined : { y: -1 }}
      whileTap={rest.disabled ? undefined : { scale: 0.94 }}
      animate={active ? { scale: [1, 1.06, 1] } : undefined}
      aria-label={ariaLabel}
      className={cn(
        "relative inline-flex h-11 items-center justify-center gap-1.5 overflow-hidden whitespace-nowrap rounded-2xl px-3 text-[13px] font-bold transition-colors disabled:cursor-default @[25rem]:text-sm",
        tone === "approve" && "bg-futbol text-white",
        tone === "reject" && (outline ? "border border-blocked/40 text-blocked" : "bg-blocked text-white"),
        tone === "neutral" && "bg-surface-2 text-fg",
      )}
      {...rest}
    >
      {active && (
        <motion.span
          className="absolute inset-0 bg-white/25"
          initial={{ x: "-100%" }}
          animate={{ x: "100%" }}
          transition={{ duration: 0.5, ease: "easeInOut" }}
        />
      )}
      <span className="relative inline-flex items-center gap-1.5">{children}</span>
    </motion.button>
  );
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
