"use client";

import { motion } from "framer-motion";
import { CalendarRange, RotateCcw, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { DateStrip } from "@/components/booking/DateStrip";
import { friendlyDate, todayISO } from "@/lib/dates";
import { useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { DayMetrics } from "./DayMetrics";
import { PendingInbox } from "./PendingInbox";
import { UpcomingToday } from "./UpcomingToday";

export function AdminDashboard() {
  const today = todayISO();
  const [date, setDate] = useState(today);
  const resetDemo = useStore((s) => s.resetDemo);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Panel del gestor</p>
          <h1 className="font-display text-3xl font-black tracking-tight">Gestión del complejo</h1>
        </div>
        <div className="flex gap-2">
          <Link
            href="/admin/agenda"
            className="inline-flex h-11 items-center gap-2 rounded-2xl bg-ink px-4 text-sm font-semibold text-white dark:bg-white dark:text-ink"
          >
            <CalendarRange size={17} /> Agenda maestra
          </Link>
          <motion.button
            whileTap={{ rotate: -180, scale: 0.9 }}
            onClick={() => {
              if (!confirm("¿Restablecer los datos de prueba? Se pierden los cambios locales.")) return;
              resetDemo();
              toast({ tone: "info", title: "Datos de prueba restablecidos" });
            }}
            className="grid h-11 w-11 place-items-center rounded-2xl border border-line bg-surface text-muted hover:text-fg"
            aria-label="Restablecer datos de prueba"
            title="Restablecer datos de prueba"
          >
            <RotateCcw size={18} />
          </motion.button>
        </div>
      </header>

      <div className="flex items-start gap-2 rounded-2xl border border-line bg-surface-2/60 px-3.5 py-2.5 text-xs text-muted">
        <ShieldAlert size={15} className="mt-px shrink-0" />
        <span>
          Modo demo: el panel no tiene login y los datos viven en este navegador. Abrí la vista de reservas en otra pestaña y
          verás llegar las solicitudes acá al instante.
        </span>
      </div>

      <PendingInbox />

      <section className="space-y-3">
        <div className="flex items-end justify-between">
          <h2 className="font-display text-xl font-black tracking-tight">Métricas · {capitalize(friendlyDate(date, today))}</h2>
        </div>
        <DateStrip value={date} onChange={setDate} today={today} back={7} days={8} id="metrics-date" />
      </section>

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <DayMetrics date={date} />
        <UpcomingToday date={date} />
      </div>
    </div>
  );
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
