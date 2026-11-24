"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { Hourglass, Lock, Moon, Wrench } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatHour } from "@/lib/dates";
import { formatMoneyShort } from "@/lib/pricing";
import type { SlotInfo, SlotState } from "@/lib/types";

export interface Range {
  start: number;
  end: number;
}

export const MAX_HOURS = 3;

/** Lógica de selección contigua: tocar extiende, recorta o reinicia el rango. */
export function nextRange(current: Range | null, hour: number, slots: SlotInfo[]): Range | null {
  const free = (h: number) => slots.find((s) => s.hour === h)?.state === "available";
  if (!free(hour) && !(current && hour >= current.start && hour < current.end)) return current;
  if (!current) return { start: hour, end: hour + 1 };
  const len = current.end - current.start;
  const inside = hour >= current.start && hour < current.end;
  if (inside) {
    if (len === 1) return null;
    if (hour === current.start) return { start: current.start + 1, end: current.end };
    if (hour === current.end - 1) return { start: current.start, end: current.end - 1 };
    return { start: hour, end: hour + 1 };
  }
  if (hour === current.end && len < MAX_HOURS) return { start: current.start, end: current.end + 1 };
  if (hour === current.start - 1 && len < MAX_HOURS) return { start: hour, end: current.end };
  return { start: hour, end: hour + 1 };
}

const STYLE: Record<SlotState, string> = {
  available: "border-line bg-surface text-fg hover:border-futbol/60",
  selected: "border-transparent text-white",
  pending: "border-pending/50 bg-pending/12 text-pending",
  booked: "border-transparent bg-surface-2 text-muted line-through decoration-muted/40",
  maintenance: "border-blocked/30 bg-blocked/8 text-blocked",
  past: "border-transparent bg-transparent text-muted/50",
};

export const SLOT_LEGEND: { state: SlotState; label: string; swatch: string }[] = [
  { state: "available", label: "Disponible", swatch: "bg-surface border border-line" },
  { state: "selected", label: "Seleccionado", swatch: "bg-ink dark:bg-white" },
  { state: "pending", label: "Pendiente de aprobación", swatch: "bg-pending" },
  { state: "booked", label: "Reservado", swatch: "bg-booked/50" },
  { state: "maintenance", label: "Mantenimiento / Torneo", swatch: "bg-blocked/70" },
];

interface Props {
  slots: SlotInfo[];
  range: Range | null;
  onChange: (r: Range | null) => void;
  accent: string;
  accentOn: string;
}

export function SlotPicker({ slots, range, onChange, accent, accentOn }: Props) {
  // Onda que nace donde se tocó el turno
  const [ripple, setRipple] = useState<{ hour: number; x: number; y: number; key: number } | null>(null);
  // Los turnos ya jugados no aportan nada al cliente: se ocultan
  const visible = slots.filter((s) => s.state !== "past");
  const hidden = slots.length - visible.length;
  if (visible.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-line py-10 text-center text-sm text-muted">
        No quedan turnos para este día. Elige otra fecha.
      </div>
    );
  }
  return (
    <div>
      {hidden > 0 && (
        <p className="mb-2 text-[11px] text-muted">
          {hidden === 1 ? "1 turno anterior ya pasó" : `${hidden} turnos anteriores ya pasaron`} · mostrando desde {formatHour(visible[0].hour)}
        </p>
      )}
      <motion.div
        className="grid grid-cols-3 gap-2 sm:grid-cols-4"
        initial="hidden"
        animate="show"
        variants={{ show: { transition: { staggerChildren: 0.018 } } }}
      >
        {visible.map((slot) => {
          const selected = !!range && slot.hour >= range.start && slot.hour < range.end;
          const state: SlotState = selected ? "selected" : slot.state;
          const interactive = slot.state === "available" || selected;
          return (
            <motion.button
              key={slot.hour}
              type="button"
              variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}
              whileTap={interactive ? { scale: 0.93 } : undefined}
              disabled={!interactive}
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                const x = e.clientX ? e.clientX - r.left : r.width / 2;
                const y = e.clientY ? e.clientY - r.top : r.height / 2;
                setRipple({ hour: slot.hour, x, y, key: Date.now() });
                onChange(nextRange(range, slot.hour, slots));
              }}
              aria-pressed={selected}
              aria-label={`${formatHour(slot.hour)}: ${labelFor(state)}`}
              className={cn(
                "relative flex h-[62px] flex-col items-center justify-center overflow-hidden rounded-2xl border text-sm font-bold transition-colors duration-300",
                STYLE[state],
                !interactive && "cursor-not-allowed",
              )}
              style={selected ? { color: accentOn } : undefined}
            >
              <AnimatePresence>
                {ripple?.hour === slot.hour && (
                  <motion.span
                    key={ripple.key}
                    className="pointer-events-none absolute z-10 h-10 w-10 rounded-full"
                    style={{ left: ripple.x - 20, top: ripple.y - 20, backgroundColor: selected ? "rgba(255,255,255,0.5)" : accent }}
                    initial={{ scale: 0, opacity: 0.45 }}
                    animate={{ scale: 5, opacity: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.6, ease: "easeOut" }}
                    onAnimationComplete={() => setRipple(null)}
                  />
                )}
              </AnimatePresence>
              {selected && (
                <motion.span
                  layoutId="slot-selected-bg"
                  className="absolute inset-0"
                  style={{ backgroundColor: accent }}
                  transition={{ type: "spring", stiffness: 500, damping: 38 }}
                />
              )}
              {state === "pending" && (
                <motion.span
                  className="absolute inset-0 bg-pending/20"
                  animate={{ opacity: [0.2, 0.8, 0.2] }}
                  transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
                />
              )}
              <span className="relative flex items-center gap-1 tabular-nums">
                {formatHour(slot.hour)}
                {slot.isNight && state !== "past" && <Moon size={11} className="opacity-70" />}
              </span>
              <span className="relative mt-0.5 flex items-center gap-1 text-[11px] font-semibold opacity-80">
                {state === "pending" && <Hourglass size={11} />}
                {state === "booked" && <Lock size={11} />}
                {state === "maintenance" && <Wrench size={11} />}
                {state === "available" || state === "selected"
                  ? formatMoneyShort(slot.price)
                  : state === "past"
                    ? "—"
                    : shortLabel(state)}
              </span>
            </motion.button>
          );
        })}
      </motion.div>

      <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-[11px] text-muted">
        {SLOT_LEGEND.map((l) => (
          <li key={l.state} className="flex items-center gap-1.5">
            <span
              className={cn("h-3 w-3 rounded", l.state !== "selected" && l.swatch)}
              style={l.state === "selected" ? { backgroundColor: accent } : undefined}
            />
            {l.label}
          </li>
        ))}
        <li className="flex items-center gap-1.5">
          <Moon size={12} /> Tarifa nocturna
        </li>
      </ul>
    </div>
  );
}

function labelFor(s: SlotState): string {
  return SLOT_LEGEND.find((l) => l.state === s)?.label ?? "No disponible";
}

function shortLabel(s: SlotState): string {
  if (s === "pending") return "Pendiente";
  if (s === "booked") return "Reservado";
  if (s === "maintenance") return "Bloqueado";
  return "";
}
