"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Clock, Moon, SearchX } from "lucide-react";
import { useMemo, useState } from "react";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { PulseDot } from "@/components/ui/PulseDot";
import { friendlyDate, todayISO } from "@/lib/dates";
import { useNow } from "@/lib/hooks";
import { NIGHT_FROM_HOUR } from "@/lib/pricing";
import { courtStatusAt, getDaySlots } from "@/lib/slots";
import { SPORT_ORDER } from "@/lib/sports";
import { useStore } from "@/lib/store";
import type { Court, Surface } from "@/lib/types";
import { BookingSheet } from "./BookingSheet";
import { CourtCard } from "./CourtCard";
import { CourtFilters, type CoverFilter } from "./CourtFilters";
import { DateStrip } from "./DateStrip";
import { HeroAmbient, RotatingSport } from "./HeroMotion";
import { SportTabs, type SportFilter } from "./SportTabs";

export function BookingPortal() {
  const now = useNow();
  const today = todayISO();
  const courts = useStore((s) => s.courts);
  const bookings = useStore((s) => s.bookings);
  const blocks = useStore((s) => s.blocks);

  const [sport, setSport] = useState<SportFilter>("all");
  const [cover, setCover] = useState<CoverFilter>("all");
  const [surface, setSurface] = useState<Surface | "all">("all");
  const [date, setDate] = useState(today);
  const [openCourt, setOpenCourt] = useState<Court | null>(null);

  const bySport = useMemo(() => courts.filter((c) => sport === "all" || c.sport === sport), [courts, sport]);
  const surfaces = useMemo(() => [...new Set(bySport.map((c) => c.surface))], [bySport]);
  const activeSurface = surface !== "all" && !surfaces.includes(surface) ? "all" : surface;

  const filtered = useMemo(
    () =>
      bySport.filter(
        (c) =>
          (cover === "all" || (cover === "covered" ? c.covered : !c.covered)) &&
          (activeSurface === "all" || c.surface === activeSurface),
      ),
    [bySport, cover, activeSurface],
  );

  const counts = useMemo(() => {
    const out: Partial<Record<SportFilter, number>> = { all: courts.length };
    for (const s of SPORT_ORDER) out[s] = courts.filter((c) => c.sport === s).length;
    return out;
  }, [courts]);

  const hour = now.getHours();
  const freeNow = courts.filter((c) => courtStatusAt(c, today, hour, bookings, blocks).status === "free").length;
  const isToday = date === today;
  const timeLabel = now.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="space-y-5 lg:space-y-6">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-[1.75rem] bg-ink p-5 text-white court-lines sm:p-7 lg:p-8">
        <motion.div
          aria-hidden="true"
          className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-futbol/30 blur-3xl"
          animate={{ scale: [1, 1.15, 1], opacity: [0.6, 0.9, 0.6] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          aria-hidden="true"
          className="absolute -bottom-20 left-1/3 h-56 w-56 rounded-full bg-padel/30 blur-3xl"
          animate={{ scale: [1.1, 1, 1.1] }}
          transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
        />
        <HeroAmbient />
        <div className="relative flex flex-col gap-5 pb-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <motion.p
              className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-white/60"
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
            >
              <PulseDot color="#d4ff3a" /> En vivo · {timeLabel}
            </motion.p>
            <h1 className="mt-3 font-display text-3xl font-black leading-[1.05] tracking-tight sm:text-4xl lg:text-5xl">
              <motion.span
                className="block"
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: "spring", stiffness: 200, damping: 20, delay: 0.05 }}
              >
                Reserva tu cancha de
              </motion.span>
              <RotatingSport />
            </h1>
            <motion.p
              className="mt-3 max-w-md text-sm text-white/65"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.35 }}
            >
              Elige tu horario, pide tu turno en 30 segundos y recibe tu pase digital con QR.
            </motion.p>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <Stat i={0} value={freeNow} label="Libres ahora" color="#10b981" />
            <Stat i={1} value={courts.length} label="Canchas" color="#2563eb" />
            <Stat
              i={2}
              value={hour >= NIGHT_FROM_HOUR ? 1 : 0}
              label={hour >= NIGHT_FROM_HOUR ? "Luces ON" : `Noche ${NIGHT_FROM_HOUR}h`}
              color="#d4ff3a"
              icon={<Moon size={18} />}
            />
          </div>
        </div>
      </section>

      {/* Filtros */}
      <section className="space-y-3" aria-label="Filtros">
        <SportTabs value={sport} onChange={setSport} counts={counts} />
        <CourtFilters cover={cover} onCover={setCover} surfaces={surfaces} surface={activeSurface} onSurface={setSurface} />
      </section>

      <section className="space-y-3">
        <div className="flex items-end justify-between">
          <h2 className="font-display text-lg font-black tracking-tight">
            {capitalize(friendlyDate(date, today))}
            <span className="ml-2 text-sm font-semibold text-muted">· {filtered.length} canchas</span>
          </h2>
          <p className="hidden items-center gap-1.5 text-xs text-muted sm:flex">
            <Clock size={14} /> Turnos de 1 h · 08:00 a 00:00
          </p>
        </div>
        <DateStrip value={date} onChange={setDate} today={today} />
      </section>

      {/* Grilla de canchas */}
      <AnimatePresence mode="popLayout">
        {filtered.length === 0 ? (
          <motion.div
            key="empty"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center rounded-3xl border border-dashed border-line py-16 text-center"
          >
            <SearchX className="text-muted" size={32} />
            <p className="mt-3 font-semibold">No hay canchas con esos filtros</p>
            <button
              className="mt-2 text-sm font-semibold text-padel"
              onClick={() => {
                setCover("all");
                setSurface("all");
              }}
            >
              Limpiar filtros
            </button>
          </motion.div>
        ) : (
          <motion.div
            key={`${sport}-${cover}-${activeSurface}`}
            className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
            initial="hidden"
            animate="show"
            exit={{ opacity: 0, transition: { duration: 0.12 } }}
            variants={{ show: { transition: { staggerChildren: 0.06 } } }}
          >
            {filtered.map((court) => (
              <CourtCard
                key={court.id}
                court={court}
                slots={getDaySlots(court, date, bookings, blocks, now)}
                live={isToday ? courtStatusAt(court, today, hour, bookings, blocks).status : undefined}
                onSelect={() => setOpenCourt(court)}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <BookingSheet court={openCourt} date={date} onClose={() => setOpenCourt(null)} />
    </div>
  );
}

function Stat({ i, value, label, color, icon }: { i: number; value: number; label: string; color: string; icon?: React.ReactNode }) {
  return (
    <motion.div
      className="min-w-[92px] rounded-2xl bg-white/8 p-3 backdrop-blur sm:min-w-[110px]"
      initial={{ opacity: 0, y: 20, scale: 0.85 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      whileHover={{ y: -4, backgroundColor: "rgba(255,255,255,0.14)" }}
      transition={{ delay: 0.25 + i * 0.1, type: "spring", stiffness: 300, damping: 20 }}
    >
      <p className="font-display text-2xl font-black leading-none" style={{ color }}>
        {icon ?? <AnimatedNumber value={value} />}
      </p>
      <p className="mt-1.5 text-[11px] font-semibold text-white/60">{label}</p>
    </motion.div>
  );
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
