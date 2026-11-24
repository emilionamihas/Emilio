"use client";

import { motion, type Variants } from "framer-motion";
import { ArrowUpRight, Lightbulb, Sun, Users, Warehouse } from "lucide-react";
import { PulseDot } from "@/components/ui/PulseDot";
import { SportIcon } from "@/components/ui/SportIcon";
import { cn } from "@/lib/cn";
import { formatHour } from "@/lib/dates";
import { formatMoney } from "@/lib/pricing";
import type { LiveStatus } from "@/lib/slots";
import { SPORTS, SURFACE_LABEL } from "@/lib/sports";
import type { Court, SlotInfo } from "@/lib/types";

export const cardVariants: Variants = {
  hidden: { opacity: 0, y: 24, scale: 0.97 },
  show: { opacity: 1, y: 0, scale: 1, transition: { type: "spring", stiffness: 260, damping: 24 } },
};

export const LIVE_META: Record<LiveStatus, { label: string; color: string; pulse: boolean }> = {
  free: { label: "Sin uso ahora", color: "#10b981", pulse: true },
  playing: { label: "En juego", color: "#64748b", pulse: true },
  pending: { label: "Por confirmar", color: "#f59e0b", pulse: true },
  maintenance: { label: "Mantenimiento", color: "#e11d48", pulse: false },
  closed: { label: "Cerrado", color: "#64748b", pulse: false },
};

const SLOT_BAR: Record<SlotInfo["state"], string> = {
  available: "bg-futbol",
  pending: "bg-pending",
  booked: "bg-booked/60",
  maintenance: "bg-blocked/70",
  past: "bg-line",
};

interface Props {
  court: Court;
  slots: SlotInfo[];
  /** Estado en vivo (solo si la fecha elegida es hoy) */
  live?: LiveStatus;
  onSelect: () => void;
}

