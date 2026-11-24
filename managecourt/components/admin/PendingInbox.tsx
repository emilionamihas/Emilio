"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Inbox } from "lucide-react";
import { useMemo, useState } from "react";
import { AnimatedNumber, RollingCount } from "@/components/ui/AnimatedNumber";
import { AnimatedCheck } from "@/components/ui/Celebration";
import { PulseDot } from "@/components/ui/PulseDot";
import { useNow } from "@/lib/hooks";
import { formatMoney } from "@/lib/pricing";
import { useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { RequestCard, type Decision } from "./RequestCard";

export function PendingInbox() {
  const now = useNow(15_000);
  const courts = useStore((s) => s.courts);
  const bookings = useStore((s) => s.bookings);
  const approve = useStore((s) => s.approveBooking);
  const reject = useStore((s) => s.rejectBooking);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});

  const pending = useMemo(
    () =>
      bookings
        .filter((b) => b.status === "pending")
        .sort((a, b) => a.date.localeCompare(b.date) || a.startHour - b.startHour),
    [bookings],
  );
  const pendingTotal = pending.reduce((n, b) => n + b.amount, 0);

  const decide = (id: string, d: Decision) => {
    // 1º se marca la decisión (anima botón y define la dirección de salida), luego se aplica
    setDecisions((s) => ({ ...s, [id]: d }));
    const b = pending.find((x) => x.id === id);
    setTimeout(() => {
      const res = d === "approve" ? approve(id) : reject(id);
      if (!res.ok) toast({ tone: "error", title: res.error });
      else
        toast(
          d === "approve"
            ? { tone: "success", title: "Reserva aprobada", description: `Pase ${b?.passCode} validado para ${b?.customerName}` }
            : { tone: "info", title: "Solicitud rechazada", description: "El horario quedó libre de inmediato." },
        );
    }, 450);
  };

  return (
    <section
      aria-labelledby="inbox-title"
      className="relative -mx-1 overflow-hidden rounded-[1.75rem] border border-pending/30 bg-gradient-to-b from-pending/10 to-transparent p-3 sm:mx-0 sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="relative grid h-12 w-12 place-items-center rounded-2xl bg-pending text-ink">
            <Inbox size={22} />
            {pending.length > 0 && (
              <span className="absolute -right-1.5 -top-1.5">
                <PulseDot color="#f59e0b" className="h-3.5 w-3.5" />
              </span>
            )}
          </div>
          <div>
            <h2 id="inbox-title" className="font-display text-xl font-black tracking-tight">
              Solicitudes por aprobar
            </h2>
            <p className="text-sm text-muted">
              <AnimatedNumber value={pendingTotal} format={formatMoney} className="font-semibold text-fg" /> en espera
            </p>
          </div>
        </div>
        <div className="flex items-baseline gap-1.5 rounded-2xl bg-surface px-4 py-2 shadow-sm">
          <span className="font-display text-3xl font-black tabular-nums text-pending">
            <RollingCount value={pending.length} />
          </span>
          <span className="text-xs font-semibold text-muted">nuevas</span>
        </div>
      </div>

      <ul className="mt-4 grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
        <AnimatePresence mode="popLayout" initial={false}>
          {pending.map((b) => {
            const court = courts.find((c) => c.id === b.courtId);
            if (!court) return null;
            return (
              <RequestCard
                key={b.id}
                booking={b}
                court={court}
                now={now}
                decision={decisions[b.id]}
                onDecide={(d) => decide(b.id, d)}
              />
            );
          })}
        </AnimatePresence>
      </ul>

      <AnimatePresence>
        {pending.length === 0 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center py-8 text-center"
          >
            <AnimatedCheck size={64} />
            <p className="mt-3 font-semibold">Bandeja al día</p>
            <p className="text-sm text-muted">Las nuevas solicitudes aparecen acá al instante.</p>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
