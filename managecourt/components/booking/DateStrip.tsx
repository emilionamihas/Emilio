"use client";

import { motion } from "framer-motion";
import { useEffect, useMemo, useRef } from "react";
import { cn } from "@/lib/cn";
import { addDays, dayNumber, monthShort, weekdayShort } from "@/lib/dates";

interface Props {
  value: string;
  onChange: (iso: string) => void;
  today: string;
  days?: number;
  /** Días hacia atrás (útil en la agenda del gestor) */
  back?: number;
  id?: string;
}

/** Selector de fecha horizontal deslizable con snap táctil. */
export function DateStrip({ value, onChange, today, days = 14, back = 0, id = "date-strip" }: Props) {
  const dates = useMemo(
    () => Array.from({ length: days + back }, (_, i) => addDays(today, i - back)),
    [today, days, back],
  );
  const ref = useRef<HTMLDivElement>(null);

  // Centra la fecha seleccionada
  useEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>(`[data-date="${value}"]`);
    el?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [value]);

  return (
    <div
      ref={ref}
      className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 py-1 sm:mx-0 sm:px-0"
      role="listbox"
      aria-label="Elegir fecha"
    >
      {dates.map((iso) => {
        const active = iso === value;
        const isToday = iso === today;
        const weekend = ["Sáb", "Dom"].includes(weekdayShort(iso));
        return (
          <motion.button
            key={iso}
            data-date={iso}
            role="option"
            aria-selected={active}
            onClick={() => onChange(iso)}
            whileTap={{ scale: 0.92 }}
            className={cn(
              "relative flex h-[76px] w-[60px] shrink-0 snap-center flex-col items-center justify-center rounded-2xl border transition-colors",
              active ? "border-transparent text-white dark:text-ink" : "border-line bg-surface text-fg",
              iso < today && !active && "opacity-60",
            )}
          >
            {active && (
              <motion.span
                layoutId={`${id}-active`}
                className="absolute inset-0 rounded-2xl bg-ink dark:bg-white"
                transition={{ type: "spring", stiffness: 420, damping: 32 }}
              />
            )}
            <span className={cn("relative text-[11px] font-semibold uppercase", !active && (weekend ? "text-basquet" : "text-muted"))}>
              {isToday ? "Hoy" : weekdayShort(iso)}
            </span>
            <span className="relative font-display text-xl font-black leading-tight">{dayNumber(iso)}</span>
            <span className={cn("relative text-[10px] uppercase", active ? "opacity-70" : "text-muted")}>{monthShort(iso)}</span>
          </motion.button>
        );
      })}
    </div>
  );
}