export function CourtCard({ court, slots, live, onSelect }: Props) {
  const theme = SPORTS[court.sport];
  const free = slots.filter((s) => s.state === "available");
  const next = free[0];
  const meta = live ? LIVE_META[live] : null;

  return (
    <motion.button
      variants={cardVariants}
      layout
      whileHover={{ y: -6, boxShadow: "var(--shadow-lift)" }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 380, damping: 26 }}
      onClick={onSelect}
      className="group relative flex flex-col overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface text-left outline-none focus-visible:ring-2 focus-visible:ring-padel"
      aria-label={`${court.name}, ${theme.label}. ${free.length} turnos libres`}
    >
      {/* Cabecera con color del deporte */}
      <div className={cn("relative h-24 overflow-hidden bg-gradient-to-br", theme.gradient)}>
        <CourtPattern sport={court.sport} />
        <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-black/25 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-white backdrop-blur">
          <SportIcon sport={court.sport} size={14} />
          {theme.label}
        </div>
        {meta && (
          <div className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-bold text-ink shadow-sm dark:bg-ink/90 dark:text-white">
            <PulseDot color={meta.color} pulse={meta.pulse} className="h-2 w-2" />
            {meta.label}
          </div>
        )}
        <motion.div
          className="absolute bottom-2.5 right-3 grid h-9 w-9 place-items-center rounded-full bg-white text-ink"
          initial={false}
          animate={{ rotate: 0 }}
          whileHover={{ rotate: 45 }}
        >
          <ArrowUpRight size={18} />
        </motion.div>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <h3 className="font-display text-lg font-black leading-tight tracking-tight">{court.name}</h3>
          <p className="mt-0.5 text-xs text-muted">
            {court.format} · {SURFACE_LABEL[court.surface]}
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5 text-[11px] font-semibold text-muted">
          <span className="inline-flex items-center gap-1 rounded-lg bg-surface-2 px-2 py-1">
            {court.covered ? <Warehouse size={13} /> : <Sun size={13} />}
            {court.covered ? "Techada" : "Aire libre"}
          </span>
          <span className="inline-flex items-center gap-1 rounded-lg bg-surface-2 px-2 py-1">
            <Lightbulb size={13} /> Iluminación LED
          </span>
          <span className="inline-flex items-center gap-1 rounded-lg bg-surface-2 px-2 py-1">
            <Users size={13} /> {court.capacity}
          </span>
        </div>

        {/* Mini barra de disponibilidad del día */}
        <div>
          <div className="flex gap-[3px]" aria-hidden="true">
            {slots.map((s) => (
              <span key={s.hour} className={cn("h-2 flex-1 rounded-full", SLOT_BAR[s.state])} />
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[10px] font-medium text-muted">
            <span>08</span>
            <span>16</span>
            <span>24</span>
          </div>
        </div>

        <div className="mt-auto flex items-end justify-between gap-2 border-t border-dashed border-line pt-3">
          <div>
            <p className="text-[11px] text-muted">Desde</p>
            <p className="font-display text-lg font-black leading-none">
              {formatMoney(court.dayRate)}
              <span className="text-xs font-semibold text-muted"> /h</span>
            </p>
            <p className="mt-1 text-[11px] text-muted">Noche {formatMoney(court.nightRate)}</p>
          </div>
          <div className="text-right">
            <p className={cn("text-sm font-bold", free.length ? theme.textDeep : "text-blocked")}>
              {free.length ? `${free.length} turnos libres` : live ? "Sin turnos hoy" : "Completo"}
            </p>
            {next && <p className="text-[11px] text-muted">Próximo: {formatHour(next.hour)}</p>}
          </div>
        </div>
      </div>
    </motion.button>
  );
}

/** Líneas de cancha estilizadas para la cabecera de la tarjeta */
function CourtPattern({ sport }: { sport: Court["sport"] }) {
  const stroke = "rgba(255,255,255,0.35)";
  return (
    <svg className="absolute inset-0 h-full w-full" viewBox="0 0 300 96" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      {sport === "futbol" && (
        <g fill="none" stroke={stroke} strokeWidth="2">
          <rect x="10" y="8" width="280" height="80" rx="4" />
          <line x1="150" y1="8" x2="150" y2="88" />
          <circle cx="150" cy="48" r="16" />
          <rect x="10" y="28" width="30" height="40" />
          <rect x="260" y="28" width="30" height="40" />
        </g>
      )}
      {sport === "basquet" && (
        <g fill="none" stroke={stroke} strokeWidth="2">
          <rect x="10" y="8" width="280" height="80" rx="4" />
          <line x1="150" y1="8" x2="150" y2="88" />
          <circle cx="150" cy="48" r="14" />
          <path d="M10 18 h30 a30 30 0 0 1 0 60 h-30" />
          <path d="M290 18 h-30 a30 30 0 0 0 0 60 h30" />
        </g>
      )}
      {sport === "tenis" && (
        <g fill="none" stroke={stroke} strokeWidth="2">
          <rect x="10" y="8" width="280" height="80" />
          <line x1="10" y1="20" x2="290" y2="20" />
          <line x1="10" y1="76" x2="290" y2="76" />
          <line x1="150" y1="4" x2="150" y2="92" strokeWidth="3" />
          <line x1="80" y1="20" x2="80" y2="76" />
          <line x1="220" y1="20" x2="220" y2="76" />
          <line x1="80" y1="48" x2="220" y2="48" />
        </g>
      )}
      {sport === "padel" && (
        <g fill="none" stroke={stroke} strokeWidth="2">
          <rect x="10" y="8" width="280" height="80" rx="2" />
          <line x1="150" y1="4" x2="150" y2="92" strokeWidth="3" />
          <line x1="60" y1="8" x2="60" y2="88" />
          <line x1="240" y1="8" x2="240" y2="88" />
          <line x1="60" y1="48" x2="240" y2="48" />
        </g>
      )}
    </svg>
  );
}
