"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Ticket } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { todayISO } from "@/lib/dates";
import { useStore } from "@/lib/store";
import { DigitalPass } from "./DigitalPass";

type Tab = "upcoming" | "history";

export function MyPasses() {
  const myPassIds = useStore((s) => s.myPassIds);
  const bookings = useStore((s) => s.bookings);
  const courts = useStore((s) => s.courts);
  const [tab, setTab] = useState<Tab>("upcoming");
  const today = todayISO();

  const mine = useMemo(
    () =>
      myPassIds
        .map((id) => bookings.find((b) => b.id === id))
        .filter((b): b is NonNullable<typeof b> => !!b),
    [myPassIds, bookings],
  );
  const upcoming = mine
    .filter((b) => b.date >= today && (b.status === "pending" || b.status === "confirmed"))
    .sort((a, b) => a.date.localeCompare(b.date) || a.startHour - b.startHour);
  const history = mine.filter((b) => !upcoming.includes(b));
  const list = tab === "upcoming" ? upcoming : history;

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-black tracking-tight">Mis pases</h1>
          <p className="text-sm text-muted">Tus reservas con QR. El estado se actualiza solo cuando el complejo responde.</p>
        </div>
        <div className="flex rounded-2xl border border-line bg-surface p-1">
          {(["upcoming", "history"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn("relative h-9 rounded-xl px-4 text-sm font-semibold", tab === t ? "text-fg" : "text-muted")}
            >
              {tab === t && <motion.span layoutId="passes-tab" className="absolute inset-0 rounded-xl bg-surface-2" />}
              <span className="relative">
                {t === "upcoming" ? "Próximos" : "Historial"} ({t === "upcoming" ? upcoming.length : history.length})
              </span>
            </button>
          ))}
        </div>
      </header>

      {list.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center rounded-3xl border border-dashed border-line px-6 py-16 text-center"
        >
          <motion.div
            animate={{ rotate: [0, -8, 8, 0] }}
            transition={{ duration: 2.4, repeat: Infinity, repeatDelay: 1 }}
            className="grid h-16 w-16 place-items-center rounded-2xl bg-surface-2"
          >
            <Ticket size={28} className="text-muted" />
          </motion.div>
          <p className="mt-4 font-semibold">{tab === "upcoming" ? "Todavía no tenés reservas próximas" : "Sin historial"}</p>
          <p className="mt-1 max-w-xs text-sm text-muted">Los pases que solicites desde este dispositivo aparecen acá.</p>
          <Link href="/" className="mt-5 inline-flex h-11 items-center rounded-2xl bg-ink px-5 text-sm font-semibold text-white dark:bg-white dark:text-ink">
            Reservar una cancha
          </Link>
        </motion.div>
      ) : (
        <motion.div
          key={tab}
          className="grid gap-6 md:grid-cols-2 2xl:grid-cols-3"
          initial="hidden"
          animate="show"
          variants={{ show: { transition: { staggerChildren: 0.08 } } }}
        >
          <AnimatePresence>
            {list.map((b) => {
              const court = courts.find((c) => c.id === b.courtId);
              if (!court) return null;
              return (
                <motion.div
                  key={b.id}
                  layout
                  variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }}
                  exit={{ opacity: 0, scale: 0.95 }}
                >
                  <DigitalPass booking={b} court={court} cutout="bg" />
                </motion.div>
              );
            })}
          </AnimatePresence>
        </motion.div>
      )}
    </div>
  );
}
