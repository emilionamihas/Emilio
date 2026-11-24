"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Moon, Sun } from "lucide-react";
import { useCallback, useSyncExternalStore } from "react";
import { cn } from "@/lib/cn";

export const THEME_KEY = "mc-theme";

function subscribe(cb: () => void) {
  const obs = new MutationObserver(cb);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => obs.disconnect();
}

export function ThemeToggle({ className, withLabel = false }: { className?: string; withLabel?: boolean }) {
  const dark = useSyncExternalStore(
    subscribe,
    () => document.documentElement.classList.contains("dark"),
    () => false,
  );

  const toggle = useCallback(() => {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    document.documentElement.classList.toggle("light", !next);
    try {
      localStorage.setItem(THEME_KEY, next ? "dark" : "light");
    } catch {}
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", next ? "#070b16" : "#f4f6fa");
  }, []);

  return (
    <motion.button
      onClick={toggle}
      whileTap={{ scale: 0.92 }}
      className={cn(
        "inline-flex h-10 items-center gap-2 rounded-2xl px-3 text-sm font-semibold transition-colors",
        className,
      )}
      aria-label={dark ? "Activar modo claro" : "Activar modo oscuro"}
    >
      <span className="relative grid h-5 w-5 place-items-center overflow-hidden">
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={dark ? "moon" : "sun"}
            initial={{ y: 14, rotate: -60, opacity: 0 }}
            animate={{ y: 0, rotate: 0, opacity: 1 }}
            exit={{ y: -14, rotate: 60, opacity: 0 }}
            transition={{ duration: 0.22 }}
          >
            {dark ? <Moon size={18} /> : <Sun size={18} />}
          </motion.span>
        </AnimatePresence>
      </span>
      {withLabel && <span>{dark ? "Modo oscuro" : "Modo claro"}</span>}
    </motion.button>
  );
}
