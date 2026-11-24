"use client";

import { motion } from "framer-motion";
import { Activity, Hourglass, Wallet, CircleDollarSign } from "lucide-react";
import { useMemo } from "react";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { SportIcon } from "@/components/ui/SportIcon";
import { amountDue, occupancyBySport } from "@/lib/slots";
import { formatMoney } from "@/lib/pricing";
import { SPORTS } from "@/lib/sports";
import { useStore } from "@/lib/store";

export function DayMetrics({ date }: { date: string }) {
  const courts = useStore((s) => s.courts);
  const bookings = useStore((s) => s.bookings);
  const blocks = useStore((s) => s.blocks);

  const m = useMemo(() => {
    const day = bookings.filter((b) => b.date === date);
    const confirmed = day.filter((b) => b.status === "confirmed");
    const pending = day.filter((b) => b.status === "pending");
    const revenue = confirmed.reduce((n, b) => n + b.amount, 0);
    const due = confirmed.reduce((n, b) => n + amountDue(b), 0);
    const collected = revenue - due;
    const pendingAmount = pending.reduce((n, b) => n + b.amount, 0);
    const occ = occupancyBySport(courts, date, bookings, blocks);
    const totalOpen = occ.reduce((n, o) => n + o.openHours, 0);
    const totalBooked = occ.reduce((n, o) => n + o.bookedHours, 0);
    return {
      revenue,
      collected,
      due,
      pendingAmount,
      pendingCount: pending.length,
      confirmedCount: confirmed.length,
      occ,
      occPct: totalOpen ? Math.round((totalBooked / totalOpen) * 100) : 0,
    };
  }, [courts, bookings, blocks, date]);

  const cards = [
    {
      label: "Ingresos confirmados",
      value: m.revenue,
      sub: `${m.confirmedCount} reservas · cobrado ${formatMoney(m.collected)}`,
      icon: <Wallet size={20} />,
      color: "#10b981",
      money: true,
    },
    {
      label: "Pendiente por aprobar",
      value: m.pendingAmount,
      sub: `${m.pendingCount} solicitudes en espera`,
      icon: <Hourglass size={20} />,
      color: "#f59e0b",
      money: true,
    },
    {
      label: "Por cobrar en cancha",
      value: m.due,
      sub: "Saldos de adelantos e impagos",
      icon: <CircleDollarSign size={20} />,
      color: "#2563eb",
      money: true,
    },
    {
      label: "Ocupación general",
      value: m.occPct,
      sub: "Horas reservadas / horas operativas",
      icon: <Activity size={20} />,
      color: "#f97316",
      money: false,
    },
  ];

  return (
    <section aria-label="Métricas del día" className="space-y-4">
      <motion.div
        className="grid grid-cols-2 gap-3 xl:grid-cols-4"
        initial="hidden"
        animate="show"
        variants={{ show: { transition: { staggerChildren: 0.07 } } }}
      >
        {cards.map((c) => (
          <motion.div
            key={c.label}
            variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }}
            whileHover={{ y: -4 }}
            className="relative overflow-hidden rounded-3xl border border-line bg-surface p-4"
          >
            <div className="absolute -right-6 -top-6 h-20 w-20 rounded-full opacity-15 blur-xl" style={{ backgroundColor: c.color }} />
            <span className="grid h-10 w-10 place-items-center rounded-2xl" style={{ backgroundColor: `${c.color}1f`, color: c.color }}>
              {c.icon}
            </span>
            <p className="mt-3 text-xs font-semibold text-muted">{c.label}</p>
            <p className="font-display text-xl font-black tracking-tight sm:text-2xl">
              <AnimatedNumber value={c.value} format={c.money ? formatMoney : (n) => `${Math.round(n)}%`} />
            </p>
            <p className="mt-1 text-[11px] leading-snug text-muted">{c.sub}</p>
          </motion.div>
        ))}
      </motion.div>

      <div className="rounded-3xl border border-line bg-surface p-4 sm:p-5">
        <h3 className="font-display text-lg font-black tracking-tight">Ocupación por deporte</h3>
        <ul className="mt-4 space-y-4">
          {m.occ.map((o) => {
            const t = SPORTS[o.sport];
            return (
              <li key={o.sport}>
                <div className="mb-1.5 flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 font-semibold">
                    <span className="grid h-7 w-7 place-items-center rounded-lg" style={{ backgroundColor: t.hex, color: t.onHex }}>
                      <SportIcon sport={o.sport} size={15} />
                    </span>
                    {t.label}
                  </span>
                  <span className="tabular-nums text-muted">
                    {o.bookedHours}/{o.openHours} h ·{" "}
                    <AnimatedNumber value={o.pct} format={(n) => `${Math.round(n)}%`} className="font-bold text-fg" />
                  </span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-surface-2">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ backgroundColor: t.hex }}
                    initial={{ width: 0 }}
                    animate={{ width: `${o.pct}%` }}
                    transition={{ type: "spring", stiffness: 90, damping: 20 }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
