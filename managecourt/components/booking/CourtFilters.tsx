"use client";

import { LayoutGroup, motion } from "framer-motion";
import { Layers, Sun, Warehouse } from "lucide-react";
import { cn } from "@/lib/cn";
import { SURFACE_LABEL } from "@/lib/sports";
import type { Surface } from "@/lib/types";

export type CoverFilter = "all" | "covered" | "outdoor";

interface Props {
  cover: CoverFilter;
  onCover: (v: CoverFilter) => void;
  surfaces: Surface[];
  surface: Surface | "all";
  onSurface: (v: Surface | "all") => void;
}

export function CourtFilters({ cover, onCover, surfaces, surface, onSurface }: Props) {
  const coverOpts: { id: CoverFilter; label: string; icon: React.ReactNode }[] = [
    { id: "all", label: "Todas", icon: <Layers size={15} /> },
    { id: "covered", label: "Techadas", icon: <Warehouse size={15} /> },
    { id: "outdoor", label: "Aire libre", icon: <Sun size={15} /> },
  ];

  return (
    <div className="no-scrollbar -mx-4 flex items-center gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
      <LayoutGroup id="cover-filter">
        <div className="flex shrink-0 rounded-2xl border border-line bg-surface p-1">
          {coverOpts.map((o) => (
            <button
              key={o.id}
              onClick={() => onCover(o.id)}
              aria-pressed={cover === o.id}
              className={cn(
                "relative flex h-8 items-center gap-1.5 rounded-xl px-3 text-xs font-semibold transition-colors",
                cover === o.id ? "text-fg" : "text-muted hover:text-fg",
              )}
            >
              {cover === o.id && (
                <motion.span
                  layoutId="cover-pill"
                  className="absolute inset-0 rounded-xl bg-surface-2"
                  transition={{ type: "spring", stiffness: 480, damping: 34 }}
                />
              )}
              <span className="relative">{o.icon}</span>
              <span className="relative">{o.label}</span>
            </button>
          ))}
        </div>
      </LayoutGroup>

      <span className="mx-1 hidden h-6 w-px bg-line sm:block" />

      {(["all", ...surfaces] as const).map((s) => (
        <motion.button
          key={s}
          layout
          whileTap={{ scale: 0.94 }}
          onClick={() => onSurface(s)}
          aria-pressed={surface === s}
          className={cn(
            "h-10 shrink-0 rounded-2xl border px-3.5 text-xs font-semibold transition-colors",
            surface === s
              ? "border-fg bg-fg text-bg"
              : "border-line bg-surface text-muted hover:text-fg",
          )}
        >
          {s === "all" ? "Toda superficie" : SURFACE_LABEL[s]}
        </motion.button>
      ))}
    </div>
  );
}
