"use client";

import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/cn";

/** Punto con onda expansiva para indicar estado en vivo */
export function PulseDot({ color, className, pulse = true }: { color: string; className?: string; pulse?: boolean }) {
  const reduce = useReducedMotion();
  return (
    <span className={cn("relative inline-flex h-2.5 w-2.5", className)}>
      {pulse && !reduce && (
        <motion.span
          className="absolute inset-0 rounded-full"
          style={{ backgroundColor: color }}
          initial={{ scale: 1, opacity: 0.6 }}
          animate={{ scale: 2.6, opacity: 0 }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
        />
      )}
      <span className="relative inline-flex h-full w-full rounded-full" style={{ backgroundColor: color }} />
    </span>
  );
}
