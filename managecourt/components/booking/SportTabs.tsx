"use client";

import { LayoutGroup, motion } from "framer-motion";
import { SportIcon } from "@/components/ui/SportIcon";
import { cn } from "@/lib/cn";
import { SPORTS, SPORT_ORDER } from "@/lib/sports";
import type { Sport } from "@/lib/types";

export type SportFilter = Sport | "all";

interface Props {
  value: SportFilter;
  onChange: (v: SportFilter) => void;
  counts?: Partial<Record<SportFilter, number>>;
  /** Identificador único para el layoutId (permite varias instancias) */
  id?: string;
}

/** Pestañas por deporte con indicador deslizante animado (layoutId). */
export function SportTabs({ value, onChange, counts, id = "sport-tabs" }: Props) {
  const tabs: { id: SportFilter; label: string; color: string; on: string }[] = [
    { id: "all", label: "Todos", color: "var(--fg)", on: "var(--bg)" },
    ...SPORT_ORDER.map((s) => ({ id: s as SportFilter, label: SPORTS[s].label, color: SPORTS[s].hex, on: SPORTS[s].onHex })),
  ];

  return (
    <LayoutGroup id={id}>
      <div
        role="tablist"
        aria-label="Filtrar por deporte"
        className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:px-0"
      >
        <div className="flex gap-1.5 rounded-[1.35rem] border border-line bg-surface p-1.5">
          {tabs.map((t) => {
            const active = value === t.id;
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={active}
                onClick={() => onChange(t.id)}
                className={cn(
                  "relative flex h-10 shrink-0 items-center gap-2 rounded-2xl px-3.5 text-sm font-semibold transition-colors",
                  !active && "text-muted hover:text-fg",
                )}
                style={active ? { color: t.on } : undefined}
              >
                {active && (
                  <motion.span
                    layoutId="indicator"
                    className="absolute inset-0 rounded-2xl"
                    style={{ backgroundColor: t.color }}
                    transition={{ type: "spring", stiffness: 420, damping: 32 }}
                  />
                )}
                <SportIcon sport={t.id} size={18} className="relative" />
                <span className="relative">{t.label}</span>
                {counts?.[t.id] !== undefined && (
                  <span
                    className={cn(
                      "relative rounded-full px-1.5 text-[11px] font-bold tabular-nums",
                      active ? "bg-black/15" : "bg-surface-2",
                    )}
                  >
                    {counts[t.id]}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </LayoutGroup>
  );
}
